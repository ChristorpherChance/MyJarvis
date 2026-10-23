/** Planned assets only: no SSH, execution enrollment, settings changes or token logging. */
import {createHash} from 'node:crypto';
import {readFile,writeFile,rename,unlink,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
export const plannedHash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const fields=['name','role','category','cpu','ram','disk','gpu','os','address','room','always'];
export function validatePlannedBatch(batch){
 if(batch.schemaVersion!==1||batch.newAssetsConfirmed!==true||!Array.isArray(batch.machines)||(batch.machines.length<1||batch.machines.length>100))throw Error('PLANNED_BATCH_INVALID');
 if(new Set(batch.machines.map(m=>m.key)).size!==batch.machines.length||new Set(batch.machines.map(m=>m.commandId)).size!==batch.machines.length||new Set(batch.machines.map(m=>m.payload.name)).size!==batch.machines.length)throw Error('PLANNED_BATCH_DUPLICATE');
 for(const m of batch.machines){const p=m.payload;if(!/^新增(?:0[1-9]|[1-9][0-9])$/.test(m.key)||!/^[0-9a-f-]{36}$/.test(m.commandId)||!p||Object.keys(p).some(k=>!fields.includes(k))||!p.name.startsWith(((m.scope??'personal')==='company'?'公司只读·':'待接入·')+m.key+'·')||!p.role.includes('未')||p.role.length>1000||!['small','workstation','server','laptop','storage'].includes(p.category)||!Number.isFinite(p.ram)||p.ram<=0||p.ram>4096||p.address!==''||p.room!==''||p.always!==false)throw Error('PLANNED_ASSET_INVALID');}
 return batch;
}
export function verifyPlannedReadback(record,item){
 if(!record||typeof record.id!=='string'||!Number.isInteger(record.revision)||record.revision<1)throw Error('PLANNED_RECEIPT_INVALID');
 for(const key of fields)if(record[key]!==item.payload[key])throw Error('PLANNED_READBACK_DIFFERENT_'+key.toUpperCase());
 if(record.scope!==(item.scope??'personal')||((item.scope??'personal')==='company'&&record.readOnly!==true)||record.source!=='manual'||record.verification!=='unverified_external'||record.status!=='unknown'||record.agentStatus!=='not-configured'||record.lastSeen!==null||record.executionDispatched!==false)throw Error('PLANNED_ASSET_TRUST_BOUNDARY_CHANGED');
 return {key:item.key,commandId:item.commandId,payloadSHA256:plannedHash(item.payload),assetId:record.id,revision:record.revision,name:record.name,readbackVerified:true,assetStatus:record.status,scope:record.scope,readOnly:record.readOnly,agentStatus:record.agentStatus,verification:record.verification,address:record.address};
}
/** api is an already-authenticated, fixed-origin function; it is never constructed from batch input. */
export async function registerPlannedBatch(batch,{api,execute=false,prior=[],onResult=async()=>{}}){
 validatePlannedBatch(batch);const results=[];let cursor;const existing=[];
 do{const page=await api('/api/v1/machines?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));existing.push(...page.data.items);cursor=page.data.nextCursor;}while(cursor);
 for(const item of batch.machines){
  const priorItem=prior.find(r=>r.key===item.key),matches=existing.filter(r=>r.name===item.payload.name);
  try{
   let candidate;
   if(priorItem?.assetId){if(priorItem.payloadSHA256!==plannedHash(item.payload))throw Error('PLANNED_INPUT_CHANGED');candidate=(await api('/api/v1/machines/'+encodeURIComponent(priorItem.assetId))).data;}
   else if(matches.length){throw Error(matches.length===1?'PLANNED_NAME_EXISTS_RECONCILE_RECEIPT':'PLANNED_NAME_AMBIGUOUS');}
   else if(!execute){const result={key:item.key,commandId:item.commandId,payloadSHA256:plannedHash(item.payload),status:'ready-not-submitted'};results.push(result);await onResult(results);continue;}
   else{
    const reply=await api('/api/v1/machines/commands/register',{commandId:item.commandId,scope:item.scope??'personal',expectedVersion:0,payload:item.payload},'POST');
    const partial={key:item.key,commandId:item.commandId,payloadSHA256:plannedHash(item.payload),assetId:reply.data.id,revision:reply.data.revision,status:'created-awaiting-readback'};
    results.push(partial);await onResult(results);
    candidate=(await api('/api/v1/machines/'+encodeURIComponent(reply.data.id))).data;
    results.pop();existing.push(candidate);
   }
   results.push({...verifyPlannedReadback(candidate,item),status:'registered-and-read-back'});await onResult(results);
  }catch(error){results.push({key:item.key,commandId:item.commandId,payloadSHA256:plannedHash(item.payload),status:'blocked-or-uncertain',reason:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'PLANNED_API_RESULT_UNCERTAIN'});await onResult(results);break;}
 }
 return {schemaVersion:1,batchId:batch.batchId,at:new Date().toISOString(),execute,registeredAndReadBack:results.filter(r=>r.readbackVerified).length,results};
}
export async function savePlannedReport(path,value){await mkdir(dirname(path),{recursive:true});const temp=path+'.next';try{await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);}finally{await unlink(temp).catch(()=>{});}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const batch=validatePlannedBatch(JSON.parse(await readFile(new URL('./planned-machines-20261023.json',import.meta.url),'utf8')));
 if(process.argv.slice(2).some(v=>v!=='--check'))throw Error('AUTHENTICATED_API_ADAPTER_REQUIRED');
 process.stdout.write(JSON.stringify({batchId:batch.batchId,assets:batch.machines.length,inputSHA256:plannedHash(batch),execute:false,note:'Use an existing authorized in-memory maintenance API adapter. This command never opens a production session.'},null,2)+'\n');
}
