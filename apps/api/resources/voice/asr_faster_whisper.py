"""Bounded local CPU ASR. Model must already be installed; never downloads at runtime."""
import argparse
import json
from pathlib import Path
from faster_whisper import WhisperModel
import av
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--model", required=True)
parser.add_argument("--language", default="zh")
parser.add_argument("--threads", type=int, choices=[1, 2, 3, 4], default=2)
args = parser.parse_args()
if not Path(args.model).is_dir():
    raise SystemExit("ASR model directory not installed")
# Bound decoding before loading the model. Reject clips longer than a single browser turn.
duration = 0.0
samples = []
resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
with av.open(args.input) as container:
    for frame in container.decode(audio=0):
        duration += frame.samples / frame.sample_rate
        if duration > 65:
            raise SystemExit("ASR clip exceeds 65 seconds")
        samples.extend(converted.to_ndarray().reshape(-1) for converted in resampler.resample(frame))
samples.extend(converted.to_ndarray().reshape(-1) for converted in resampler.resample(None))
if not samples:
    raise SystemExit("ASR input has no audio frames")
audio = np.concatenate(samples).astype(np.float32, copy=False)
model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=args.threads,
                     num_workers=1, local_files_only=True)
# Feed bounded decoded samples through the supported ndarray interface. PyAV 19 removed
# metadata_errors from av.open, used by faster-whisper 1.2's path-based helper.
segments, info = model.transcribe(audio, language=None if args.language in ["", "auto"] else args.language,
                                  beam_size=3, vad_filter=True,
                                  condition_on_previous_text=False)
transcript_segments = [{"start": segment.start, "end": segment.end, "text": segment.text}
                       for segment in segments]
text = "".join(segment["text"] for segment in transcript_segments).strip()
Path(args.output).write_text(json.dumps({"text": text, "language": info.language, "duration": duration,
                                       "segments": transcript_segments},
                                      ensure_ascii=False), encoding="utf-8")
