/** Pin only the paired 101 Claude executor; private route credentials remain untouched. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
import {supervisionScope as scope,queueState,nodeState,patchNode,putCentral} from './run-factory-supervision-probe.mjs';
import {safeApiFailure} from './verify-software-factory-execution.mjs';
const target='artifacts/model-routing-101-r19/route-update.json',MODEL='gpt-6.1-sol[1m]';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=code=>{throw Error(code)};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export function strongTemplate(original){
 if(original?.id!==scope.templateId||original?.machineId!==scope.machineId||original?.engine!=='claude'||!Array.isArray(original.args)||original.args.some(a=>/^(?:--tools|--disallowedTools|--max-turns|--resume)(?:=|$)/.test(a)))fail('STRONG_MODEL_TEMPLATE_SCOPE_INVALID');
 const args=[];for(let i=0;i<original.args.length;i++){const a=original.args[i];if(a==='--model'){if(!original.args[i+1]||original.args[i+1].startsWith('--'))fail('MODEL_ARGUMENT_INVALID');i++;}else if(a.startsWith('--model=')){}else args.push(a)}
 return {...original,args:[...args,'--model',MODEL]};
}
const execute=process.argv.includes('--execute');
if(process.argv.slice(2).some(a=>a!=='--execute')||process.argv.slice(2).length>1)fail('ONLY_EXECUTE_FLAG_ALLOWED');
await mkdir('artifacts/model-routing-101-r19',{recursive:true});
const report=await withPlatform(async({api})=>{
 const [configuration,capabilities,supervision,agents]=await Promise.all(['/api/v1/execution/config','/api/v1/execution/capabilities','/api/v1/execution/supervision','/api/v1/execution/agents'].map(p=>api(p)));
 const current=configuration.data.templates.find(t=>t.id===scope.templateId),node=nodeState(),queue=queueState(),replacement=strongTemplate(current);
 const checks={globalSupervisionOff:capabilities.data.supervised===false,notStopped:supervision.data.stopped===false,queueEmpty:queue.fullTable===true&&queue.allActive===0,centralLocalExact:same(current,node.template),pairedIdentity:node.agentId==='0b5aea06-47e1-4f4b-a32e-969417915c9c',nodeActive:node.unit.ActiveState==='active'&&node.unit.SubState==='running',agentOnline:agents.data.some(a=>a.id===node.agentId&&a.status==='online'&&!a.revoked),templateReady:capabilities.data.configuredTemplates.some(t=>t.id===scope.templateId&&t.ready)};
 const result={formatVersion:1,at:new Date().toISOString(),execute,requestedModel:MODEL,scope:{machineId:scope.machineId,templateId:scope.templateId,unit:scope.unit},nodeAgentId:node.agentId,checks,queue,originalTemplate:current,strongTemplate:replacement,modelCalled:false,softwareFactorySourceModified:false,businessDatabaseModified:false,ccSwitchModified:false,claudeUserSettingsModified:false,globalSupervisionModified:false,credentialsExported:false};
 if(!execute)return result;if(Object.values(checks).some(v=>v!==true))fail('STRONG_MODEL_PREFLIGHT_NOT_READY');
 try{await readFile(target);fail('ROUTE_UPDATE_EVIDENCE_ALREADY_EXISTS')}catch(e){if(e.code!=='ENOENT')throw e}
 result.job=randomBytes(16).toString('hex');result.driverSHA256=createHash('sha256').update(await readFile('scripts/configure-101-strong-model-r19.mjs')).digest('hex');result.stage='prepared';await writeFile(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 const save=()=>writeFile(target,JSON.stringify(result,null,2)+'\n');
 let changed=false;
 try{
  if(queueState().allActive!==0)fail('STRONG_MODEL_QUEUE_CHANGED');
  result.central=await putCentral(api,current,replacement);changed=true;result.stage='central-pinned';await save();
  if(queueState().allActive!==0)fail('STRONG_MODEL_QUEUE_CHANGED');
  result.local=patchNode(current,replacement,result.job);result.stage='node-pinned';await save();
  const expires=Date.now()+40000;while(Date.now()<expires){const [c,a]=await Promise.all([api('/api/v1/execution/config'),api('/api/v1/execution/agents')]),n=nodeState();if(same(c.data.templates.find(t=>t.id===scope.templateId),replacement)&&same(n.template,replacement)&&n.agentId===result.nodeAgentId&&n.unit.ActiveState==='active'&&n.unit.SubState==='running'&&a.data.some(x=>x.id===result.nodeAgentId&&x.status==='online'&&!x.revoked)){result.after={revision:c.data.revision,nodeTemplate:n.template,nodeUnit:n.unit,queue:queueState(),globalSupervision:(await api('/api/v1/execution/capabilities')).data.supervised};break}await delay(2000)}
  result.pinnedVerified=!!result.after&&result.after.queue.allActive===0&&result.after.globalSupervision===false;result.stage=result.pinnedVerified?'pinned-awaiting-native-model-receipt':'pin-not-verified';await save();if(!result.pinnedVerified)fail('STRONG_MODEL_PIN_NOT_VERIFIED');return result;
 }catch(e){result.failure=safeApiFailure(e);result.stage='failed';await save();
  if(changed&&queueState().allActive===0){const n=nodeState();if(same(n.template,current)){result.rollback=await putCentral(api,replacement,current);result.rollback.reason='Local new model not installed; rollback partial central pin only';await save()}else result.rollback={deferred:true,reason:'New node template installed or changed; preserve explicit route and require review'};await save()}throw e;
 }
});
if(!execute)await writeFile('artifacts/model-routing-101-r19/route-plan.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({execute,requestedModel:MODEL,checks:report.checks,pinnedVerified:report.pinnedVerified??null,report:execute?target:'artifacts/model-routing-101-r19/route-plan.json',modelCalled:false}));
