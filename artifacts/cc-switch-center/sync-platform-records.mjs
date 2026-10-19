/**
 * R56 metadata only. Default mode prepares public inputs without HTTP/DB access.
 * Execute as jarvis; token is memory-only, TTL120s, finally deletes only its hash.
 * --execute --base-url=https://cc-jarvis.ikvein.com --data-dir=/var/lib/jarvis/data
 * --evidence-dir=/path/to/public/cc-switch-center --project-name=贾维斯
 * [--ca-file=/path/to/public-ca.pem] [--report=/path/to/public-result.json]
 */
import {randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {request} from 'node:https';
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync,lstatSync} from 'node:fs';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {userInfo} from 'node:os';

const RELEASE='20261020-cc-switch-center-r56';
const SOURCE='28a9e5d55ec73aa9fb48b447025a397452a736a5';
const MARKER='[CCSWITCH-R56-20261020]';
const QUESTION=MARKER+' 三机终端模型在贾维斯集中管理，并与各机本地入口共用配置';
const EXPERIENCE=MARKER+' 多节点模型管理的配置权属、并发保护与回滚边界';
const ensure=(v,code)=>{if(!v)throw Error(code);};
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const sha=v=>createHash('sha256').update(typeof v==='string'?v:canonical(v)).digest('hex');
const commandId=key=>{const value=sha(MARKER+key);return value.slice(0,8)+'-'+value.slice(8,12)+'-4'+value.slice(13,16)+'-8'+value.slice(17,20)+'-'+value.slice(20,32);};
const roles=['environment','runCommand','verifyCommand','notes'];
const summary=[
 MARKER+' R56已上线：系统运维→运维费用→终端模型，管理101、112、116各机CC Switch。',
 '各机本地终端/系统入口保留，与平台共用各机实际配置；新增、编辑、删除及切换限定本人已登记节点，按revision拒绝并发覆盖。',
 '实证：三机各6项；HTTPS三机均对当前项作同项切换并读回一致；浏览器三机列表/116编辑框已核对，密钥输入为空，取消未保存。',
 '核验时112当前为Kimi For Coding-CCR，本轮保留；101/116为JP。未核实112变更主体或时间，此处只记录观测，不锁定后续选择。',
 '模型凭据仅送目标节点；页面、审计及公开报告不读取已保存密钥。116原CCR网关与广州Kimi入口保持。',
 'canonical MyJarvis 60e4037与发布源码28a9e5d55ec73aa9fb48b447025a397452a736a5已核对同tree；本记录不改源码或部署。',
 '用户本人操作验收仍待完成；决策为AI事实回顾，independentAcceptance=false，经验仅inbox未验证，不发布Skill。',
].join('\n');

