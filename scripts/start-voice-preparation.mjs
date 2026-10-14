import {readFile} from 'node:fs/promises';
import {primary,python} from './managed-server-client.mjs';
const source=await readFile('scripts/prepare-resident-voice.py','utf8');
console.log(primary(python({source},`import subprocess,json
from pathlib import Path
path=Path('/opt/jarvis/prepare-resident-voice.py');path.write_text(p['source']);path.chmod(0o700)
log=open('/var/log/jarvis-voice-preparation.log','wb')
process=subprocess.Popen(['python3',str(path)],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
print(json.dumps({'pid':process.pid,'log':'/var/log/jarvis-voice-preparation.log'}))
`)));
