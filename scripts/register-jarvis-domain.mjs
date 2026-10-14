/** Update existing application metadata; credentials remain untouched. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {withPlatform} from './managed-server-client.mjs';
const onboarding=JSON.parse(await readFile('artifacts/managed-servers/onboarding.json','utf8'));
const domain='https://cc-jarvis.ikvein.com';
const fields=['name','description','machineId','projectId','serviceIds','environment','status','url','loginUrl','directory','notes','health'];
const notes={112:'域名由广州网关经独立FRP直连112；局域网备用入口 https://192.168.10.112:3140。',101:'冷备域名通道已预置并保持停止；经主备隔离、数据恢复和角色提升后可接管同一域名。当前未自动接管。'};
const updated=[];
await withPlatform(async({api})=>{
 const result=await api('/api/runtime/applications?limit=100');assert.equal(result.total,13);
 for(const nodeId of ['112','101']){
  const node=onboarding.nodes.find(n=>n.id===nodeId),tunnel=node.services.find(s=>s.unit==='jarvis-frpc.service');assert(tunnel);
  let app=result.items.find(r=>r.machineId===node.machineId&&r.name===(nodeId==='112'?'贾维斯':'贾维斯（冷备）'));assert(app);
  const data=Object.fromEntries(fields.map(k=>[k,app[k]]));
  data.serviceIds=[...new Set([...data.serviceIds,tunnel.serviceId])];
  if(!data.notes.includes(notes[nodeId]))data.notes=(data.notes?data.notes+'\n':'')+notes[nodeId];
  if(nodeId==='112'){data.url=domain+'/';data.loginUrl=domain+'/';data.health={...data.health,enabled:true,url:domain+'/api/health'};}
  else{assert.equal(app.status,'paused');assert.equal(app.health.enabled,false);}
  if(fields.some(k=>JSON.stringify(data[k])!==JSON.stringify(app[k]))){await api('/api/runtime/applications/'+app.id,{commandId:randomUUID(),expectedVersion:app.revision,data},'PUT');app=await api('/api/runtime/applications/'+app.id);}
  if(nodeId==='112'){const check=await api('/api/runtime/applications/'+app.id+'/check',{});assert.equal(check.state,'healthy');}
  updated.push({node:nodeId,id:app.id,name:app.name,url:app.url,status:app.status,healthURL:app.health.url,tunnelBound:app.serviceIds.includes(tunnel.serviceId),credentialsModified:false});
 }
 assert.equal((await api('/api/runtime/applications?limit=100')).total,13);
});
const report={status:'passed',at:new Date().toISOString(),url:domain,projects:updated,projectCount:13};
await writeFile('artifacts/domain-access/metadata-updated.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
