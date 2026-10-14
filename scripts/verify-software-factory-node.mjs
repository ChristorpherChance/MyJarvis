import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
import {FACTORY_NODE} from './install-software-factory-node.mjs';
import {mkdir,writeFile} from 'node:fs/promises';

const remoteState=JSON.parse(remote(lanProfile,'jarvis-101',python({},`from pathlib import Path
import os,pwd,json,subprocess,urllib.request,re
c=Path('/var/lib/jarvis-development/101/config.json');s=c.stat();cfg=json.loads(c.read_text())
u=subprocess.run(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,SubState,User,Group,MainPID'],capture_output=True,text=True,timeout=10)
git=lambda args:subprocess.run(['/usr/bin/git','-C','/home/superopen/All-Projects/msf',*args],capture_output=True,text=True,timeout=10).stdout.strip()
state={'node':{'agentId':cfg.get('agentId'),'hasPrivateKey':bool(cfg.get('privateKey')),'hasTicket':bool(cfg.get('pairingTicket')),'mode':oct(s.st_mode&0o777),'owner':pwd.getpwuid(s.st_uid).pw_name,'symlink':c.is_symlink(),'unit':dict(x.split('=',1) for x in u.stdout.splitlines() if '=' in x)},'source':{'branch':git(['branch','--show-current']),'head':git(['rev-parse','HEAD']),'status':git(['status','--porcelain'])}}
with urllib.request.urlopen('http://127.0.0.1:8080/api/projects',timeout=10) as response:
 data=json.loads(response.read(1024*1024+1));state['factory']={'status':response.status,'type':type(data).__name__,'keys':list(data.keys()) if isinstance(data,dict) else None}
 rows=data if isinstance(data,list) else data.get('items',data.get('data',[])) if isinstance(data,dict) else []
 if isinstance(rows,dict):rows=rows.get('items',[])
 state['factory']['count']=len(rows) if isinstance(rows,list) else None
 state['factory']['rows']=[{'keys':list(r.keys()),'id':r.get('id'),'types':{k:type(v).__name__ for k,v in r.items()},'idUuidShape':bool(re.fullmatch('[0-9a-fA-F-]{36}',str(r.get('id'))))} for r in rows[:10] if isinstance(r,dict)] if isinstance(rows,list) else []
print(json.dumps(state))
`),true));
const central=await withPlatform(async({api})=>{
 const agents=(await api('/api/v1/execution/agents')).data;
 const caps=(await api('/api/v1/execution/capabilities')).data;
 const config=(await api('/api/v1/execution/config')).data;
 return {agent:agents.find(a=>a.id===remoteState.node.agentId),template:config.templates.find(t=>t.id===FACTORY_NODE.templateId),capabilities:caps};
});
const result={observedAt:new Date().toISOString(),remote:remoteState,central};
await mkdir('artifacts/software-factory/node',{recursive:true});await writeFile('artifacts/software-factory/node/node-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
