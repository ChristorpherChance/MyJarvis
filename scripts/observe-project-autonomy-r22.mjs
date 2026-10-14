/** Public snapshot of actual supervision and execution, without raw model output. */
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const label=process.env.JARVIS_AUTONOMY_OBSERVATION??'first-dispatch';
if(!/^[a-z0-9-]{1,80}$/.test(label))throw Error('OBSERVATION_LABEL_INVALID');
const profile=await withPlatform(async({api})=>{
 const p=(await api('/api/v1/projects/'+projectId+'/autonomy')).data;
 if(!p)throw Error('AUTONOMY_NOT_CONFIGURED');
 const stages=[];
 for(const s of p.stages){
  const runs=[];
  for(const id of [s.runId,s.reviewRunId,s.validationRunId].filter(Boolean)){
   const r=(await api('/api/v1/execution/runs/'+id)).data;
   const l=(await api('/api/v1/execution/runs/'+id+'/logs?after=0')).data.items;
   const u=r.result?.usage;
   const usage=u?Object.fromEntries(Object.entries(u).filter(([k,v])=>['inputTokens','outputTokens','totalTokens','cacheReadTokens','cacheWriteTokens','costUSD','knownCostUSD','usageComplete','costComplete','calls'].includes(k)&&(typeof v==='number'||typeof v==='boolean'||v===null))):null;
   runs.push({id:r.id,taskId:r.taskId,status:r.status,agentId:r.agentId,machineId:r.machineId,executorId:r.executorId,createdAt:r.createdAt,startedAt:r.startedAt,finishedAt:r.finishedAt,attempt:r.attempt,outcome:r.result?.outcome??null,usage,validation:r.result?.validation?{exitCode:r.result.validation.exitCode,autonomyReportSha256:r.result.validation.autonomyReportSha256}:null,logs:{count:l.length,sha256:createHash('sha256').update(JSON.stringify(l)).digest('hex'),streams:[...new Set(l.map(x=>x.channel??x.stream??'unknown'))]}});
  }
  stages.push({id:s.id,status:s.status,attempt:s.attempt,taskId:s.taskId,reviewTaskId:s.reviewTaskId,validationTaskId:s.validationTaskId,problem:s.problem??null,nextProbeAt:s.nextProbeAt??null,probeCount:s.probeCount??0,runs});
 }
 return {at:new Date().toISOString(),health:await api('/api/health'),projectId,status:p.status,revision:p.revision,reason:p.reason,goalSpecHash:p.goalSpecHash,costPolicy:p.config.costPolicy,maxUSD:p.config.maxUSD,maxTokens:p.config.maxTokens,perTaskUSD:p.config.perTaskUSD,budget:p.budget,verifiedObjectiveIds:p.verifiedObjectiveIds,objectiveCount:p.spec.objectives.length,stages,events:p.events,globalSupervision:(await api('/api/v1/execution/supervision')).data.supervised,productAccepted:p.status==='completed'};
});
const node=JSON.parse(remote(lanProfile,'jarvis-101',python({},String.raw`import subprocess,datetime
from pathlib import Path
r=subprocess.run(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID,User'],capture_output=True,text=True,check=True,timeout=10)
unit=dict(v.split('=',1) for v in r.stdout.splitlines() if '=' in v);pid=int(unit.get('MainPID','0'));procs={}
for q in Path('/proc').iterdir():
 if not q.name.isdigit():continue
 try:
  stat=(q/'status').read_text();parent=int(next(x.split(':',1)[1] for x in stat.splitlines() if x.startswith('PPid:')))
  procs[int(q.name)]=(parent,q)
 except (FileNotFoundError,PermissionError,StopIteration):pass
descendants={pid};rows=[]
for _ in range(6):
 for ident,(parent,q) in procs.items():
  if parent not in descendants or ident in descendants:continue
  descendants.add(ident)
  try:
   args=(q/'cmdline').read_bytes().decode('utf-8','replace').split(chr(0));selected=args[args.index('--model')+1] if '--model' in args else None
   engine='claude' if any(Path(a).name=='claude.exe' for a in args[:2]) else 'other'
   rows.append({'pid':ident,'parentPID':parent,'engine':engine,'strongModelConfirmed':selected=='gpt-6.1-sol[1m]' if engine=='claude' else None})
  except (FileNotFoundError,PermissionError,IndexError):pass
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'unit':unit,'childProcesses':rows,'readOnly':True,'credentialsExported':False}))
`),true,{timeoutMs:45000}));
const result={...profile,node};
const path='artifacts/software-factory/autonomy-r22/observation-'+label+'.json';
await writeFile(path,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({path,status:result.status,stage:result.stages.find(s=>s.status!=='pending'),verifiedObjectives:result.verifiedObjectiveIds.length,objectiveCount:result.objectiveCount,node:node.unit,modelProcesses:node.childProcesses.filter(x=>x.engine==='claude'),productAccepted:result.productAccepted}));
