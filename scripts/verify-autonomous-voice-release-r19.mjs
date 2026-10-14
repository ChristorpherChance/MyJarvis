/** Actual deployed-build and read-only endpoint checks; no model calls or acceptance changes. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {withPlatform,remote,primary,lanProfile} from './managed-server-client.mjs';
import {checkInitialGet} from './verify-platform-initial-get.mjs';
import {queueState,nodeState} from './run-factory-supervision-probe.mjs';
const RELEASE='20261010-autonomous-voice-r19-1';
const folder='artifacts/unattended-r19';
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const stage=await load('artifacts/managed-servers/application-stage-verification.json');
const activation=await load('artifacts/managed-servers/activation.json');
const upgrade=await load(folder+'/node-upgrade.json');
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health');
 const [getChecks,configResponse,supervisionResponse,agentResponse]=await Promise.all([
  checkInitialGet(api),api('/api/v1/execution/config'),api('/api/v1/execution/supervision'),api('/api/v1/execution/agents')]);
 const node=nodeState(),queue=queueState();
 const config=configResponse.data,template=config.templates.find(t=>t.id==='msf-101-claude');
 const pin=t=>t?.args?.filter(a=>a==='--model').length===1&&t.args[t.args.indexOf('--model')+1]==='gpt-6.1-sol[1m]';
 const list=Array.isArray(agentResponse.data)?agentResponse.data:agentResponse.data.items??[];
 const paired=list.find(a=>a.id===node.agentId);
 const releasePointers={};
 for(const id of ['101','112'])releasePointers[id]=JSON.parse(remote(lanProfile,'jarvis-'+id,String.raw`from pathlib import Path
import json
print(json.dumps({'release':Path('/opt/jarvis/current').resolve().name,'readOnly':True}))`,true));
 const centralTables=JSON.parse(primary(String.raw`import sqlite3,json
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True)
try:
 tables={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
 print(json.dumps({'deliveryTable':'execution_deliveries' in tables,'resultEffectsIntentTable':'execution_delivery_intents' in tables,'readOnly':True}))
finally:c.close()
`));
 const checks={
  expectedBusinessBuild:health.status==='ok'&&health.build===RELEASE,
  compiledStageMatches:stage.status==='passed'&&stage.release===RELEASE&&stage.checks?.length===2&&stage.checks.every(c=>c.match),
  activationMatches:activation.release===RELEASE&&activation.results?.length===2&&activation.results.every(x=>x.active),
  bothReleasePointers:Object.values(releasePointers).every(x=>x.release===RELEASE),
  initialGetsPassed:getChecks.length===25&&getChecks.every(x=>x.success),
  strongModelBoth:pin(template)&&pin(node.template),
  pairedNodeUnchanged:node.agentId==='0b5aea06-47e1-4f4b-a32e-969417915c9c'&&!!paired&&!paired.revoked,
  nodeOnline:paired?.status==='online'&&node.unit?.ActiveState==='active',
  noActiveRuns:queue.allActive===0,
  globalSupervisionUnchanged:supervisionResponse.data.supervised===false,
  privateJournalReady:upgrade.result?.journal?.identityMatches===true&&upgrade.result.journal.unresolvedRuns===0&&upgrade.result.journal.unconfirmedDeliveries===0,
  privateConfigUnchanged:upgrade.result?.configUnchanged===true,
  centralDeliverySchema:centralTables.deliveryTable&&centralTables.resultEffectsIntentTable,
 };
 return {release:RELEASE,at:new Date().toISOString(),passed:Object.values(checks).every(Boolean),checks,getChecks,queue,centralRevision:config.revision,releasePointers,centralTables,readOnly:true,modelCalls:0,projectAcceptance:false};
});
await mkdir(folder,{recursive:true});result.maintenanceLoginRevoked=true;
await writeFile(folder+'/release-verification.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:result.passed,release:result.release,checks:result.checks}));if(!result.passed)process.exitCode=1;
