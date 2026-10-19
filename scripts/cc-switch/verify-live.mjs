/**
 * Bounded live CC Switch API verification.
 * --execute --base-url=https://cc-jarvis.ikvein.com --data-dir=/var/lib/jarvis/data
 * [--ca-file=/path/to/public-ca.pem] [--report=/path/to/public-result.json]
 *
 * Creates one 120-second session in memory, selects each already-current provider,
 * verifies the public configuration is unchanged, then revokes only its own session.
 * Never reads a password or an existing login hash. No model requests are made.
 */
import {randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {request} from 'node:https';
import {readFileSync,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname,isAbsolute} from 'node:path';

const prefix='/api/runtime/cc-switch/machines';
const ownCode=/^LIVE_[A-Z_]+$/;
const ensure=(condition,code)=>{if(!condition)throw new Error(code);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const providerId=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const revision=/^[a-f0-9]{64}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function keys(value,allowed,code){
 ensure(object(value)&&Object.keys(value).every(key=>allowed.includes(key)),code);
 ensure(allowed.every(key=>Object.hasOwn(value,key)),code);
}
function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
const fingerprint=value=>createHash('sha256').update(canonical(value)).digest('hex');
function snapshot(value,machine){
 const code='LIVE_SNAPSHOT_SCHEMA';
 keys(value,['machineId','host','application','observedAt','currentProviderId','providers'],code);
 ensure(value.machineId===machine.id&&value.host===machine.host&&value.application==='claude'&&Number.isFinite(Date.parse(value.observedAt)),code);
 ensure(Array.isArray(value.providers)&&value.providers.length<=200,code);
 const ids=new Set();
 for(const item of value.providers){
  keys(item,['id','name','baseUrl','model','models','authType','credentialConfigured','isCurrent','revision'],code);
  ensure(providerId.test(item.id)&&!ids.has(item.id),code);ids.add(item.id);
  ensure(typeof item.name==='string'&&item.name.length>0&&item.name.length<=300&&typeof item.baseUrl==='string'&&item.baseUrl.length<=2048&&typeof item.model==='string'&&item.model.length<=300,code);
  keys(item.models,['opus','sonnet','haiku','fable','subagent'],code);
  ensure(Object.values(item.models).every(v=>typeof v==='string'&&v.length<=300),code);
  ensure(['auth-token','api-key'].includes(item.authType)&&typeof item.credentialConfigured==='boolean'&&typeof item.isCurrent==='boolean'&&revision.test(item.revision),code);
  ensure(item.isCurrent===(item.id===value.currentProviderId),code);
 }
 ensure(value.currentProviderId===null||ids.has(value.currentProviderId),code);return value;
}
function inventory(value){return {currentProviderId:value.currentProviderId,providers:[...value.providers].sort((a,b)=>a.id.localeCompare(b.id))};}
function parameters(){
 const options={execute:false};
 const names=new Map([['base-url','baseUrl'],['data-dir','dataDir'],['ca-file','caFile'],['report','report']]);
 for(const arg of process.argv.slice(2)){
  if(arg==='--execute'){options.execute=true;continue;}
  const match=/^--([a-z-]+)=(.+)$/.exec(arg);
  ensure(match&&names.has(match[1]),'LIVE_ARGUMENT_INVALID');options[names.get(match[1])]=match[2];
 }
 return options;
}
function http(base,ca,path,method='GET',body,token=''){
 return new Promise((resolveResponse,reject)=>{
  const target=new URL(path,base),data=body===undefined?undefined:Buffer.from(JSON.stringify(body));
  const fail=()=>reject(new Error('LIVE_HTTP_UNAVAILABLE'));
  const req=request(target,{method,ca,rejectUnauthorized:true,headers:{accept:'application/json',...(token?{cookie:'jarvis_session='+token}:{}),...(data?{'content-type':'application/json','content-length':data.length}:{})}},response=>{
   let size=0;const chunks=[];
   response.on('error',fail);response.on('data',chunk=>{size+=chunk.length;if(size>1024*1024){response.destroy();fail();return;}chunks.push(Buffer.from(chunk));});
   response.on('end',()=>{
    try{resolveResponse({status:response.statusCode,value:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch{reject(new Error('LIVE_HTTP_RESPONSE_INVALID'));}
   });
  });
  req.setTimeout(100_000,()=>{req.destroy();fail();});req.on('error',fail);if(data)req.write(data);req.end();
 });
}
async function run(options){
 const report={schema:'jarvis-cc-switch-live-validation-v1',startedAt:new Date().toISOString(),status:'failed',checks:[],machines:[],sessionTtlSeconds:120,sessionCreated:false,sessionRevoked:false,credentialsPersisted:false,modelRequests:0,providerContentWrites:0,selectionChanged:false};
 let db,token='',tokenHash='',created=false,failure;
 try{
  const base=new URL(options.baseUrl);
  ensure(base.protocol==='https:'&&!base.username&&!base.password&&!base.search&&!base.hash&&base.pathname==='/'&&['cc-jarvis.ikvein.com','localhost','127.0.0.1','192.168.10.112'].includes(base.hostname),'LIVE_TARGET_INVALID');
  ensure(typeof options.dataDir==='string'&&isAbsolute(options.dataDir),'LIVE_DATA_DIRECTORY_INVALID');
  const database=join(resolve(options.dataDir),'jarvis.db');ensure(existsSync(database)&&statSync(database).isFile(),'LIVE_DATABASE_MISSING');
  const ca=options.caFile?readFileSync(resolve(options.caFile)):undefined;
  const anonymous=await http(base,ca,prefix);ensure(anonymous.status===401,'LIVE_ANONYMOUS_AUTH_FAILED');report.checks.push('anonymous-401');
  db=new DatabaseSync(database);db.exec('PRAGMA busy_timeout=5000');
  ensure(!!db.prepare('SELECT 1 AS present FROM auth WHERE id=1').get(),'LIVE_ACCOUNT_MISSING');
  // Schema and hash algorithm match Store.createLogin and IdentityRuntime.
  const columns=db.prepare('PRAGMA table_info(logins)').all().map(row=>row.name);
  ensure(['tokenHash','expiresAt','createdAt'].every(column=>columns.includes(column)),'LIVE_SESSION_SCHEMA_INVALID');
  token=randomBytes(32).toString('base64url');tokenHash=createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO logins(tokenHash,expiresAt,createdAt) VALUES(?,?,?)').run(tokenHash,Date.now()+120_000,new Date().toISOString());
  created=true;report.sessionCreated=true;
  const list=await http(base,ca,prefix,'GET',undefined,token);ensure(list.status===200,'LIVE_MACHINE_LIST_FAILED');
  keys(list.value,['machines','configured'],'LIVE_MACHINE_SCHEMA');ensure(list.value.configured===true&&Array.isArray(list.value.machines)&&list.value.machines.length===3,'LIVE_MACHINE_SCHEMA');
  const seen=new Set();
  for(const machine of list.value.machines){
   keys(machine,['id','name','address','host'],'LIVE_MACHINE_SCHEMA');
   ensure(uuid.test(machine.id)&&['101','112','116'].includes(machine.host)&&!seen.has(machine.host)&&machine.address==='192.168.10.'+machine.host&&typeof machine.name==='string','LIVE_MACHINE_SCHEMA');seen.add(machine.host);
  }
  report.checks.push('fixed-three-machines-no-secret-fields');
  for(const machine of list.value.machines){
   const path=prefix+'/'+machine.id+'/providers';
   const initialResponse=await http(base,ca,path,'GET',undefined,token);ensure(initialResponse.status===200,'LIVE_PROVIDER_LIST_FAILED');
   const initial=snapshot(initialResponse.value,machine),current=initial.providers.find(item=>item.id===initial.currentProviderId);
   ensure(current,'LIVE_CURRENT_PROVIDER_MISSING');
   const beforeHash=fingerprint(inventory(initial));
   // Explicitly switch to the exact already-current provider. Never retry automatically.
   const mutation=await http(base,ca,path+'/'+encodeURIComponent(current.id)+'/switch','POST',{expectedRevision:current.revision},token);
   ensure(mutation.status===200,'LIVE_SAME_PROVIDER_SWITCH_FAILED');
   ensure(fingerprint(inventory(snapshot(mutation.value,machine)))===beforeHash,'LIVE_CONFIGURATION_CHANGED');
   const readback=await http(base,ca,path,'GET',undefined,token);ensure(readback.status===200,'LIVE_READBACK_FAILED');
   ensure(fingerprint(inventory(snapshot(readback.value,machine)))===beforeHash,'LIVE_CONFIGURATION_CHANGED');
   report.machines.push({host:machine.host,providerCount:initial.providers.length,currentProviderId:initial.currentProviderId,publicConfigurationSha256:beforeHash,listPassed:true,sameProviderSwitchPassed:true,readbackUnchanged:true});
  }
  report.checks.push('all-provider-snapshots-no-secret-fields','three-same-provider-mutations','three-readbacks-unchanged');
 }catch(error){failure=ownCode.test(error?.message??'')?error.message:'LIVE_CHECK_FAILED';}
 finally{
  if(db&&created){try{
   db.prepare('DELETE FROM logins WHERE tokenHash=?').run(tokenHash);
   report.sessionRevoked=!db.prepare('SELECT 1 AS present FROM logins WHERE tokenHash=?').get(tokenHash);
   if(!report.sessionRevoked)failure='LIVE_SESSION_CLEANUP_FAILED';
  }catch{failure='LIVE_SESSION_CLEANUP_FAILED';}}
  if(db)try{db.close();}catch{failure='LIVE_DATABASE_CLOSE_FAILED';}
  token='';tokenHash='';
 }
 report.completedAt=new Date().toISOString();report.status=!failure&&report.sessionRevoked&&report.machines.length===3?'passed':'failed';if(failure)report.failure={code:failure};
 if(options.report){const path=resolve(options.report);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n',{mode:0o600});}
 console.log(JSON.stringify(report));if(report.status!=='passed')process.exitCode=1;
}
try{
 const options=parameters();
 if(!options.execute)console.log(JSON.stringify({status:'prepared',executesProduction:false,requiredArguments:['--execute','--base-url=https://cc-jarvis.ikvein.com','--data-dir=/var/lib/jarvis/data'],optionalArguments:['--ca-file=/path/to/public-ca.pem','--report=/path/to/public-result.json'],sessionTtlSeconds:120,sessionOnlyInMemory:true,operations:['anonymous GET','authenticated machines/providers GET','switch to each already-current provider','read back unchanged public configuration','revoke only the temporary session']}));
 else await run(options);
}catch(error){console.log(JSON.stringify({status:'failed',failure:{code:ownCode.test(error?.message??'')?error.message:'LIVE_PREPARATION_FAILED'},credentialsPersisted:false}));process.exitCode=1;}
