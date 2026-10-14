import {readFile,writeFile} from 'node:fs/promises';
const path='docs/openapi-v1-planned.json',spec=JSON.parse(await readFile(path,'utf8'));
spec.components.securitySchemes.RemoteOpsAdminCookie={type:'apiKey',in:'cookie',name:'jarvis_session',description:'本人管理员会话；家庭成员及房间终端身份不授予运维权限。'};
// Application routes are implemented and covered by the accompanying runtime regression test.
for(const [path,item] of Object.entries(spec.paths))if(path.startsWith('/api/runtime/applications'))for(const operation of Object.values(item)){if(operation&&typeof operation==='object'&&operation.operationId){operation['x-implementation-status']='implemented';operation.security=[{RemoteOpsAdminCookie:[]}];}}
const schemas=spec.components.schemas;
schemas.RemoteOpsTarget={type:'object',additionalProperties:false,required:['kind','id'],properties:{kind:{type:'string',enum:['machine','service','application']},id:{type:'string',minLength:1,maxLength:200}}};
schemas.RemoteOpsPrepare={type:'object',additionalProperties:false,required:['requestId','target','action'],properties:{requestId:{type:'string',format:'uuid'},target:{$ref:'#/components/schemas/RemoteOpsTarget'},action:{type:'string',enum:['diagnose','start','stop','restart','reboot','poweroff']}}};
schemas.RemoteOpsExecute={type:'object',additionalProperties:false,required:['expectedVersion'],properties:{expectedVersion:{type:'integer',minimum:1},confirmed:{type:'boolean',default:false},confirmTitle:{type:'string',maxLength:500,default:''}}};
schemas.RemoteOpsJob={type:'object',required:['id','target','machineId','action','title','status','revision'],properties:{id:{type:'string',format:'uuid'},requestId:{type:'string',format:'uuid'},target:{$ref:'#/components/schemas/RemoteOpsTarget'},machineId:{type:'string'},nodeId:{type:'string'},action:{type:'string',enum:['diagnose','start','stop','restart','reboot','poweroff']},title:{type:'string'},impact:{type:'string'},bindingHash:{type:'string'},affectedProjects:{type:'array',items:{type:'string'}},requiresConfirmation:{type:'boolean'},status:{type:'string',enum:['prepared','queued','running','verifying','accepted','succeeded','failed','offline-unconfirmed','unknown','cancelled','expired']},revision:{type:'integer'},createdAt:{type:'string',format:'date-time'},expiresAt:{type:'string',format:'date-time'},result:{type:['object','null'],description:'独立控制器实际回执；包含服务状态、诊断、访问检查。未收到或未通过核实的结果不能报告成功。'}}};
const base='/api/runtime/remote-ops',job={$ref:'#/components/schemas/RemoteOpsJob'},empty={type:'object',additionalProperties:false},id={name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}};
for(const [suffix,method,summary,input,output,parameters] of [
 ['/capabilities','get','读取五台服务器固定运维能力及独立控制在线状态',null,{type:'object'},[]],
 ['/jobs','get','读取管理员真实运维历史',null,{type:'array',items:job},[{name:'machineId',in:'query',schema:{type:'string',maxLength:200}}]],
 ['/jobs/{id}','get','读取单条持久回执',null,job,[id]],
 ['/prepare','post','冻结目标、影响及五分钟有效确认；不执行操作',{$ref:'#/components/schemas/RemoteOpsPrepare'},job,[]],
 ['/jobs/{id}/execute','post','确认一次并派发；相同任务不会重复操作',{$ref:'#/components/schemas/RemoteOpsExecute'},job,[id]],
 ['/jobs/{id}/cancel','post','取消尚未派发的确认',null,job,[id]],
 ['/control-session','post','签发独立运维十五分钟HttpOnly会话',empty,{type:'object',properties:{url:{type:'string',const:'/control/'}}},[]],
 ['/recovery-code','post','管理员显式读取独立恢复码；no-store且不送入Pi',empty,{type:'object',properties:{code:{type:'string',minLength:43,maxLength:43}}},[]]
]){const operation={operationId:'remoteops'+suffix.replace(/[^a-z]/gi,'')+method,summary,tags:['remote-operations'],security:[{RemoteOpsAdminCookie:[]}],parameters,responses:{'200':{description:'真实运维结果；派发、已接受及已断联均不等于已核实成功。',content:{'application/json':{schema:output}}},...Object.fromEntries([400,401,403,404,409,422,503].map(n=>[String(n),{description:({400:'输入或确认无效',401:'未登录',403:'非管理员、服务未授权或基础服务保护',404:'目标不存在',409:'绑定变更、确认过期或冷备保护',422:'语音目标不明确',503:'固定运维未配置或控制器离线'})[n]}]))},'x-implementation-status':'implemented'};if(input)operation.requestBody={required:true,content:{'application/json':{schema:input}}};spec.paths[base+suffix]={[method]:operation};}
if(!spec.tags.some(t=>t.name==='remote-operations'))spec.tags.push({name:'remote-operations',description:'SSH固定操作及独立恢复入口；机器启动和业务数据库读取暂不支持。'});
await writeFile(path,JSON.stringify(spec,null,2)+'\n');console.log(JSON.stringify({remoteOperationsPaths:8,machineStartSupported:false}));
