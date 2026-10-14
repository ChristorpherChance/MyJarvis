"""Fetch only the official, pinned tiny ASR model data. No remote Python code is executed."""
import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / '.jarvis' / 'runtime' / 'models' / 'whisper-tiny'
REPO = 'Systran/faster-whisper-tiny'
REVISION = 'd90ca5fe260221311c53c58e660288d3deb8d356'
BASE = 'https://huggingface.co'
def request(url, start=0):
    headers = {'User-Agent': 'Jarvis-local-runtime-setup/1.0'}
    if start: headers['Range'] = f'bytes={start}-'
    return urlopen(Request(url, headers=headers), timeout=60)

def main():
    with request(f'{BASE}/api/models/{REPO}/revision/{REVISION}?blobs=true') as response:
        metadata = json.load(response)
    revision = metadata['sha']
    if len(revision) != 40 or not all(c in '0123456789abcdef' for c in revision):
        raise ValueError('Invalid official model revision')
    wanted = {'config.json', 'model.bin', 'tokenizer.json', 'vocabulary.json', 'vocabulary.txt', 'preprocessor_config.json'}
    files = [item for item in metadata['siblings'] if item['rfilename'] in wanted]
    if not {'config.json', 'model.bin', 'tokenizer.json'}.issubset({item['rfilename'] for item in files}):
        raise ValueError('Official model is missing required data files')
    if not {'vocabulary.json','vocabulary.txt'}.intersection({item['rfilename'] for item in files}):
        raise ValueError('Official model is missing its vocabulary')
    TARGET.mkdir(parents=True, exist_ok=True)
    manifest = {'repository': REPO, 'revision': revision, 'files': []}
    for item in files:
        name = item['rfilename']; destination = TARGET / name
        expected = item.get('lfs', {}).get('sha256')
        if destination.exists() and expected and hashlib.sha256(destination.read_bytes()).hexdigest() == expected:
            print(f'{name}: verified cached data', flush=True)
        else:
            temporary = TARGET / (name + '.download')
            print(f'{name}: downloading official model data', flush=True)
            expected_size = item.get('size') or item.get('lfs', {}).get('size')
            for attempt in range(6):
                start = temporary.stat().st_size if temporary.exists() else 0
                if expected_size and start == expected_size: break
                with request(f'{BASE}/{REPO}/resolve/{revision}/{name}?download=true', start) as response:
                    partial = start > 0 and response.status == 206 and response.headers.get('Content-Range', '').startswith(f'bytes {start}-')
                    size = start if partial else 0
                    try:
                        with temporary.open('ab' if partial else 'wb') as output:
                            while chunk := response.read(1024 * 1024):
                                size += len(chunk)
                                if size > 120 * 1024 * 1024: raise ValueError('Model file exceeds setup limit')
                                output.write(chunk)
                    except (TimeoutError, OSError):
                        print(f'{name}: retrying interrupted transfer at {size} bytes', flush=True)
                if not expected_size or temporary.stat().st_size == expected_size: break
                print(f'{name}: continuing verified revision, {temporary.stat().st_size}/{expected_size} bytes', flush=True)
            if expected_size and temporary.stat().st_size != expected_size: raise ValueError('Official model transfer is incomplete')
            digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
            if expected and digest != expected: raise ValueError('Official model checksum mismatch')
            os.replace(temporary, destination)
        manifest['files'].append({'name': name, 'bytes': destination.stat().st_size, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()})
    (TARGET / 'jarvis-download-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print('Local tiny ASR model verified; no paid provider used.', flush=True)
if __name__ == '__main__': main()
