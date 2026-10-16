"""Bounded DOCX main-body extraction. No archive paths are extracted or links fetched."""
import argparse
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

MAX_XML = 8 * 1024 * 1024
MAX_EXPANDED = 64 * 1024 * 1024
MAX_TEXT = 120000
MAX_PARAGRAPHS = 2000
NS = {"http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"}


class ParseFailure(Exception):
    def __init__(self, code):
        self.code = code


class BoundedTree(ET.TreeBuilder):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.elements = 0

    def start(self, tag, attributes):
        self.depth += 1
        self.elements += 1
        if self.depth > 100 or self.elements > 100000:
            raise ParseFailure("DOCX_LIMIT")
        return super().start(tag, attributes)

    def end(self, tag):
        result = super().end(tag)
        self.depth -= 1
        return result

    def doctype(self, name, pubid, system):
        raise ParseFailure("DOCX_XML_UNSAFE")


def xml_root(raw):
    return ET.fromstring(raw, parser=ET.XMLParser(target=BoundedTree()))


def name(tag):
    namespace, local = tag[1:].split("}", 1) if tag.startswith("{") and "}" in tag else ("", tag)
    return local if namespace in NS else ""


def read_entry(archive, info, limit):
    if info.file_size > limit:
        raise ParseFailure("DOCX_LIMIT")
    chunks = []
    total = 0
    with archive.open(info) as stream:
        while True:
            chunk = stream.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > limit:
                raise ParseFailure("DOCX_LIMIT")
            chunks.append(chunk)
    if total != info.file_size:
        raise ParseFailure("DOCX_INVALID")
    return b"".join(chunks)


def paragraph_text(paragraph):
    parts = []

    def visit(node):
        local = name(node.tag)
        if local == "del" or node is not paragraph and local == "p":
            return
        if local == "t":
            parts.append(node.text or "")
            return
        if local == "tab":
            parts.append("\t")
        elif local in {"br", "cr"}:
            parts.append("\n")
        for child in node:
            visit(child)

    visit(paragraph)
    return "".join(parts)


def utf16_length(text):
    return len(text.encode("utf-16-le")) // 2


def utf16_prefix(text, limit):
    return text.encode("utf-16-le")[:limit * 2].decode("utf-16-le", errors="ignore")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    original = Path(args.input)
    if not 1 <= original.stat().st_size <= 32 * 1024 * 1024:
        raise ParseFailure("DOCX_LIMIT")
    with zipfile.ZipFile(original) as archive:
        entries = archive.infolist()
        if len(entries) > 1000 or sum(entry.file_size for entry in entries) > MAX_EXPANDED:
            raise ParseFailure("DOCX_LIMIT")
        names = set()
        for entry in entries:
            if entry.filename in names or entry.filename.startswith("/") or "\\" in entry.filename or ".." in entry.filename.split("/"):
                raise ParseFailure("DOCX_INVALID")
            names.add(entry.filename)
            if entry.flag_bits & 1:
                raise ParseFailure("DOCX_ENCRYPTED")
            if entry.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED} or entry.file_size > MAX_EXPANDED or entry.filename.lower().endswith("vbaproject.bin"):
                raise ParseFailure("DOCX_INVALID")
        if "[Content_Types].xml" not in names or "word/document.xml" not in names:
            raise ParseFailure("DOCX_INVALID")
        content_types = xml_root(read_entry(archive, archive.getinfo("[Content_Types].xml"), 1024 * 1024))
        if not any(node.attrib.get("PartName") == "/word/document.xml" and node.attrib.get("ContentType") == "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" for node in content_types):
            raise ParseFailure("DOCX_INVALID")
        document = xml_root(read_entry(archive, archive.getinfo("word/document.xml"), MAX_XML))
    if name(document.tag) != "document":
        raise ParseFailure("DOCX_INVALID")
    body = next((child for child in document if name(child.tag) == "body"), None)
    if body is None:
        raise ParseFailure("DOCX_INVALID")
    paragraphs = [node for node in body.iter() if name(node.tag) == "p"]
    if len(paragraphs) > MAX_PARAGRAPHS:
        raise ParseFailure("DOCX_LIMIT")
    segments = []
    count = 0
    truncated = False
    for index, paragraph in enumerate(paragraphs, 1):
        text = paragraph_text(paragraph)
        if not text:
            continue
        remaining = MAX_TEXT - count - (2 if segments else 0)
        prefix = utf16_prefix(text, max(0, remaining))
        if prefix != text:
            truncated = True
        if remaining <= 0:
            truncated = True
            break
        segments.append({"page": None, "paragraph": index, "text": prefix})
        count += utf16_length(prefix) + (2 if len(segments) > 1 else 0)
        if truncated:
            break
    print(json.dumps({"engine": "python-stdlib-docx-body", "pageCount": None, "segments": segments, "textTruncated": truncated, "warnings": ["DOCX仅抽取主文档正文（含表格与文本框）；页眉页脚、脚注、批注与嵌入图片未解析，段落号不代表物理页码。"]}, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code = error.code if isinstance(error, ParseFailure) else "DOCX_INVALID"
        print(json.dumps({"code": code}), file=sys.stderr)
        sys.exit(1)
