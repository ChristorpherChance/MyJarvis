"""Create disposable original fixtures, never read or write user source documents."""
import argparse
from pathlib import Path
import pymupdf

parser = argparse.ArgumentParser()
parser.add_argument("--directory", required=True)
args = parser.parse_args()
target = Path(args.directory)
target.mkdir(parents=True, exist_ok=True)
doc = pymupdf.open()
page = doc.new_page(width=595, height=400)
page.insert_text((48, 80), "JARVIS STUDY", fontsize=32)
page.insert_text((48, 140), "Learning requires thought.", fontsize=22)
page.insert_text((48, 200), "学习与思考", fontname="china-s", fontsize=25)
doc.save(str(target / "text-original.pdf"))
pix = page.get_pixmap(dpi=144, alpha=False)
pix.save(str(target / "scan-original.png"))
pix.save(str(target / "scan-original.jpg"))
# An actual image-only PDF, distinct from the selectable-text original.
scan_pdf = pymupdf.open()
scan_page = scan_pdf.new_page(width=595, height=400)
scan_page.insert_image(scan_page.rect, stream=pix.tobytes("png"))
scan_pdf.save(str(target / "scan-original.pdf"))
# Absolute-page range fixture; the selected page carries its original page number.
batch_pdf = pymupdf.open()
for number in range(1, 4):
    batch_page = batch_pdf.new_page(width=595, height=400)
    batch_page.insert_text((48, 80), f"JARVIS PAGE {number}", fontsize=32)
    batch_page.insert_text((48, 140), "Learning requires thought.", fontsize=22)
    batch_page.insert_text((48, 200), "学习与思考", fontname="china-s", fontsize=25)
batch_pdf.save(str(target / "batch-original.pdf"))
blank_pdf = pymupdf.open()
blank_pdf.new_page(width=595, height=400)
blank_pdf.save(str(target / "blank-original.pdf"))
print("created six disposable originals")
