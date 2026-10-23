/** Separate fixed AI development worker. No HTTP listener, model calls or platform DB. */
import {createHash,createDecipheriv,createCipheriv,randomBytes,randomUUID} from 'node:crypto';
import {constants,lstatSync,openSync,readFileSync,fstatSync,fchmodSync,closeSync,writeFileSync,fsyncSync,renameSync,unlinkSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve,parse,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA=/^[a-f0-9]{64}$/; const SLUG=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const ACTIONS=new Set(['probe','configure','telemetry']);
const FINAL=new Set(['succeeded','failed','unknown']);
export function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(v=>canonical(v??null)).join(',')+']';
 return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
function check(ok,code){if(!ok)throw Error(code);}
function text(value,max=300){check(typeof value==='string'&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value),'INVALID_PUBLIC_TEXT');return value;}
function exact(value,keys){check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k)),'UNEXPECTED_FIELDS');}
export function validateProfile(p){
 exact(p,['id','revision','name','tools','providers','statuslineVersion']);check(SLUG.test(p.id)&&Number.isSafeInteger(p.revision)&&p.revision>0,'INVALID_PROFILE');text(p.name);text(p.statuslineVersion,100);
 check(Array.isArray(p.tools)&&p.tools.length<=20&&Array.isArray(p.providers)&&p.providers.length<=32,'INVALID_PROFILE');
 for(const t of p.tools){exact(t,['name','version']);check(SLUG.test(t.name),'INVALID_TOOL');text(t.version,100);}
 for(const v of p.providers){exact(v,['id','name','model','credentialConfigured']);check(SLUG.test(v.id)&&typeof v.credentialConfigured==='boolean','INVALID_PROVIDER');text(v.name);if(v.model!==null)text(v.model);}
 check(new Set(p.providers.map(v=>v.id)).size===p.providers.length,'DUPLICATE_PROVIDER');return p;
}
export function validatePolicy(p){
 exact(p,['version','profiles','nodes']);check(p.version===1&&Array.isArray(p.profiles)&&p.profiles.length<=30&&Array.isArray(p.nodes)&&p.nodes.length<=100,'INVALID_POLICY');
 p.profiles.forEach(validateProfile);check(new Set(p.profiles.map(v=>v.id)).size===p.profiles.length,'DUPLICATE_PROFILE');
 for(const n of p.nodes){exact(n,['machineId','nodeId','address','targetUser','profileIds']);check(SLUG.test(n.machineId)&&SLUG.test(n.nodeId)&&typeof n.address==='string'&&/^[A-Za-z0-9.:-]{1,253}$/.test(n.address)&&/^[a-z_][a-z0-9_-]{0,31}$/.test(n.targetUser)&&n.targetUser!=='root','INVALID_NODE');check(Array.isArray(n.profileIds)&&n.profileIds.length>0&&n.profileIds.every(id=>p.profiles.some(v=>v.id===id)),'INVALID_NODE_PROFILE');}
 check(new Set(p.nodes.map(n=>n.machineId)).size===p.nodes.length,'DUPLICATE_MACHINE');return p;
}
export function validateRequest(r,policy,legacy,now=Date.now(),allowExpired=false){
 exact(r,['schemaVersion','id','commandId','machineId','machineRevision','nodeId','address','targetUser','action','profileId','profileRevision','profileHash','policyHash','bindingHash','createdAt','expiresAt','actorId','authorizationHash','profile']);
 check(r.schemaVersion===1&&UUID.test(r.id)&&UUID.test(r.commandId)&&ACTIONS.has(r.action)&&Number.isSafeInteger(r.machineRevision)&&r.machineRevision>0,'INVALID_REQUEST');text(r.actorId);check(SHA.test(r.authorizationHash),'INVALID_AUTHORIZATION');
 const node=policy.nodes.find(n=>n.machineId===r.machineId),profile=policy.profiles.find(p=>p.id===r.profileId),peer=legacy.nodes.find(n=>n.machineId===r.machineId);
 check(node&&profile&&peer&&node.profileIds.includes(profile.id)&&node.nodeId===r.nodeId&&node.address===r.address&&node.targetUser===r.targetUser&&peer.nodeId===r.nodeId&&peer.address===r.address&&/^[A-Za-z0-9_-]{1,100}$/.test(peer.alias),'TARGET_POLICY_CHANGED');
 check(r.profileRevision===profile.revision&&r.profileHash===hash(profile)&&hash(r.profile)===hash(profile)&&r.policyHash===hash(policy),'PROFILE_POLICY_CHANGED');
 const binding={machineId:r.machineId,machineRevision:r.machineRevision,address:r.address,nodeId:r.nodeId,targetUser:r.targetUser,action:r.action,profileId:r.profileId,profileRevision:r.profileRevision,profileHash:r.profileHash,policyHash:r.policyHash};
 check(SHA.test(r.bindingHash)&&r.bindingHash===hash(binding),'BINDING_DIFFERS');
 const created=Date.parse(r.createdAt),expires=Date.parse(r.expiresAt);check(Number.isFinite(created)&&Number.isFinite(expires)&&created<=now+5000&&expires>created&&expires-created<=900000&&(!allowExpired||created<=now+5000),'INVALID_DEADLINE');
 check(allowExpired||expires>now,'REQUEST_EXPIRED');return peer;
}
function noLinks(path){let cursor=parse(resolve(path)).root;for(const part of resolve(path).slice(cursor.length).split('/').filter(Boolean)){cursor=join(cursor,part);check(!lstatSync(cursor).isSymbolicLink(),'LINKED_STORAGE');}}
export function readSafe(path,{uid,privateFile=false,max=524288}={}){
 noLinks(path);const st=lstatSync(path);check(st.isFile()&&st.nlink===1&&st.size<=max&&!(st.mode&0o002)&&(uid===undefined||st.uid===uid)&&(!privateFile||(st.mode&0o027)===0),'UNSAFE_FILE');
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const a=fstatSync(fd),raw=readFileSync(fd),b=fstatSync(fd);check(a.dev===st.dev&&a.ino===st.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&raw.length===a.size,'FILE_CHANGED');return raw;}finally{closeSync(fd);}
}
function json(path,opts){return JSON.parse(readSafe(path,opts));}
export function atomic(path,value,mode=0o640){
 noLinks(dirname(path));try{const st=lstatSync(path);check(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1,'UNSAFE_DESTINATION');}catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=path+'.'+randomUUID()+'.tmp',fd=openSync(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),mode);
 try{fchmodSync(fd,mode);writeFileSync(fd,canonical(value));fsyncSync(fd);}finally{closeSync(fd);}try{renameSync(temp,path);const d=openSync(dirname(path),constants.O_RDONLY);try{fsyncSync(d);}finally{closeSync(d);}}finally{try{unlinkSync(temp);}catch{}}
}
export function encryptVault(value,key=randomBytes(32),iv=randomBytes(12)){
 check(key.length===32&&iv.length===12,'INVALID_VAULT_KEY');const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('jarvis-ai-development-v1'));
 const data=Buffer.concat([cipher.update(canonical(value),'utf8'),cipher.final()]);return {key,vault:{schemaVersion:1,algorithm:'AES-256-GCM',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:data.toString('base64')}};
}
export function decryptVault(v,key){
 exact(v,['schemaVersion','algorithm','iv','tag','ciphertext']);check(v.schemaVersion===1&&v.algorithm==='AES-256-GCM'&&key.length===32,'INVALID_VAULT');const iv=Buffer.from(v.iv,'base64'),tag=Buffer.from(v.tag,'base64'),data=Buffer.from(v.ciphertext,'base64');check(iv.length===12&&tag.length===16&&data.length<=262144,'INVALID_VAULT');const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from('jarvis-ai-development-v1'));decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));
}
const NUMERIC=['cpuPercent','ramUsedBytes','ramTotalBytes','diskFreeBytes','diskTotalBytes','load1m','memoryPercent','memoryTotalGB','memoryUsedGB','diskFreeGB','diskPercent'];
const SESSION_NUM=['contextTokens','contextWindow','currentInputTokens','currentOutputTokens','cacheReadTokens','cacheCreationTokens','sessionCostUSD','rateLimitFiveHourPercent','rateLimitSevenDayPercent'];
const STATUSLINE_STATES=['match','missing','different','invalid','unreadable','unknown','not-applicable'];
const STATUSLINE_LAYERS=['SCRIPT','GLOBAL','COMMON','CURRENT_PROVIDER'];
const STATUSLINE_REASONS=new Set([...STATUSLINE_LAYERS.flatMap(layer=>STATUSLINE_STATES.map(state=>`STATUSLINE_${layer}_${state.replaceAll('-','_').toUpperCase()}`)),...['ZERO','MATCHED','MISSING','DIFFERENT','INVALID','UNKNOWN'].map(state=>`STATUSLINE_PROVIDER_COUNT_${state}`)]);
const STATUSLINE_COUNTS=['total','matched','missing','different','invalid','unknown'];
function numbers(input,keys){return Object.fromEntries(keys.filter(k=>input?.[k]===null||typeof input?.[k]==='number'&&Number.isFinite(input[k])&&input[k]>=0).map(k=>[k,input[k]]));}
export function sanitizeInventory(input){
 check(input&&Array.isArray(input.tools)&&input.tools.length<=20&&Array.isArray(input.providers)&&input.providers.length<=32,'INVALID_INVENTORY');
 const nullable=(v,max=300)=>v===null?null:text(v,max);
 const out={schemaVersion:1,tools:input.tools.map(t=>{check(SLUG.test(t.name)&&typeof t.installed==='boolean','INVALID_TOOL');return {name:t.name,version:nullable(t.version,100),installed:t.installed,path:nullable(t.path,2000),matchesPinned:t.matchesPinned===true,authStatus:['configured','missing','unknown'].includes(t.authStatus)?t.authStatus:'unknown'};}),providers:input.providers.map(p=>({id:text(p.id,100),name:text(p.name),model:nullable(p.model),credentialConfigured:p.credentialConfigured===true,current:p.current===true}))};
 if(input.observedAt)out.observedAt=text(input.observedAt,100);
 if(input.statusline){const s=input.statusline;out.statusline={configured:s.configured===true,commandSHA256:s.commandSHA256===null?null:SHA.test(s.commandSHA256)?s.commandSHA256:null,scope:s.scope==='global-and-provider'?s.scope:'global-and-provider',resources:s.resources===true};const d=s;if(Object.hasOwn(s,'diagnosticsVersion')&&d.diagnosticsVersion===1&&d.layers&&d.providers&&Array.isArray(d.reasonCodes)&&d.reasonCodes.every(code=>STATUSLINE_REASONS.has(code))&&['script','global','common','currentProvider'].every(key=>STATUSLINE_STATES.includes(d.layers[key]))&&STATUSLINE_COUNTS.every(key=>Number.isSafeInteger(d.providers[key])&&d.providers[key]>=0)&&d.providers.total===STATUSLINE_COUNTS.slice(1).reduce((sum,key)=>sum+d.providers[key],0)){out.statusline.diagnosticsVersion=1;out.statusline.layers=Object.fromEntries(['script','global','common','currentProvider'].map(key=>[key,d.layers[key]]));out.statusline.providers=Object.fromEntries(STATUSLINE_COUNTS.map(key=>[key,d.providers[key]]));out.statusline.reasonCodes=[...new Set(d.reasonCodes)];}}
 out.resources=input.resources===null?null:numbers(input.resources,NUMERIC);
 const s=input.sessionSummary??input.terminalTelemetry;if(s){const counts=numbers(s,SESSION_NUM);out.terminalTelemetry={schemaVersion:1,observedAt:text(s.observedAt,100),sessionId:typeof s.sessionId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s.sessionId)?s.sessionId:null,model:nullable(s.model),provider:nullable(s.provider),...Object.fromEntries(SESSION_NUM.map(k=>[k,counts[k]??null])),billingStatus:s.billingStatus==='estimated'?'estimated':'unknown'};}else out.terminalTelemetry=null;
 return out;
}
function ssh(cfg,peer,payload){return new Promise((resolvePromise,reject)=>{
 const child=spawn('/usr/bin/ssh',['-F',cfg.sshConfig,'-o','BatchMode=yes',peer.alias,'fixed-operation'],{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['pipe','pipe','ignore']});let bytes=0,chunks=[];const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('SSH_TIMEOUT'));},20000);
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>524288){child.kill('SIGKILL');return;}chunks.push(chunk);});child.on('error',()=>{clearTimeout(timer);reject(Error('SSH_UNAVAILABLE'));});child.on('close',code=>{clearTimeout(timer);if(code!==0||bytes>524288)return reject(Error('REMOTE_UNAVAILABLE'));try{resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('INVALID_REMOTE_RECEIPT'));}});child.stdin.on('error',()=>{});child.stdin.end(canonical(payload));
});}
export async function runController(configPath){
 check(process.getuid?.()!==0,'CONTROLLER_REQUIRES_UNPRIVILEGED_USER');const cfg=json(configPath,{uid:0,privateFile:true});check(cfg.schemaVersion===1&&cfg.queue==='/var/lib/jarvis-ai-development-queue'&&cfg.state==='/var/lib/jarvis-ai-development'&&cfg.sshConfig==='/etc/jarvis-control/ssh_config','INVALID_CONTROLLER_CONFIG');
 const loadLegacy=()=>{const value=json(cfg.legacyConfig,{uid:0});return {nodes:value.nodes.map(({machineId,nodeId,address,alias})=>({machineId,nodeId,address,alias}))};};
 readSafe(cfg.sshConfig,{uid:0});const state=cfg.state;noLinks(state);const jobs=new Map();
 for(const f of readdirSync(state)){if(UUID.test(f.slice(0,-5))&&f.endsWith('.json')){const saved=json(join(state,f),{uid:process.getuid(),privateFile:true});jobs.set(saved.request.id,saved);}}
 const publish=record=>{atomic(join(state,record.request.id+'.json'),record,0o600);const r=record.request;atomic(join(cfg.queue,'results',r.id+'.json'),{schemaVersion:1,id:r.id,machineId:r.machineId,profileId:r.profileId,profileRevision:r.profileRevision,profileHash:r.profileHash,bindingHash:r.bindingHash,status:record.status,at:new Date().toISOString(),summary:record.summary,...(record.inventory?{inventory:record.inventory}:{})});};
 const observe=async(policy,node,profile)=>{
  const createdAt=new Date().toISOString(),id=randomUUID(),binding={machineId:node.machineId,machineRevision:1,address:node.address,nodeId:node.nodeId,targetUser:node.targetUser,action:'telemetry',profileId:profile.id,profileRevision:profile.revision,profileHash:hash(profile),policyHash:hash(policy)};
  const r={schemaVersion:1,id,commandId:id,...binding,bindingHash:hash(binding),createdAt,expiresAt:new Date(Date.now()+30000).toISOString(),actorId:'fixed-ai-development-telemetry',authorizationHash:hash('fixed-ai-development-telemetry-v1'),profile};
  try{const peer=validateRequest(r,policy,loadLegacy()),reply=await ssh(cfg,peer,{schemaVersion:1,mode:'ai-development',operation:'observe',id,machineId:node.machineId,request:r});check(reply.id===id&&reply.machineId===r.machineId&&reply.bindingHash===r.bindingHash&&reply.profileId===r.profileId&&reply.profileRevision===r.profileRevision&&reply.profileHash===r.profileHash&&reply.status==='succeeded','OBSERVATION_UNVERIFIED');const current=validatePolicy(json(cfg.policy,{uid:0}));check(hash(current)===hash(policy),'OBSERVATION_POLICY_CHANGED');atomic(join(cfg.queue,'results','observations',node.machineId+'.json'),{schemaVersion:1,machineId:node.machineId,nodeId:node.nodeId,address:node.address,targetUser:node.targetUser,profileId:profile.id,profileRevision:profile.revision,profileHash:hash(profile),policyHash:hash(policy),at:new Date().toISOString(),inventory:sanitizeInventory(reply.inventory),source:'fixed-ssh-ai-development-telemetry'});}catch{/* The last actual observation ages into unknown; no synthetic healthy sample. */}
 };
 let sampling=false;const sample=async()=>{if(sampling)return;sampling=true;try{const policy=validatePolicy(json(cfg.policy,{uid:0}));const list=[...policy.nodes];for(let i=0;i<list.length;i+=4)await Promise.all(list.slice(i,i+4).map(node=>observe(policy,node,policy.profiles.find(p=>p.id===node.profileIds[0]))));}finally{sampling=false;}};
 const heartbeat=()=>atomic(join(cfg.queue,'results','_status.json'),{schemaVersion:1,at:new Date().toISOString(),online:true});
 let running=false;const pump=async()=>{if(running)return;running=true;try{
  for(const name of readdirSync(join(cfg.queue,'requests')).filter(f=>UUID.test(f.slice(0,-5))&&f.endsWith('.json'))){const id=name.slice(0,-5);if(jobs.has(id))continue;let r;try{r=json(join(cfg.queue,'requests',name),{uid:cfg.producerUid,max:65536});check(r.id===id,'REQUEST_ID_DIFFERS');validateRequest(r,validatePolicy(json(cfg.policy,{uid:0})),loadLegacy());}catch{continue;}const record={request:r,status:'queued',attempted:false,summary:'Waiting for fixed AI development dispatcher'};jobs.set(id,record);publish(record);}
  for(const record of jobs.values()){
   if(FINAL.has(record.status))continue;const r=record.request;
   try{
    const policy=validatePolicy(json(cfg.policy,{uid:0})),peer=validateRequest(r,policy,loadLegacy());check(hash(json(join(cfg.queue,'requests',r.id+'.json'),{uid:cfg.producerUid,max:65536}))===hash(r),'REQUEST_CHANGED');
    let providers;const operation=record.attempted?'status':'start';if(!record.attempted&&r.action==='configure'){const vault=decryptVault(json(cfg.vault,{uid:0,privateFile:true}),readSafe(cfg.vaultKey,{uid:0,privateFile:true}));providers=vault.profiles?.[r.profileId]?.providers;check(Array.isArray(providers),'PROFILE_CREDENTIALS_UNAVAILABLE');}
    if(!record.attempted){record.attempted=true;record.status='running';record.summary='Fixed operation sent once; subsequent checks only read its receipt';publish(record);}
    const reply=await ssh(cfg,peer,{schemaVersion:1,mode:'ai-development',operation,id:r.id,machineId:r.machineId,request:r,...(providers?{providers}:{})});
    check(reply.id===r.id&&reply.machineId===r.machineId&&reply.bindingHash===r.bindingHash&&reply.profileHash===r.profileHash&&reply.profileId===r.profileId&&reply.profileRevision===r.profileRevision,'REMOTE_BINDING_DIFFERS');check(['running','succeeded','failed','unknown'].includes(reply.status),'INVALID_REMOTE_STATUS');
    record.status=reply.status;record.summary=reply.status==='succeeded'?'Fixed environment observation completed':reply.status==='running'?'Fixed environment operation remains in progress':reply.status==='unknown'?'Operation result cannot be confirmed; configuration will not be replayed':'Fixed environment operation failed';
    if(reply.status==='succeeded'){record.inventory=sanitizeInventory(reply.inventory);if(r.action==='configure')await observe(policy,policy.nodes.find(n=>n.machineId===r.machineId),policy.profiles.find(p=>p.id===r.profileId));}
   }catch{record.status=record.attempted&&Date.parse(r.expiresAt)>Date.now()?'running':'unknown';record.summary=record.status==='running'?'Remote receipt unavailable; waiting without replay':'Deadline, policy or durable receipt could not be confirmed; no replay';}
   publish(record);
  }
 }finally{running=false;}};
 heartbeat();const heart=setInterval(()=>{try{heartbeat();}catch{}},10000),samplingTimer=setInterval(()=>void sample().catch(()=>{}),60000);await pump();const timer=setInterval(()=>void pump().catch(()=>{}),5000);for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{clearInterval(timer);clearInterval(heart);clearInterval(samplingTimer);process.exit(0);});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='--encrypt-vault'){try{let raw='';for await(const c of process.stdin){raw+=c;if(Buffer.byteLength(raw)>262144)throw Error('VAULT_TOO_LARGE');}const result=encryptVault(JSON.parse(raw));process.stdout.write(JSON.stringify({vault:result.vault,key:result.key.toString('base64')}));}catch{process.stderr.write('VAULT_ENCODING_FAILED\n');process.exitCode=1;}}
 else if(process.argv[2]==='--config'&&process.argv[3])runController(process.argv[3]).catch(()=>{process.stderr.write('AI_DEVELOPMENT_CONTROLLER_FAILED\n');process.exitCode=1;});
 else throw Error('FIXED_CONFIG_REQUIRED');
}
