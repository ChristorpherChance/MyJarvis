import {primary} from './managed-server-client.mjs';
console.log(primary(`import subprocess
code="""import sys;sys.path.insert(0,'/opt/jarvis')
from resident_voice import Engines
from pathlib import Path
e=Engines(Path('/var/lib/jarvis/voice-models'),2)
audio=e.synthesize({'input':'贾维斯，请告诉我今天学习什么。','voice':'58'})
print(e.recognize(audio,'贾维斯'))
"""
r=subprocess.run(['/opt/jarvis/voice-venv/bin/python','-c',code],capture_output=True,text=True,timeout=35)
print(r.stdout[-1500:]);print(r.stderr[-2400:])
`));
