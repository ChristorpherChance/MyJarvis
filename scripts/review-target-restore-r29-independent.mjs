/** Local-only state-flow audit of the production restoration module. */
import {readFile,open,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha as realSHA,canonical,nativeRepairTemplate} from './run-factory-main-repair-r26.mjs';
import {targetCopyR29Scope as S} from './prepare-factory-target-copy-r29.mjs';

const path='scripts/restore-factory-target-template-r29.mjs',jp='.jarvis-dev/maintenance/factory-target-repair-r29.json';
const baseSHA='9c6fd214eb3fb55020089270ff074f9217f99519f098a0ab8c05eab3ac2b5172';
const need=(v,c)=>{if(!v)throw Error(c);},clone=v=>JSON.parse(JSON.stringify(v));

async function fixture(source,{loseCentral=false,loseNode=false,changedFinal=false,partialCentral=false,partialNode=false,notIdle=false}={}){
 const original={id:S.templateId,machineId:S.machineId,engine:'claude',program:'/controlled/claude',fixtureOriginal:true};
 const sha=v=>v?.fixtureOriginal?baseSHA:realSHA(v);
 const template={...nativeRepairTemplate(original),workspaceRoot:S.parent,supervision:{billing:'record-only',maxTokens:200000,maxRecoveryAttempts:0,retryDelaySec:120,repairValidation:false,fallbackExecutorIds:[]}};
 const others=Array.from({length:27},(_,i)=>({id:'other-'+i})),q={version:1,scope:S,started:true,startedAt:new Date(Date.now()-3600000).toISOString(),copyJob:'a'.repeat(32),taskId:'controlled-task',runId:'b'.repeat(40),originalTemplate:original,template,templateSHA:sha(template),candidateBefore:{identity:{device:1,inode:2}},protectedInventory:{pinned:true},otherTemplatesSHA:sha(others)};
 const proof={schemaVersion:1,kind:'software-factory-r29-target-independent-cleanup',status:'complete',ready:true,cleanupIndependentlyVerified:true,nativeProcessAndSocketCleanupVerified:true,nodeACKIdle:true,queueIdle:true,job:q.copyJob,taskId:q.taskId,runId:q.runId,agentId:S.agentId,workspace:S.workspace,projectId:S.projectId,machineId:S.machineId,frozenTemplateSHA256:q.templateSHA,modelsInvoked:false,productAccepted:false,remoteMutationsPerformed:false,observedAt:new Date().toISOString(),terminal:{signed:true,nonlate:true,ingestedSignedAgentReceipt:true,resultSHA256:'c'.repeat(64),storedRecordSHA256:'d'.repeat(64),status:'succeeded'},candidate:{stable:true,sha256:'e'.repeat(64),metadataSHA:'f'.repeat(64),files:610,identity:q.candidateBefore.identity},protectedInventorySHA256:sha(q.protectedInventory)};
 const proofPath='artifacts/software-factory/goals-r29/native-independent-cleanup-1791816000000-11111111-1111-4111-8111-111111111111.json',raw=JSON.stringify(proof),state={files:new Map([[jp,JSON.stringify(q)],[proofPath,Buffer.from(raw)]]),central:partialCentral?original:template,node:partialNode?original:template,centralWrites:0,nodeWrites:0,nodeRestarts:0,liveReads:0,dispatches:0,lossCentralUsed:false,lossNodeUsed:false};
 const stat=()=>({dev:1,ino:2,isFile:()=>true,isSymbolicLink:()=>false});
 const fs={readFile:async p=>state.files.get(p),open:async(p,f)=>{if(f==='wx'&&state.files.has(p)){const e=Error('exists');e.code='EEXIST';throw e;}if(f==='wx')state.files.set(p,'');return {writeFile:async v=>state.files.set(p,String(v)),sync:async()=>{},stat:async()=>stat(),close:async()=>{}};},rename:async(from,to)=>{state.files.set(to,state.files.get(from));state.files.delete(from);},lstat:async()=>stat(),unlink:async p=>state.files.delete(p),mkdir:async()=>{}};
 const api=async p=>{need(p==='/api/v1/execution/config','CONTROLLED_RESTORE_API_UNEXPECTED');return {data:{templates:[state.central,...others]}};};
 const verify=async opts=>{need(opts['run-id']===q.runId,'CONTROLLED_LIVE_RUN_ID_UNEXPECTED');state.liveReads++;const live=clone(proof);live.observedAt=new Date().toISOString();if(notIdle)live.queueIdle=false;if(changedFinal&&state.liveReads%2===0)live.candidate.sha256='0'.repeat(64);return live;};
 const deps={
  'node:fs/promises':fs,'node:child_process':{spawnSync:()=>({status:0})},'node:crypto':{randomUUID},'node:path':{resolve},'node:url':{pathToFileURL},
  './managed-server-client.mjs':{withPlatform:async fn=>fn({api})},
  './run-factory-main-repair-r26.mjs':{sha,canonical},
  './run-factory-supervision-probe.mjs':{nodeState:()=>({agentId:S.agentId,template:state.node}),putCentral:async(_api,expected,replacement)=>{if(canonical(state.central)===canonical(replacement))return {reused:true};need(canonical(state.central)===canonical(expected),'CONTROLLED_CENTRAL_CAS_CONFLICT');state.central=clone(replacement);state.centralWrites++;if(loseCentral&&!state.lossCentralUsed){state.lossCentralUsed=true;throw Error('CONTROLLED_CENTRAL_RESPONSE_LOST');}},patchNode:(expected,replacement)=>{need(canonical(state.node)===canonical(expected),'CONTROLLED_NODE_CAS_CONFLICT');state.node=clone(replacement);state.nodeWrites++;state.nodeRestarts++;if(loseNode&&!state.lossNodeUsed){state.lossNodeUsed=true;throw Error('CONTROLLED_NODE_RESPONSE_LOST');}}},
  './run-factory-target-repair-r29.mjs':{runFactoryTargetRepairR29:async action=>{need(action==='check','CONTROLLED_UNEXPECTED_TASK_ACTION');return {taskId:q.taskId,runId:q.runId};},targetRepairR29Template:()=>template},
  './prepare-factory-target-copy-r29.mjs':{targetCopyR29Scope:S},
  './factory-repair-evidence-read-r26.mjs':{safeReadLocal:async(p,encoding)=>{const v=state.files.get(p);need(v!==undefined,'CONTROLLED_FILE_MISSING');const b=Buffer.from(v);return encoding?b.toString(encoding):b;}}
 };
 const context=createContext({process:{argv:[],platform:'linux',pid:1},Buffer,Date,JSON});
 const sm=(v)=>new SyntheticModule(Object.keys(v),function(){for(const[k,x]of Object.entries(v))this.setExport(k,x);},{context});
 const m=new SourceTextModule(source,{context,identifier:'file:///controlled/restore.mjs',initializeImportMeta:x=>{x.url='file:///controlled/restore.mjs';},importModuleDynamically:async spec=>{need(spec==='./verify-factory-target-cleanup-r29.mjs','CONTROLLED_DYNAMIC_IMPORT_UNEXPECTED');const module=sm({verifyFactoryTargetCleanupR29:verify});await module.link(()=>{});await module.evaluate();return module;}});
 await m.link(async spec=>{need(deps[spec],'CONTROLLED_IMPORT_UNEXPECTED');return sm(deps[spec]);});await m.evaluate();
 const call=execute=>m.namespace.restoreFactoryTargetTemplateR29({proofPath,proofSHA256:sha(raw),execute});
 return {state,call,q,proof,getJournal:()=>JSON.parse(state.files.get(jp))};
}

