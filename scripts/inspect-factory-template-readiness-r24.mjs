/** Read-only central/node template inventory; credentials never leave tool memory. */
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const machineId='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73';
const node=JSON.parse(remote(lanProfile,'jarvis-101',python({machineId},String.raw`
import json,hashlib,stat
from pathlib import Path
q=Path('/var/lib/jarvis-development/101/config.json');s=q.lstat()
if q.is_symlink() or not stat.S_ISREG(s.st_mode) or s.st_mode&0o077:raise RuntimeError('PRIVATE_NODE_CONFIG_BOUNDARY_INVALID')
d=json.loads(q.read_bytes())
if d.get('machineId')!=p['machineId']:raise RuntimeError('NODE_MACHINE_BINDING_INVALID')
items=[]
for t in d.get('templates',[]):
 if not isinstance(t,dict):continue
 validation=t.get('validation') or {};program=t.get('program');args=t.get('args',[])
 main=str(program)=='/usr/local/libexec/jarvis-msf-validation' or any(x=='/usr/local/libexec/jarvis-msf-validation' for x in args) or validation.get('program')=='/usr/local/libexec/jarvis-msf-validation' or any(x=='/usr/local/libexec/jarvis-msf-validation' for x in validation.get('args',[]))
 full=str(program)=='/usr/local/libexec/jarvis-msf-full-validation' or any(x=='/usr/local/libexec/jarvis-msf-full-validation' for x in args)
 items.append({'id':t.get('id'),'engine':t.get('engine'),'purpose':t.get('purpose'),'workspaceRoot':t.get('workspaceRoot'),'program':program,'maxRounds':t.get('maxRounds'),'timeoutSec':t.get('timeoutSec'),'leaseSec':t.get('leaseSec'),'referencesMainNarrowBaseline':main,'referencesHistoricalFullValidation':full,'autonomyFixed':t.get('purpose')=='project-autonomy-validation','templateSha256CanonicalUtf8':hashlib.sha256(json.dumps(t,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()})
print(json.dumps({'agentId':d.get('agentId'),'machineId':d.get('machineId'),'workspaceRoots':d.get('workspaceRoots',[]),'templates':items,'secretsExported':False}))
`),true));
const central=await withPlatform(async({api})=>{
 const [config,caps,agents,supervision]=await Promise.all([
  api('/api/v1/execution/config'),api('/api/v1/execution/capabilities'),api('/api/v1/execution/agents'),api('/api/v1/execution/supervision')]);
 const data=config.data, capability=caps.data;
 const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
 const templates=(data.templates??[]).filter(t=>t.machineId===machineId).map(t=>({id:t.id,engine:t.engine,purpose:t.purpose,program:t.program,workspaceRoot:t.workspaceRoot,maxRounds:t.maxRounds,timeoutSec:t.timeoutSec,leaseSec:t.leaseSec,referencesMainNarrowBaseline:t.program==='/usr/local/libexec/jarvis-msf-validation'||(t.args??[]).includes('/usr/local/libexec/jarvis-msf-validation')||t.validation?.program==='/usr/local/libexec/jarvis-msf-validation'||(t.validation?.args??[]).includes('/usr/local/libexec/jarvis-msf-validation'),templateSha256CanonicalUtf8:createHash('sha256').update(canonical(t)).digest('hex')}));
 const readiness=(capability.configuredTemplates??[]).filter(t=>templates.some(x=>x.id===t.id)).map(t=>({id:t.id,ready:t.ready,reason:t.reason??t.reasonCode??null}));
 const agentRows=Array.isArray(agents.data)?agents.data:agents.data.items??agents.data.agents??[];
 return {revision:data.revision,templates,readiness,agents:agentRows.filter(x=>x.machineId===machineId).map(x=>({id:x.id,machineId:x.machineId,status:x.status,revoked:x.revoked,updatedAt:x.updatedAt??null,capabilities:x.capabilities})),globalSupervised:capability.supervised,supervisionStopped:supervision.data.stopped,readOnlyAPI:true};
});
const path='artifacts/software-factory/acceptance-r24/template-registration-readiness.json';
const report={schemaVersion:1,kind:'software-factory-template-readiness',at:new Date().toISOString(),implementation:{path:'scripts/inspect-factory-template-readiness-r24.mjs',sha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')},node,central,mainNarrowBaselineRegisteredOnBoth:node.templates.some(t=>t.referencesMainNarrowBaseline)&&central.templates.some(t=>t.referencesMainNarrowBaseline),matchingTemplateHashes:central.templates.map(t=>({id:t.id,matchesNode:node.templates.some(x=>x.id===t.id&&x.templateSha256CanonicalUtf8===t.templateSha256CanonicalUtf8)})),actions:{remoteBusinessWrites:0,models:0,dispatches:0,restarts:0,maintenanceSessionRevoked:true},limitations:['Ready template does not establish product acceptance.','Narrow offline baseline is only build/type/shared unit coverage.']};
await mkdir('artifacts/software-factory/acceptance-r24',{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({report:path,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),mainNarrowBaselineRegisteredOnBoth:report.mainNarrowBaselineRegisteredOnBoth,nodeTemplates:node.templates.map(t=>({id:t.id,baseline:t.referencesMainNarrowBaseline})),centralRevision:central.revision,globalSupervised:central.globalSupervised,supervisionStopped:central.supervisionStopped,readiness:central.readiness,agents:central.agents,hashesMatch:report.matchingTemplateHashes.every(x=>x.matchesNode)}));