function options(){
 const parsed={execute:false,projectName:'贾维斯',evidenceDir:dirname(fileURLToPath(import.meta.url))};
 const names={'base-url':'baseUrl','data-dir':'dataDir','ca-file':'caFile','report':'report','evidence-dir':'evidenceDir','project-name':'projectName'};
 for(const arg of process.argv.slice(2)){if(arg==='--execute'){parsed.execute=true;continue;}const m=/^--([a-z-]+)=(.+)$/.exec(arg);ensure(m&&names[m[1]],'SYNC_ARGUMENT_INVALID');parsed[names[m[1]]]=m[2];}
 return parsed;
}
function evidence(dir){
 const names=['live-api-public.json','browser-public.json','health-public.json','stage-public.json','api-validation-public.json'];
 const values={},refs=names.map(name=>{
  const path=join(resolve(dir),name);ensure(existsSync(path)&&lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'SYNC_EVIDENCE_MISSING');
  const bytes=readFileSync(path);values[name]=JSON.parse(bytes.toString('utf8'));
  return {reference:'artifacts/cc-switch-center/'+name,sha256:createHash('sha256').update(bytes).digest('hex'),kind:name==='api-validation-public.json'?'test-report':'observation'};
 });
 const live=values[names[0]],browser=values[names[1]],health=values[names[2]],stage=values[names[3]],tests=values[names[4]];
 ensure(live.status==='passed'&&live.sessionRevoked===true&&live.selectionChanged===false&&live.machines.length===3&&live.machines.every(m=>m.providerCount===6&&m.sameProviderSwitchPassed&&m.readbackUnchanged),'SYNC_LIVE_EVIDENCE_INVALID');
 ensure(browser.status==='passed'&&browser.runtimeBuild===RELEASE&&browser.apiKeyInput.empty===true&&browser.apiKeyInput.savedKeyRead===false&&browser.browserProviderMutations===0&&browser.humanUserAcceptance==='pending','SYNC_BROWSER_EVIDENCE_INVALID');
 ensure(health.success===true&&health.healthBuild===RELEASE&&stage.success===true&&stage.sourceCommit===SOURCE&&tests.status==='passed','SYNC_RELEASE_EVIDENCE_INVALID');
 return {refs,observedAt:new Date(browser.observedAt).toISOString(),sourceCommit:SOURCE};
}
function decision(data){
 const objectives=['CCSWITCH-CENTER','PRESERVE-LOCAL-CONFIG','SECRET-BOUNDARY'];
 const option=(id,title,advantages,disadvantages,compliesWithGoals,coveredObjectives,operationalImpact)=>({id,title,advantages,disadvantages,impact:title,compliesWithGoals,withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives,operationalImpact});
 return {commandId:commandId('decision-record'),expectedVersion:0,changeOf:null,questionSummary:QUESTION,
  context:{observedAt:data.observedAt,goalSpecHash:null,sourceFingerprint:null,sourceVersion:'R56 / release '+SOURCE+' / canonical MyJarvis 60e4037 同tree核对',runId:null,taskId:null,machineId:null,objectives,constraints:['保留每机本地管理和既有模型选择；不统一覆盖三机当前项','模型凭据不进入平台普通数据、审计、公开报告或已保存值回显','实际部署、技术核验、用户本人验收分别记录'],situation:summary},
  options:[option('platform-and-local','平台集中管理并保留每机本地入口',['三机同页操作','本地与平台共用目标机实际配置','有并发修订与失败恢复边界'],['需要私有受控worker和节点连接','已运行Claude进程仍需重开'], 'yes',objectives,1),option('local-only','仅沿用每机终端菜单',['已有本地入口可继续使用'],['不能满足用户新增的平台集中管理目标'], 'no',['PRESERVE-LOCAL-CONFIG','SECRET-BOUNDARY'],0)],
  chosenId:'platform-and-local',decisionRationale:'用户明确要求把三机切换及模型增改删纳入112贾维斯。已发布实现共用目标机CC Switch配置，减少三机管理步骤，同时保留本地入口、版本冲突保护和密钥边界。此为完成后的真实事实回顾，未冒充事前记录或用户验收。',
  basisRefs:data.refs,risk:'medium',affectedObjectives:objectives,rollbackPlan:{plan:'出现权限、配置或可用性问题时，先停止平台新增模型管理操作并核对目标机实际配置，再依据已验证的备份/发布恢复点制定有范围的恢复。继续保留各机本地入口和既有CCR网关；不自动恢复模型选择或覆盖外部改动。',triggers:['出现跨机、跨所有者或只读节点写入','平台与本地实际配置不一致','配置应用失败且需要人工核对'],impact:'集中管理入口可能暂时停用，本机管理仍可使用；已发生动作和历史证据保留。',requiresNewExecutionPlan:true},actions:[],status:'selected',origin:'ai'};
}
function implementation(data,revision){
 return {commandId:commandId('decision-implementation'),expectedVersion:revision,origin:'ai',reason:'依据R56已发生发布、HTTPS和浏览器公开证据追加实施；保留选择版本，独立/用户验收仍未完成。',actions:[{summary:MARKER+' 已在112发布三机集中管理；HTTPS三机各6项、同当前项mutation及读回通过；浏览器三机列表与编辑密钥空值/取消已核对。未保存编辑，112核验时的KimiCCR选择保持；未核实变更主体。',at:data.observedAt,state:'performed',evidenceRefs:data.refs}]};
}
function experience(projectId,data){
 return {commandId:commandId('experience-capture'),expectedVersion:0,scope:'personal',payload:{projectId,kind:'lesson',title:EXPERIENCE,summary:'候选经验：共用实际配置、按目标机限权、CAS保护和不回显已存密钥；本轮技术证据通过，尚未验证跨项目通用性。',conditions:'个人已授权三节点、CC Switch本地入口保留、私有worker已部署且能核对回退点；其他项目需重验配置和权限。',content:summary+'\n经验候选：配置应由单一实际存储承接多个入口；新建凭据仅在内存转交，更新留空保留；对过期revision拒绝覆盖；节点写入后连接断开应报告结果待核，先读回再决定重试。该经验未验证、未发布Skill。',source:data.refs.map(r=>r.reference+' SHA256 '+r.sha256).join('\n'),tags:['CCSwitch','多节点管理','并发保护','密钥边界','候选经验']}};}
