"""Local Chinese speech using an already installed Piper model; no runtime downloads."""
import argparse
import wave
from pathlib import Path
from piper import PiperVoice, SynthesisConfig

parser = argparse.ArgumentParser()
parser.add_argument('--text-file', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--model', required=True)
parser.add_argument('--speed', type=float, default=1.0)
args = parser.parse_args()
text = Path(args.text_file).read_text(encoding='utf-8').strip()
if not text or len(text) > 16000:
    raise SystemExit('Speech text is empty or too long')
if not 0.5 <= args.speed <= 2.0:
    raise SystemExit('Unsupported speech rate')
if not Path(args.model).is_file():
    raise SystemExit('Piper model is not installed')
voice = PiperVoice.load(args.model, use_cuda=False)
with wave.open(args.output, 'wb') as output:
    voice.synthesize_wav(text, output, syn_config=SynthesisConfig(length_scale=1.0 / args.speed))
