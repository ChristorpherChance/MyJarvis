"""Bounded UTF-8 HTML text extraction. No JavaScript, browser, URL or resource access."""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import sys

MAX_TEXT = 120000
MAX_PARAGRAPHS = 2000
IGNORED = {"script", "style", "noscript", "template", "svg", "nav", "footer", "header", "form", "button", "input", "select", "textarea", "aside", "canvas", "iframe", "object", "embed", "audio", "video", "head"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
BLOCKS = {"p", "div", "section", "article", "main", "body", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "blockquote", "pre", "table", "tr", "td", "th", "dl", "dt", "dd", "br", "hr"}


class ParseFailure(Exception):
    def __init__(self, code):
        self.code = code


def utf16_length(text):
    return len(text.encode("utf-16-le")) // 2


def utf16_prefix(text, limit):
    return text.encode("utf-16-le")[:limit * 2].decode("utf-16-le", errors="ignore")


class TextBucket:
    def __init__(self):
        self.parts = []
        self.pending = 0
        self.count = 0
        self.segments = []
        self.truncated = False

    def add(self, text):
        remaining = MAX_TEXT - self.count - self.pending
        if remaining <= 0:
            self.truncated = True
            return
        prefix = utf16_prefix(text, remaining)
        self.parts.append(prefix)
        self.pending += utf16_length(prefix)
        if prefix != text:
            self.truncated = True

    def flush(self):
        text = " ".join("".join(self.parts).split())
        self.parts = []
        self.pending = 0
        if not text:
            return
        remaining = MAX_TEXT - self.count - (2 if self.segments else 0)
        if remaining <= 0 or len(self.segments) >= MAX_PARAGRAPHS:
            self.truncated = True
            return
        prefix = utf16_prefix(text, remaining)
        self.segments.append({"page": None, "paragraph": len(self.segments) + 1, "text": prefix})
        self.count += utf16_length(prefix) + (2 if len(self.segments) > 1 else 0)
        if prefix != text:
            self.truncated = True


class BodyParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.nodes = 0
        self.buckets = {key: TextBucket() for key in ["article", "main", "body", "fragment"]}
        self.title = []

    def handle_starttag(self, tag, attrs):
        self.nodes += 1
        if self.nodes > 100000 or len(self.stack) >= 100:
            raise ParseFailure("HTML_LIMIT")
        if tag in BLOCKS:
            for bucket in self.buckets.values():
                bucket.flush()
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in BLOCKS:
            for bucket in self.buckets.values():
                bucket.flush()
        if tag in self.stack:
            index = len(self.stack) - 1 - self.stack[::-1].index(tag)
            del self.stack[index:]

    def handle_data(self, text):
        if "title" in self.stack and len("".join(self.title)) < 1000:
            self.title.append(text[:1000])
            return
        if any(tag in IGNORED for tag in self.stack):
            return
        self.buckets["fragment"].add(text)
        for key in ["article", "main", "body"]:
            if key in self.stack:
                self.buckets[key].add(text)

    def result(self):
        for bucket in self.buckets.values():
            bucket.flush()
        chosen = next((key for key in ["article", "main", "body", "fragment"] if self.buckets[key].segments), "fragment")
        bucket = self.buckets[chosen]
        title = " ".join("".join(self.title).split())[:500]
        return {"engine": "python-stdlib-html", "pageCount": None, "segments": bucket.segments, "textTruncated": bucket.truncated, "warnings": ["HTML按静态结构抽取正文；未运行JavaScript或请求资源，动态加载内容和导航、表单等非正文未纳入。", "正文选择：" + chosen], **({"title": title} if title else {})}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    original = Path(args.input)
    if not 1 <= original.stat().st_size <= 32 * 1024 * 1024:
        raise ParseFailure("HTML_LIMIT")
    try:
        raw = original.read_bytes().decode("utf-8-sig", errors="strict")
    except UnicodeDecodeError:
        raise ParseFailure("HTML_INVALID_UTF8")
    body = BodyParser()
    body.feed(raw)
    body.close()
    print(json.dumps(body.result(), ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code = error.code if isinstance(error, ParseFailure) else "HTML_INVALID"
        print(json.dumps({"code": code}), file=sys.stderr)
        sys.exit(1)
