"""One bounded extraction pass over an owned original. stdout is protocol JSON only.

RapidOCR 1.4.4 bundles its small Chinese/English CPU ONNX models. No model download
or recursive filesystem access occurs here. All machine text remains unreviewed.
"""
import argparse
import csv
import io
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
import tempfile

current_stage = "startup"


def main():
    global current_stage
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    parser.add_argument("--mime")
    parser.add_argument("--round", type=int, default=1)
    parser.add_argument("--health", action="store_true")
    parser.add_argument("--max-pages", type=int, default=200)
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--end-page", type=int)
    parser.add_argument("--cpu-threads", type=int, choices=[1, 2], default=2)
    parser.add_argument("--engine", choices=["rapidocr", "tesseract"], default="rapidocr")
    parser.add_argument("--language", default="chi_sim+eng")
    parser.add_argument("--tesseract", default="tesseract")
    args = parser.parse_args()
    current_stage = "dependencies"
    import pymupdf
    import numpy as np
    import cv2
    cv2.setNumThreads(args.cpu_threads)
    cv2.ocl.setUseOpenCL(False)

    if args.health:
        from rapidocr_onnxruntime import RapidOCR
        import rapidocr_onnxruntime
        models = list((Path(rapidocr_onnxruntime.__file__).parent / "models").glob("*.onnx"))
        print(json.dumps({"available": len(models) >= 3, "pymupdf": importlib.metadata.version("PyMuPDF"), "rapidocr": importlib.metadata.version("rapidocr-onnxruntime"), "packagedModels": len(models), "modelBytes": sum(path.stat().st_size for path in models), "cpuThreads": args.cpu_threads, "tesseractAvailable": bool(shutil.which(args.tesseract))}))
        return
    if not args.input or not args.mime:
        raise ValueError("An owned original and MIME are required")

    original = Path(args.input)
    current_stage = "original"
    doc = pymupdf.open(stream=original.read_bytes(), filetype="pdf" if args.mime == "application/pdf" else args.mime.split("/")[1])
    if doc.needs_pass:
        raise ValueError("Encrypted document requires an unlocked original")
    end_page = args.end_page if args.end_page is not None else len(doc)
    if not 1 <= len(doc) <= 10000 or not 1 <= args.start_page <= end_page <= len(doc) or end_page - args.start_page + 1 > args.max_pages:
        raise ValueError("Document or batch exceeds the configured page limits")
    engine = None
    result = []
    # Different passes change raster size and detection threshold, never silently edit text.
    dpi = 144 + 36 * min(args.round - 1, 3)
    for number in range(args.start_page, end_page + 1):
        current_stage = "page-text"
        page = doc[number - 1]
        embedded = page.get_text("text", sort=True) if args.mime == "application/pdf" else ""
        if embedded.strip() and args.round == 1:
            blocks = [{"text": str(w[4]), "confidence": None, "box": [float(v) for v in w[:4]], "coordinateSystem": "pdf-points"} for w in page.get_text("words", sort=True)]
            result.append({"page": number, "text": embedded, "engine": "pymupdf-embedded-text", "blocks": blocks, "warnings": []})
            continue
        # Bound raster memory even for unusually large scans.
        current_stage = "page-render"
        scale = min(dpi / 72, 3200 / max(page.rect.width, page.rect.height))
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), colorspace=pymupdf.csRGB, alpha=False)
        if args.engine == "rapidocr":
            if engine is None:
                current_stage = "engine-init"
                from rapidocr_onnxruntime import RapidOCR
                engine = RapidOCR(intra_op_num_threads=args.cpu_threads, inter_op_num_threads=args.cpu_threads, text_score=0.0, print_verbose=False)
            current_stage = "recognition"
            image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)[:, :, ::-1].copy()
            rows, _ = engine(image, use_cls=True, box_thresh=0.45 + 0.025 * min(args.round - 1, 3), text_score=0.0)
            blocks = []
            for row in rows or []:
                polygon, text, confidence = row
                # Pixel coordinates are transformed back to original document points.
                points = [[float(p[0]) / scale, float(p[1]) / scale] for p in polygon]
                blocks.append({"text": text, "confidence": float(confidence), "polygon": points, "coordinateSystem": "pdf-points"})
            text = "\n".join(item["text"] for item in blocks)
            used = "rapidocr-onnxruntime-1.4.4-cpu"
        else:
            with tempfile.TemporaryDirectory(prefix="jarvis-tesseract-page-") as temp:
                png = Path(temp) / "page.png"
                pix.save(str(png))
                process = subprocess.run([args.tesseract, str(png), "stdout", "-l", args.language, "--psm", str(3 if args.round % 2 else 6), "tsv"], capture_output=True, timeout=120, check=True, encoding="utf-8")
                lines = {}
                blocks = []
                for row in csv.DictReader(io.StringIO(process.stdout), delimiter="\t"):
                    if not row.get("text", "").strip():
                        continue
                    key = (row["block_num"], row["par_num"], row["line_num"])
                    lines.setdefault(key, []).append(row["text"])
                    x, y, w, h = [float(row[k]) / scale for k in ["left", "top", "width", "height"]]
                    blocks.append({"text": row["text"], "confidence": max(0, float(row["conf"]) / 100), "box": [x, y, x + w, y + h], "coordinateSystem": "pdf-points"})
                text = "\n".join(" ".join(words) for words in lines.values())
                used = "tesseract-cli"
        result.append({"page": number, "text": text, "engine": used, "blocks": blocks, "warnings": [] if text.strip() else ["No text recognized; inspect the original manually"]})
    print(json.dumps({"pages": result, "pageCount": len(doc), "startPage": args.start_page, "endPage": end_page, "round": args.round}, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # No scan content or credentials are echoed in failures.
        print(json.dumps({"error": type(error).__name__, "stage": current_stage, "message": "Local document extraction failed; check engine dependencies and original"}), file=sys.stderr)
        sys.exit(1)
