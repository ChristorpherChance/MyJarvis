const fs=require('node:fs');
function apply(d){
 const s=d.components.schemas,ref=n=>({$ref:'#/components/schemas/'+n});
 s.ServiceProcessInput={type:'object',additionalProperties:false,required:['serviceId','unit','activeState','subState','observedAt'],properties:{
  serviceId:{type:'string',minLength:1,maxLength:200},unit:{type:'string',pattern:'^[A-Za-z0-9_.@-]{1,180}\\.service$'},
  activeState:{type:'string',enum:['active','inactive','failed','activating','deactivating','reloading','maintenance','refreshing','unknown']},
  subState:{type:'string',pattern:'^[a-z0-9-]{1,100}$'},observedAt:{type:'string',format:'date-time'}
 }};
 s.ServiceProcessObservation={...structuredClone(s.ServiceProcessInput),required:[...s.ServiceProcessInput.required,'processStatus','source','verification','agentId','receivedAt'],properties:{...structuredClone(s.ServiceProcessInput.properties),
  processStatus:{type:'string',enum:['running','active','stopped','failed','unknown']},source:{const:'signed-agent-systemd'},verification:{const:'node-observed-not-application-health'},agentId:{type:'string',format:'uuid'},receivedAt:{type:'string',format:'date-time'}
 }};
 s.InfrastructureRecord.properties.processObservation=ref('ServiceProcessObservation');
 s.ExecutionHeartbeatInput.properties.serviceProcesses={type:'array',maxItems:32,items:ref('ServiceProcessInput'),description:'仅service-status节点可观察本机已登记systemd单元；采样须在30秒内；不改变应用健康结论。'};
 const disk={diskPercent:{type:'number',minimum:0,maximum:100},diskFreeGB:{type:'number',minimum:0},diskTotalGB:{type:'number',minimum:0}};
 Object.assign(s.ExecutionHeartbeatInput.properties.metrics.properties,disk);
 Object.assign(s.InfrastructureRecord.properties.telemetry.properties,disk);
 return require('./telemetry-contract.cjs')(d);
}
module.exports=apply;
if(require.main===module){const f='docs/openapi-v1-planned.json';fs.writeFileSync(f,JSON.stringify(apply(JSON.parse(fs.readFileSync(f,'utf8'))),null,2)+'\n');}
