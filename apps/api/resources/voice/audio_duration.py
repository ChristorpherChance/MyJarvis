"""Decode bounded audio frames to measure duration; never plays or retains audio."""
import argparse
import json
from pathlib import Path
import av

parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
seconds = 0.0
with av.open(args.input) as container:
    for frame in container.decode(audio=0):
        if not frame.sample_rate:
            raise SystemExit("Missing audio sample rate")
        seconds += frame.samples / frame.sample_rate
        if seconds > 600:
            raise SystemExit("Audio exceeds 10 minutes")
if seconds <= 0:
    raise SystemExit("Missing audio samples")
Path(args.output).write_text(json.dumps({"seconds": seconds}), encoding="utf-8")
