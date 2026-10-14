import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {primary,python,lanProfile} from './managed-server-client.mjs';
const manifest=JSON.parse(await readFile('artifacts/resident-voice/models/'+(process.argv.includes('--fast')?'fast-manifest':'manifest')+'.json','utf8'));
console.log(primary(`import os,signal,json
from pathlib import Path
stopped=[]
for path in Path('/proc').iterdir():
 if not path.name.isdigit():continue
 try:command=(path/'cmdline').read_bytes().split(b'\\0')
 except OSError:continue
 if b'/opt/jarvis/prepare-resident-voice.py' in command:os.kill(int(path.name),signal.SIGTERM);stopped.append(int(path.name))
print(json.dumps({'stoppedPreparation':stopped}))
`));
const input=manifest.map(a=>'put "'+resolve('artifacts/resident-voice/models/'+(a.file??a.name+'.tar.bz2')).replaceAll('\\','/')+'" "/home/superopen/'+(a.file??a.name+'.tar.bz2')+'"').join('\n')+'\n';
const r=spawnSync('sftp',['-F',lanProfile,'-b','-','jarvis-112'],{input,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:100000});if(r.status!==0)throw Error('Upload failed '+r.stderr.slice(-500));
console.log(primary(python({manifest},`import hashlib,json
from pathlib import Path
for asset in p['manifest']:
 source=Path('/home/superopen')/(asset.get('file',asset['name']+'.tar.bz2'))
 if hashlib.file_digest(source.open('rb'),'sha256').hexdigest()!=asset['sha256']:raise RuntimeError('Upload digest mismatch')
 source.replace(Path('/var/lib/jarvis/voice-models')/source.name)
print(json.dumps({'uploaded':len(p['manifest']),'verified':True}))
`)));