function http(base,ca,token,path,body){
 return new Promise((done,reject)=>{
  const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body)),req=request(new URL(path,base),{method:bytes?'POST':'GET',ca,rejectUnauthorized:true,headers:{accept:'application/json',cookie:'jarvis_session='+token,...(bytes?{'content-type':'application/json','content-length':bytes.length}:{})}},res=>{
   let size=0;const chunks=[];res.on('error',()=>reject(Error('SYNC_HTTP_UNAVAILABLE')));res.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024){res.destroy();reject(Error('SYNC_HTTP_TOO_LARGE'));}else chunks.push(chunk);});res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));ensure(res.statusCode===200,'SYNC_HTTP_'+(res.statusCode===409?'CONFLICT':'REJECTED'));done(value);}catch(error){reject(error?.message?.startsWith('SYNC_')?error:Error('SYNC_HTTP_INVALID'));}});
  });req.setTimeout(20000,()=>req.destroy(Error('SYNC_HTTP_UNAVAILABLE')));req.on('error',()=>reject(Error('SYNC_HTTP_UNAVAILABLE')));if(bytes)req.write(bytes);req.end();
 });
}
function preserved(project){const {revision,updatedAt,environmentInfo,...rest}=project;return sha(rest);}
async function execute(input,data){
 const report={schema:'jarvis-cc-switch-platform-sync-v1',marker:MARKER,startedAt:new Date().toISOString(),status:'failed',release:RELEASE,productAccepted:false,independentAcceptance:false,experienceVerified:false,modelCalls:0,modelCredentialsRead:false,modelConfigurationWrites:0,sessionCreated:false,sessionRevoked:false,businessWrites:[],environmentInfo:{status:'not-attempted'},refs:data.refs};
 let db,token='',hash='',failure,skipped;
 try{
  ensure(userInfo().username==='jarvis','SYNC_SERVICE_ACCOUNT_REQUIRED');
  const base=new URL(input.baseUrl);ensure(base.protocol==='https:'&&base.pathname==='/'&&!base.username&&!base.password&&!base.hash&&!base.search&&['cc-jarvis.ikvein.com','localhost','127.0.0.1','192.168.10.112'].includes(base.hostname),'SYNC_TARGET_INVALID');
  ensure(isAbsolute(input.dataDir??''),'SYNC_DATA_DIRECTORY_INVALID');const file=join(resolve(input.dataDir),'jarvis.db');ensure(existsSync(file)&&statSync(file).isFile(),'SYNC_DATABASE_MISSING');
  db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=5000');ensure(!!db.prepare('SELECT 1 FROM auth WHERE id=1').get(),'SYNC_ACCOUNT_MISSING');
  token=randomBytes(32).toString('base64url');hash=createHash('sha256').update(token).digest('hex');db.prepare('INSERT INTO logins(tokenHash,expiresAt,createdAt) VALUES(?,?,?)').run(hash,Date.now()+120000,new Date().toISOString());report.sessionCreated=true;
  const api=(path,body)=>http(base,input.caFile?readFileSync(input.caFile):undefined,token,path,body);
  const health=await api('/api/health');ensure(health.build===RELEASE&&health.status==='ok','SYNC_RELEASE_CHANGED');
  async function records(domain){let cursor,all=[];for(let i=0;i<100;i++){const page=(await api('/api/v1/'+domain+'?scope=personal&limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''))).data;ensure(page&&Array.isArray(page.items),'SYNC_LIST_INVALID');all.push(...page.items);if(!page.nextCursor)return all;cursor=page.nextCursor;}throw Error('SYNC_LIST_BOUND_EXCEEDED');}
  const candidates=(await records('projects')).filter(p=>p.name===input.projectName&&p.ownerId==='server-admin'&&p.scope==='personal');
  if(candidates.length!==1){report.projectMatchCount=candidates.length;skipped='PROJECT_NAME_NOT_UNIQUE';}
  else{
   let project=(await api('/api/v1/projects/'+candidates[0].id)).data;ensure(project.scope==='personal'&&project.ownerId==='server-admin'&&project.status!=='archived','SYNC_PROJECT_UNAVAILABLE');const projectId=project.id;report.projectId=projectId;
   const basePath='/api/v1/projects/'+projectId+'/decisions';let decisions=[];for(let offset=0;offset<10000;offset+=100){const page=(await api(basePath+'?offset='+offset+'&limit=100')).data;decisions.push(...page.items);if(page.nextOffset===null)break;}
   const found=decisions.filter(item=>item.questionSummary===QUESTION);ensure(found.length<=1,'SYNC_DECISION_NOT_UNIQUE');
   let selected=found[0];if(!selected){selected=(await api(basePath,decision(data))).data;report.businessWrites.push('decision-selected');}
   ensure(selected.chosenId==='platform-and-local'&&selected.independentAcceptance===false&&['selected','implemented'].includes(selected.status),'SYNC_DECISION_CHANGED');
   const performed=selected.actions.some(action=>action.state==='performed'&&action.summary.startsWith(MARKER));
   if(!performed){selected=(await api(basePath+'/'+selected.id+'/implementation',implementation(data,selected.revision))).data;report.businessWrites.push('decision-implemented');}
   const detail=(await api(basePath+'/'+selected.id)).data;ensure(detail.status==='implemented'&&detail.independentAcceptance===false&&detail.revisions.length>=2,'SYNC_DECISION_READBACK');report.decision={id:detail.id,revision:detail.revision,status:detail.status,independentAcceptance:detail.independentAcceptance};
   const prior=(await records('experiences')).filter(item=>item.title===EXPERIENCE&&item.projectId===projectId);ensure(prior.length<=1,'SYNC_EXPERIENCE_NOT_UNIQUE');
   let candidate=prior[0];if(!candidate){candidate=(await api('/api/v1/experiences/commands/capture',experience(projectId,data))).data;report.businessWrites.push('experience-inbox');}
   const candidateRead=(await api('/api/v1/experiences/'+candidate.id)).data;ensure(candidateRead.status==='inbox'&&candidateRead.verified===false,'SYNC_EXPERIENCE_STATE_CHANGED');report.experience={id:candidateRead.id,revision:candidateRead.revision,status:candidateRead.status,verified:candidateRead.verified};
   project=(await api('/api/v1/projects/'+projectId)).data;const old=project.environmentInfo??{},oldKeys=Object.keys(old);
   if(oldKeys.some(key=>!roles.includes(key))||roles.some(key=>old[key]!==undefined&&typeof old[key]!=='string'))report.environmentInfo={status:'skipped',reason:'UNSUPPORTED_EXISTING_FIELDS'};
   else if((old.notes??'').includes(MARKER))report.environmentInfo={status:'already-present',revision:project.revision};
   else{
    const next={environment:old.environment??'',runCommand:old.runCommand??'',verifyCommand:old.verifyCommand??'',notes:(old.notes??'')+((old.notes??'')?'\n\n':'')+summary};
    if(next.notes.length>20000||next.environment.length>20000||next.runCommand.length>4000||next.verifyCommand.length>4000)report.environmentInfo={status:'skipped',reason:'EXISTING_CONTENT_WOULD_EXCEED_SCHEMA_LIMIT',existingNotesLength:(old.notes??'').length,attemptedNotesLength:next.notes.length};
    else{
     const before=preserved(project),value=(await api('/api/v1/projects/commands/environment-info',{commandId:commandId('project-environment'),expectedVersion:project.revision,scope:'personal',payload:{projectId,environmentInfo:next}})).data;
     const after=(await api('/api/v1/projects/'+projectId)).data;ensure(preserved(value)===before&&preserved(after)===before&&canonical(after.environmentInfo)===canonical(next)&&after.environmentInfo.notes.startsWith(old.notes??''),'SYNC_ENVIRONMENT_PRESERVATION_FAILED');report.businessWrites.push('project-environment-appended');report.environmentInfo={status:'appended',revision:after.revision,previousContentPreserved:true,notesLength:next.notes.length};
    }
   }
  }
 }catch(error){failure=/^SYNC_[A-Z_]+$/.test(error?.message??'')?error.message:'SYNC_FAILED';}
 finally{
  if(db&&report.sessionCreated){try{db.prepare('DELETE FROM logins WHERE tokenHash=?').run(hash);report.sessionRevoked=!db.prepare('SELECT 1 FROM logins WHERE tokenHash=?').get(hash);if(!report.sessionRevoked)failure='SYNC_SESSION_CLEANUP_FAILED';}catch{failure='SYNC_SESSION_CLEANUP_FAILED';}}
  if(db)try{db.close();}catch{failure='SYNC_DATABASE_CLOSE_FAILED';}token='';hash='';
 }
 report.status=failure?'failed':skipped?'skipped':'passed';if(failure)report.failure={code:failure};if(skipped)report.skippedReason=skipped;report.completedAt=new Date().toISOString();return report;
}
try{
 const input=options(),data=evidence(input.evidenceDir);
 const report=input.execute?await execute(input,data):{schema:'jarvis-cc-switch-platform-sync-prepared-v1',status:'prepared',release:RELEASE,sourceCommit:SOURCE,projectMatch:'exact name / personal / owner server-admin; 0 or >1 skips without guessing',session:'jarvis account; 120s in-memory token; finally delete only own hash',plannedActions:['selected decision then CAS append implementation; independentAcceptance false','experience capture inbox and verified false','GET current project; append environment notes only within existing schema limits; preserve all previous content'],idempotency:'fixed marker plus deterministic command IDs; GET existing marker before writes; no automatic retries',noModelCredentialReads:true,noProductCodeChanges:true,noDeployment:true,productionExecuted:false,refs:data.refs,decisionTemplate:decision(data),implementationTemplate:implementation(data,1),experienceTitle:EXPERIENCE,environmentAppend:summary};
 if(input.report){mkdirSync(dirname(resolve(input.report)),{recursive:true});writeFileSync(resolve(input.report),JSON.stringify(report,null,2)+'\n',{mode:0o600});}
 console.log(JSON.stringify(report));if(report.status==='failed')process.exitCode=1;
}catch(error){console.log(JSON.stringify({status:'failed',failure:{code:/^SYNC_[A-Z_]+$/.test(error?.message??'')?error.message:'SYNC_PREPARATION_FAILED'},productionExecuted:false}));process.exitCode=1;}