export async function checkRestoreStateFlows(source){
 const results=[];
 const ordinary=await fixture(source),r=await ordinary.call(true);results.push({id:'complete-restoration-with-fresh-two-censuses',passed:r.restored===true&&ordinary.state.centralWrites===1&&ordinary.state.nodeRestarts===1&&ordinary.state.liveReads===2&&ordinary.getJournal().restored===true});
 const inspect=await fixture(source);const inspected=await inspect.call(false);results.push({id:'inspect-does-not-write-or-restore',passed:inspected.ready===true&&!inspected.restored&&inspect.state.centralWrites===0&&inspect.state.nodeRestarts===0&&!inspect.getJournal().cleanupProof});
 for(const [name,opts]of [['central-response-loss',{loseCentral:true}],['node-response-loss',{loseNode:true}]]){
  const f=await fixture(source,opts);let rejected=false;try{await f.call(true);}catch{rejected=true;}const attempted=f.getJournal(),second=await f.call(true);results.push({id:name+'-converges-with-same-proof-and-no-duplicate-restart',passed:rejected&&attempted.restoreIndependentAttemptedAt&&attempted.cleanupProof&&!attempted.restored&&second.restored===true&&f.state.centralWrites===1&&f.state.nodeRestarts===1&&f.state.dispatches===0});
 }
 const both=await fixture(source,{partialCentral:true,partialNode:true});const repeated=await both.call(true);results.push({id:'already-base-partial-readback-marks-restored-without-restart',passed:repeated.restored===true&&both.state.centralWrites===0&&both.state.nodeRestarts===0});
 const changed=await fixture(source,{changedFinal:true});let err=null;try{await changed.call(true);}catch(e){err=e.message;}results.push({id:'changed-candidate-after-CAS-keeps-unconfirmed-restored-state',passed:err==='R29_RESTORE_RESULT_OR_SOURCE_CHANGED_AFTER_CAS'&&!changed.getJournal().restored&&changed.state.centralWrites===1&&changed.state.nodeRestarts===1});
 const busy=await fixture(source,{notIdle:true});let busyRejected=false;try{await busy.call(true);}catch{busyRejected=true;}results.push({id:'fresh-live-not-idle-rejects-before-any-CAS',passed:busyRejected&&busy.state.centralWrites===0&&busy.state.nodeRestarts===0&&!busy.getJournal().restoreIndependentAttemptedAt});
 return results;
}
export async function cli(){const source=await readFile(path,'utf8'),results=await checkRestoreStateFlows(source),after=await readFile(path,'utf8');need(realSHA(source)===realSHA(after),'RESTORE_SOURCE_CHANGED_DURING_REVIEW');const r={schemaVersion:1,kind:'software-factory-r29-native-restore-independent-local-state-flow',at:new Date().toISOString(),source:{path,sha256:realSHA(source)},results,passed:results.every(x=>x.passed),scope:'production restoration module with in-memory API/host/cleanup/FS adapters; no remote action',dependencyBoundary:'Fresh cleanup implementation and FD/kernel behavior are not proven by these adapters and require a separate source review/actual exact-run receipt.',modelsInvoked:false,restoreExecutedRemotely:false,productAccepted:false};await mkdir('artifacts/software-factory/goals-r29',{recursive:true});const output='artifacts/software-factory/goals-r29/native-restore-state-flow-independent-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(r,null,2)+'\n',f=await open(output,'wx',0o644);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}return {output,sha256:realSHA(raw),...r};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await cli()));
