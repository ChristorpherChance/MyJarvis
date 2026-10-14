"""Offline fallback while a natural voice model is unavailable."""
import argparse
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--text-file', required=True)
p.add_argument('--output', required=True)
p.add_argument('--language', default='zh')
p.add_argument('--speed', type=float, default=1)
args = p.parse_args()
text = Path(args.text_file).read_text(encoding='utf-8')
if not 1 <= len(text) <= 16000 or not .5 <= args.speed <= 2:
    raise ValueError('Invalid synthesis input')
language = {'zh': 'cmn', 'auto': 'cmn', 'en': 'en-us', 'ja': 'ja', 'fr': 'fr', 'es': 'es'}.get(args.language, 'cmn')
subprocess.run(['/usr/bin/espeak-ng', '-v', language, '-s', str(round(160 * args.speed)), '-w', args.output, '-f', args.text_file], check=True, timeout=55)
if Path(args.output).stat().st_size < 44:
    raise ValueError('Empty synthesis output')
