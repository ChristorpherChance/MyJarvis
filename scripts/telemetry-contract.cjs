/** Idempotent, non-destructive augmentation shared by every runtime regeneration. */
module.exports=function applyTelemetryContract(document){
 const schemas=document.components.schemas,ref=name=>({$ref:'#/components/schemas/'+name});
 const object=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
 const date={type:'string',format:'date-time'},percent={type:'number',minimum:0,maximum:100};
 const positive={type:'number',minimum:0},sampleNumber={...positive,exclusiveMaximum:10000000};
 const metricSources=object({gpuPercent:{type:'string',minLength:1,maxLength:200},powerWatts:{type:'string',minLength:1,maxLength:200}});
 const metricMeasuredAt=object({gpuPercent:date,powerWatts:date});
 const uptime={...positive,maximum:Number.MAX_SAFE_INTEGER};
 const freshness=object({agentId:{type:'string',minLength:1,maxLength:200},observedAt:date,expiresAt:date,timeBasis:{enum:['received','measured']}},['agentId','observedAt','expiresAt','timeBasis']);
 const metricFreshness=object(Object.fromEntries(['diskPercent','diskFreeGB','diskTotalGB','cpuPercent','memoryPercent','memoryUsedGB','memoryTotalGB','load1','uptimeSec','gpuPercent','powerWatts','cpuPower','storage'].map(k=>[k,freshness])));
 schemas.CpuPowerSample??=object({source:{const:'intel-rapl'},watts:{type:'number',minimum:0,maximum:1000},observedAt:date,windowSeconds:{type:'number',minimum:1,maximum:60}},['source','watts','observedAt','windowSeconds']);
 if(schemas.QnapStorageReading?.properties.alerts)schemas.QnapStorageReading.properties.alerts.maxItems=256;
 schemas.ServiceResourceMetrics??=object({});
 schemas.ServiceResourceMetrics.additionalProperties=false;
 Object.assign(schemas.ServiceResourceMetrics.properties,{
  cpuPercent:percent,memoryUsedGB:{type:'number',minimum:0,maximum:100000},directory:{type:'string',pattern:'^/',maxLength:2000},
  diskUsedGB:{type:'number',minimum:0,maximum:1000000},diskObservedAt:date,
 });
 for(const name of ['ServiceProcessInput','ServiceProcessObservation'])if(schemas[name]?.properties){
  schemas[name].additionalProperties=false;schemas[name].properties.resources=ref('ServiceResourceMetrics');
 }
 const heartbeat=schemas.ExecutionHeartbeatInput;
 if(heartbeat?.properties){
  heartbeat.additionalProperties=false;
  heartbeat.properties.metrics??=object({});heartbeat.properties.metrics.additionalProperties=false;
  Object.assign(heartbeat.properties.metrics.properties,Object.fromEntries(['cpuPercent','memoryPercent','diskPercent','gpuPercent'].map(name=>[name,percent])),
   Object.fromEntries(['memoryUsedGB','memoryTotalGB','diskFreeGB','diskTotalGB','load1','uptimeSec','powerWatts'].map(name=>[name,sampleNumber])));
  heartbeat.properties.metrics.properties.uptimeSec=uptime;
  Object.assign(heartbeat.properties,{cpuPower:ref('CpuPowerSample'),metricSources,metricMeasuredAt,observationVersion:{type:'integer',minimum:0}});
  if(schemas.QnapStorageSample)heartbeat.properties.storage=ref('QnapStorageSample');
  if(schemas.ServiceProcessInput)heartbeat.properties.serviceProcesses={...(heartbeat.properties.serviceProcesses??{}),type:'array',maxItems:32,items:ref('ServiceProcessInput')};
 }
 const infrastructure=schemas.InfrastructureRecord?.properties,telemetry=infrastructure?.telemetry;
 if(telemetry?.properties){
  telemetry.additionalProperties=false;
  Object.assign(telemetry.properties,Object.fromEntries(['cpuPercent','memoryPercent','diskPercent','gpuPercent'].map(name=>[name,percent])),
   Object.fromEntries(['memoryUsedGB','memoryTotalGB','diskFreeGB','diskTotalGB','load1','uptimeSec'].map(name=>[name,positive])),
   {uptimeSec:uptime,powerWatts:sampleNumber,cpuPower:ref('CpuPowerSample'),metricSources,metricMeasuredAt,metricFreshness});
  if(schemas.QnapStorageReading)telemetry.properties.storage=ref('QnapStorageReading');
 }
 if(infrastructure&&schemas.ServiceProcessObservation)infrastructure.processObservation=ref('ServiceProcessObservation');
 if(schemas.MonitorSnapshot?.properties)schemas.MonitorSnapshot.properties.unknownMetrics={type:'array',minItems:0,maxItems:2,uniqueItems:true,items:{enum:['gpuPercent','powerWatts']}};
 const monitorValues=schemas.MonitorPoint?.properties.values;
 if(monitorValues?.properties){
  const fields=['diskPercent','diskFreeGB','diskTotalGB','diskUsedGB','cpuPackageWatts'];
  monitorValues.additionalProperties=false;
  Object.assign(monitorValues.properties,Object.fromEntries(fields.map(name=>[name,{anyOf:[ref('MonitorMetric'),{type:'null'}]}])));
  monitorValues.required=[...new Set([...(monitorValues.required??[]),...fields])];
 }
 return document;
};
