import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {primary,python} from './managed-server-client.mjs';
const stage='/var/lib/jarvis/voice-staging-20261010-multilingual';
if(process.argv.includes('--status')){
 console.log(primary(python({stage},`from pathlib import Path
import json
p=Path(p['stage'])/'fixture-status.json';print(p.read_text() if p.exists() else json.dumps({'state':'not-started'}))
`)));
}else if(process.argv.includes('--report')){
 const report=primary(python({stage},`from pathlib import Path
print((Path(p['stage'])/'fixture-report.json').read_text())
 `));const destination=JSON.parse(report).revision==='20261010-multilingual-r1'?'artifacts/multilingual-voice':'artifacts/automatic-language';await mkdir(destination,{recursive:true});await writeFile(destination+'/staging-verification.json',report+'\n');console.log(report);
}else{
 const script=await readFile('scripts/test-multilingual-voice-stage.py','utf8');
 console.log(primary(python({stage,script},`from pathlib import Path
import subprocess,os,pwd,json
r=Path(p['stage']);assert str(r)=='/var/lib/jarvis/voice-staging-20261010-multilingual'
f=r/'fixture.py';f.write_text(p['script']);f.chmod(0o640);account=pwd.getpwnam('jarvis');os.chown(f,account.pw_uid,account.pw_gid)
log=r/'fixture-run.log';fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600);os.chown(log,account.pw_uid,account.pw_gid)
process=subprocess.Popen(['runuser','-u','jarvis','--',str(r/'venv/bin/python'),str(f)],stdin=subprocess.DEVNULL,stdout=fd,stderr=fd,start_new_session=True);os.close(fd)
print(json.dumps({'state':'started','stage':str(r),'testPort':3156,'pid':process.pid,'productionUnchanged':True}))
`)));
}
