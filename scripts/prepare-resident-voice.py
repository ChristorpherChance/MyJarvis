"""Explicit installation; models never download during a conversation."""
import hashlib,json,os,subprocess,tarfile,urllib.request
from pathlib import Path

ROOT=Path('/var/lib/jarvis/voice-models')
ROOT.mkdir(parents=True,exist_ok=True)
assets=[
 ('asr-models','sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09','7305f7905bfcf77fa0b39388a313f3da35c68d971661a65475b56fb2162c8e63'),
 ('tts-models','kokoro-int8-multi-lang-v1_1','a1e94694776049035c4f2c6529f003aaece993c76aae9a78995831c3c4dcafc6'),
 ('kws-models','sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20','68447f4fbc67e70eee3a93961f36e81e98f47aef73ce7e7ca00885c6cd3616a6'),
 ('tts-models','matcha-icefall-zh-en','271b804af570400d3bcdcb53bf6e53cc9f75180ee763b9f13eb5eaf2b0d086ef'),
]
for tag,name,digest in assets:
 archive=ROOT/(name+'.tar.bz2')
 if not archive.exists():
  partial=archive.with_suffix('.partial')
  with urllib.request.urlopen('https://github.com/k2-fsa/sherpa-onnx/releases/download/'+tag+'/'+archive.name,timeout=60) as response,partial.open('wb') as output:
   while chunk:=response.read(1024*1024):output.write(chunk)
  if hashlib.file_digest(partial.open('rb'),'sha256').hexdigest()!=digest:raise RuntimeError('Model digest mismatch')
  partial.replace(archive)
 if hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()!=digest:raise RuntimeError('Existing archive digest mismatch')
 if not (ROOT/name).is_dir():
  with tarfile.open(archive) as source:source.extractall(ROOT,filter='data')
 print(json.dumps({'model':name,'verified':True}),flush=True)
vocoder=ROOT/'vocos-16khz-univ.onnx'
if not vocoder.exists():
 with urllib.request.urlopen('https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/vocos-16khz-univ.onnx',timeout=60) as response,vocoder.with_suffix('.partial').open('wb') as output:
  while chunk:=response.read(1024*1024):output.write(chunk)
 vocoder.with_suffix('.partial').replace(vocoder)
if hashlib.file_digest(vocoder.open('rb'),'sha256').hexdigest()!='b599142a1fb8ff03de3e84ac35ff537c619e56f4267a6fe894851a42844acf9e':raise RuntimeError('Vocoder digest mismatch')
vad=ROOT/'silero_vad.onnx'
if not vad.exists():
 with urllib.request.urlopen('https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',timeout=60) as response,vad.with_suffix('.partial').open('wb') as output:output.write(response.read(2*1024*1024))
 if hashlib.file_digest(vad.with_suffix('.partial').open('rb'),'sha256').hexdigest()!='9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6':raise RuntimeError('VAD digest mismatch')
 vad.with_suffix('.partial').replace(vad)
if hashlib.file_digest(vad.open('rb'),'sha256').hexdigest()!='9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6':raise RuntimeError('Existing VAD digest mismatch')
subprocess.run(['/opt/jarvis/venv/bin/python','-m','venv','/opt/jarvis/voice-venv'],check=True)
subprocess.run(['/opt/jarvis/voice-venv/bin/python','-m','pip','install','--disable-pip-version-check','sherpa-onnx==1.13.8','numpy==2.2.6','av==19.0.0','pypinyin==0.55.0','sentencepiece==0.2.1'],check=True)
subprocess.run(['chgrp','-R','jarvis',str(ROOT),'/opt/jarvis/voice-venv'],check=True)
subprocess.run(['chmod','-R','g+rX',str(ROOT),'/opt/jarvis/voice-venv'],check=True)
print(json.dumps({'ready':True}),flush=True)
