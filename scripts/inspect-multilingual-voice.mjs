/** Read-only inventory; never reads service credentials or family data. */
import {primary} from './managed-server-client.mjs';
console.log(primary(`import json,shutil,subprocess
from pathlib import Path
script="import importlib.metadata as m,json; names=['sherpa-onnx','faster-whisper','ctranslate2','numpy','av']; print(json.dumps({name:next((d.version for d in m.distributions() if d.metadata['Name'].lower().replace('_','-')==name),None) for name in names}))"
result=subprocess.run(['/opt/jarvis/voice-venv/bin/python','-c',script],capture_output=True,text=True)
print(json.dumps({'disk':dict(zip(['total','used','free'],shutil.disk_usage('/var/lib/jarvis'))),'memory':{line.split(':')[0]:line.split(':')[1].strip() for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith(('MemTotal:','MemAvailable:'))},'modelDirectories':[q.name for q in Path('/var/lib/jarvis/voice-models').iterdir() if q.is_dir()],'packages':result.stdout.strip(),'packageReadExit':result.returncode,'voiceServiceActive':subprocess.run(['systemctl','is-active','jarvis-voice.service'],capture_output=True,text=True).stdout.strip()}))
`));
