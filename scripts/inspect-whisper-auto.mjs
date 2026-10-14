/** Read installed public package source only; does not load models or read credentials. */
import {primary,python} from './managed-server-client.mjs';
const code=String.raw`import inspect
from faster_whisper import WhisperModel
for method in [WhisperModel.transcribe,WhisperModel.generate_segments,WhisperModel.detect_language]:
 lines=inspect.getsource(method).splitlines()
 print(method.__name__)
 for i,line in enumerate(lines):
  if any(word in line for word in ['encoder_output','detect_language','generate_segments','self.encode','features =']):print('\n'.join(lines[max(0,i-2):i+5]))
`;
console.log(primary(python({code},`import subprocess
r=subprocess.run(['/var/lib/jarvis/voice-staging-20261010-multilingual/venv/bin/python','-c',p['code']],capture_output=True,text=True)
if r.returncode:raise RuntimeError('PACKAGE_SOURCE_READ_FAILED')
print(r.stdout)
`)));
