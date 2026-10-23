/**
 * NAS120 independent SSH replacement metadata only; does not change product code, transport, DNS or NAS. Default mode prepares public inputs without HTTP/DB access.
 * Execute as jarvis; token is memory-only, TTL120s, finally deletes only its hash.
 * --execute --base-url=https://cc-jarvis.ikvein.com --data-dir=/var/lib/jarvis/data
 * --evidence-dir=/path/to/public/nas120-independent-ssh --project-name=贾维斯建设
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
const SOURCE='e7c2002af9f012ac68c1aee453dce3a79d1bc35b75edc92f18f060f039dcbb3b';
const BRIDGE_SOURCE='49ccd11f5be081d4dc89335f31ee33a700a0fa453506b36f600ec42d82eecc34';
const OLD_DECISION='799944f8-2e27-4d85-9543-c255e318d250';
const CONTAINER='6e233cce48b04ad3813aed37eafe754986060f7ef8307ce1f6917b8b67a6ba83';
const IMAGE='sha256:d9fa4b38ce03346bbcfa768884dfd5ab0a8c268613a1c2005d282e45de385b1b';
const PIN='SHA256:6R7RvgtD74nLDuSTqXz4yZC5NcX8tyd0O2sVybmDYas';
const MARKER='[NAS120-INDEPENDENT-SSH-20261020]';
const QUESTION=MARKER+' 按用户新增完全不依赖112的要求，将59527转发迁至NAS120本机容器';
const EXPERIENCE=MARKER+' 独立性要求变化时保留决策替代链并区分密码技术验证与本人验收';
const ensure=(v,code)=>{if(!v)throw Error(code);};
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const sha=v=>createHash('sha256').update(Buffer.isBuffer(v)||typeof v==='string'?v:canonical(v)).digest('hex');
const commandId=key=>{const value=sha(MARKER+key);return value.slice(0,8)+'-'+value.slice(8,12)+'-4'+value.slice(13,16)+'-8'+value.slice(17,20)+'-'+value.slice(20,32);};
const summary=[
 MARKER+' 用户追加明确要求：ssh-120.ikvein.com:59527运行必须完全不依赖112。此前112转发方案因新增约束被替代，旧决定与实施证据保留。',
 'NAS120本机容器已上线：target127.0.0.1:22→广州59527，host网络、只读rootfs、UID65532:65532、unless-stopped；既有容器保持。运行路径不经112。',
 '容器CID '+CONTAINER+'，image '+IMAGE+'；观察PID14788、running、restartCount0。112旧jarvis-nas120-ssh-tunnel.service已disabled/inactive/PID0，其他7项保护服务保持。',
 '101和116使用现有NAS密码实际SSH登录成功、PTY分配成功，hostname NAS9527与uid1000核对通过；不是仅none-auth或限制collector测试。未保存或回显密码；helper不读取NAS密码。',
 '日本和广州新增公网strict主机pin匹配通过：'+PIN+'；这两项为无认证核对，与101/116密码实登分别留证。',
 '没有进行NAS重启或112物理关机测试；停用旧112桥接后公网密码登录成功，证明当前NAS新路径不使用该桥接。用户本人使用验收仍pending。',
 '沿用原域名/59527和NAS原SSH、密码及collector授权；无新Jarvis应用发布，仍R56。决定通过旧项change端点+实时revision替代，再新项implementation补已发生实证，independentAcceptance=false。',
 '经验仅inbox未验证，不发布Skill；不修改项目notes/environment或截断旧资料。',
].join('\n');

function options(){
 const parsed={execute:false,projectName:'贾维斯建设',evidenceDir:dirname(fileURLToPath(import.meta.url))};
 const names={'base-url':'baseUrl','data-dir':'dataDir','ca-file':'caFile','report':'report','evidence-dir':'evidenceDir','project-name':'projectName'};
 for(const arg of process.argv.slice(2)){if(arg==='--execute'){parsed.execute=true;continue;}const m=/^--([a-z-]+)=(.+)$/.exec(arg);ensure(m&&names[m[1]],'SYNC_ARGUMENT_INVALID');parsed[names[m[1]]]=m[2];}
 return parsed;
}
function evidence(dir){
 const names=['native-prepare-public.json','native-start-public.json','native-status-public.json','old112-before-public.json','old112-disable-public.json','old112-verify-public.json','other-machines-public.json','network-public.json','preflight-public.json','docker-preflight-public.json'];
 const values={},refs=names.map(name=>{const path=join(resolve(dir),name);ensure(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'SYNC_EVIDENCE_MISSING');const bytes=readFileSync(path);values[name]=JSON.parse(bytes.toString('utf8'));return {reference:'artifacts/nas120-independent-ssh/'+name,sha256:sha(bytes),kind:'observation'};});
 const [prepare,start,status,before,disable,verify,others,network,preflight,docker]=names.map(name=>values[name]);
 ensure(prepare.status==='prepared'&&prepare.containerStarted===false&&prepare.containerId===CONTAINER&&prepare.imageId===IMAGE&&prepare.privateConfigurationInImage===false&&prepare.externalImagePulled===false&&prepare.existingContainersUnchanged===true&&canonical(prepare.existingContainersBefore)===canonical(prepare.existingContainersAfterExcludingNew),'SYNC_NATIVE_PREPARE_INVALID');
 for(const state of [start,status])ensure(state.status==='passed'&&state.containerId===CONTAINER&&state.imageId===IMAGE&&state.containerState==='running'&&state.pid===14788&&state.restartCount===0&&state.restartPolicy==='unless-stopped'&&state.networkMode==='host'&&state.readOnlyRootfs===true&&state.user==='65532:65532'&&state.runtimeDependsOn112===false&&state.nativeHost==='192.168.10.120'&&state.domain==='ssh-120.ikvein.com'&&state.port===59527&&state.target==='127.0.0.1:22'&&state.existingContainersUnchanged===true&&state.nasSshConfigurationModified===false&&state.collectorAuthorizationModified===false&&state.passwordDisplayedOrPersisted===false&&state.sourceSHA256===SOURCE,'SYNC_NATIVE_RUNNING_INVALID');
 ensure(before.status==='captured'&&before.state.unit.ActiveState==='active'&&before.state.unit.UnitFileState==='enabled','SYNC_OLD_BRIDGE_BEFORE_INVALID');
 for(const state of [disable,verify])ensure(state.status==='passed'&&state.state.unit.ActiveState==='inactive'&&state.state.unit.UnitFileState==='disabled'&&state.state.unit.MainPID==='0'&&state.protectedOtherUnitsUnchanged===true&&state.onlyOwnedBridgeControlled===true&&canonical(state.state.protectedUnits)===canonical(before.state.protectedUnits)&&state.state.configSHA256===before.state.configSHA256&&state.state.unitSHA256===before.state.unitSHA256,'SYNC_OLD_BRIDGE_STOP_INVALID');
 ensure(others.status==='passed'&&others.clientRouteUses112===false&&others.credentialsPersistedOnClients===false&&others.tests.length===2&&['superopen-HP-ProDesk-600-G3-SFF','superopen-ProDesk-400-i5-6400'].every(client=>others.tests.some(test=>test.clientMachine===client&&test.status==='passed'&&test.endpoint==='ssh-120.ikvein.com:59527'&&test.ordinaryPasswordLogin===true&&test.ptyAllocated===true&&test.hostnameVerified===true&&test.uidVerified===true&&test.strictPinnedHostKey===true&&test.sshExitCode===0&&test.passwordPersisted===false&&test.jumpHostUsed===false&&test.collectorKeyUsed===false)),'SYNC_PASSWORD_TECHNICAL_VERIFICATION_INVALID');
 ensure(network.status==='passed'&&network.passwordLoginPerformed===false&&['jarvis-jp','jarvis-gz'].every(id=>{const check=network.checks[id];return check?.status==='passed'&&check.domain==='ssh-120.ikvein.com'&&check.port===59527&&check.strictHostKeyMatched===true&&check.hostKeySHA256===PIN&&check.passwordSubmitted===false&&check.jumpHostUsed===false;}),'SYNC_NETWORK_EVIDENCE_INVALID');
 ensure(preflight.status==='passed'&&preflight.ordinaryPasswordAuthentication===true&&preflight.ordinaryCommandsExecuted===true&&preflight.hostKeyStrictlyPinned===true&&preflight.passwordDisplayedOrPersisted===false&&preflight.configurationModified===false&&preflight.checks.hostname==='NAS9527'&&preflight.checks.identity.startsWith('uid=1000(superopen)'),'SYNC_PREFLIGHT_INVALID');
 ensure(docker.status==='passed'&&docker.sudoAdministratorVerified===true&&docker.configurationModified===false,'SYNC_DOCKER_PREFLIGHT_INVALID');
 const repo=resolve(dir,'../..');for(const [path,expected]of [['scripts/ssh-access/install-nas120-native.py',SOURCE],['scripts/ssh-access/nas_ssh_bridge.py',BRIDGE_SOURCE]]){ensure(sha(readFileSync(join(repo,path)))===expected,'SYNC_SOURCE_CHANGED');refs.push({reference:path,sha256:expected,kind:'source'});}
 const finalPath=join(resolve(dir),'final-validation.json');ensure(lstatSync(finalPath).isFile()&&!lstatSync(finalPath).isSymbolicLink(),'SYNC_FINAL_MISSING');const finalBytes=readFileSync(finalPath),final=JSON.parse(finalBytes.toString('utf8'));
 ensure(final.status==='passed'&&final.endpoint==='ssh-120.ikvein.com:59527'&&final.hostname==='NAS9527'&&final.runtimeDependsOn112===false&&final.old112BridgeDisabled===true&&final.old112BridgeInactive===true&&final.nasContainer.id===CONTAINER&&final.nasContainer.imageId===IMAGE&&final.nasContainer.pid===14788&&final.ordinaryPasswordAndPtyVerifiedFromMachines.length===2&&['101','116'].every(id=>final.ordinaryPasswordAndPtyVerifiedFromMachines.includes(id))&&final.nasRebootActuallyTested===false&&final.server112PhysicallyPoweredOff===false&&final.existingNasContainerProtectedFieldsUnchanged===true&&final.other112ServicesUnchanged===true&&final.nasSshConfigurationModified===false&&final.collectorKeyPermissionsExpanded===false&&final.nasPasswordPersistedOnClientMachines===false&&final.userAcceptance==='pending'&&final.applicationReleaseChanged===false&&final.source.length===3&&final.evidence.length===12,'SYNC_FINAL_INVALID');
 const expectedSources={'scripts/ssh-access/install-nas120-native.py':SOURCE,'scripts/ssh-access/nas_ssh_bridge.py':BRIDGE_SOURCE,'scripts/ssh-access/nas-vault-bridge.mjs':'2d9c48d08f4a5a3c6bc0ded5c772cb3939fd1243b114df6701d9f3d2822a0852'};
 for(const ref of final.source){ensure(expectedSources[ref.path]===ref.sha256&&sha(readFileSync(join(repo,ref.path)))===ref.sha256,'SYNC_FINAL_SOURCE_CHANGED');if(!refs.some(existing=>existing.reference===ref.path))refs.push({reference:ref.path,sha256:ref.sha256,kind:'source'});}
 for(const ref of final.evidence){ensure(/^artifacts\/nas120-independent-ssh\/[a-z0-9-]+\.json$/.test(ref.path)&&/^[a-f0-9]{64}$/.test(ref.sha256),'SYNC_FINAL_REFERENCE_INVALID');const path=join(repo,ref.path);ensure(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink()&&sha(readFileSync(path))===ref.sha256,'SYNC_FINAL_REFERENCE_CHANGED');}
 refs.push({reference:'artifacts/nas120-independent-ssh/final-validation.json',sha256:sha(finalBytes),kind:'observation'});
 return {refs,observedAt:new Date(final.at).toISOString(),sourceSHA256:SOURCE,bridgeSourceSHA256:BRIDGE_SOURCE};
}

function decisionChange(data,revision){
 const objectives=['NAS120-INDEPENDENT-FROM112','SSH-NUMBER-DOMAIN','PRESERVE-NAS-AND-AUTH'];
 const option=(id,title,advantages,disadvantages,compliesWithGoals,coveredObjectives,operationalImpact)=>({id,title,advantages,disadvantages,impact:title,compliesWithGoals,withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives,operationalImpact});
 return {commandId:commandId('decision-change'),expectedVersion:revision,reason:'用户新增明确运行不依赖112的约束，替代原112桥接方案；记录实际更正与已发生上线，旧历史保留，不宣称事前决策或独立验收。',questionSummary:QUESTION,
  context:{observedAt:data.observedAt,goalSpecHash:null,sourceFingerprint:SOURCE,sourceVersion:'NAS native installer SHA256 '+SOURCE+' / bridge '+BRIDGE_SOURCE+' / no application release / existing platform '+RELEASE,runId:null,taskId:null,machineId:null,objectives,constraints:['运行不能经过112；迁移后停用旧112同端口转发避免冲突','NAS原SSH、密码、collector授权及既有容器保持','密码技术登录、112旧桥接停用证明、NAS重启/112物理关机测试和本人验收分别记录'],situation:summary},
  options:[option('NAS-native-container','NAS120本机容器直接转发原SSH到广州59527',['运行不依赖112','host网络直达127.0.0.1:22','只读rootfs与非root UID限定运行','原SSH认证边界保持'],['新增NAS受控容器需后续维护','本轮未验证NAS重启后的恢复'], 'yes',objectives,1),option('112-independent-tunnel','继续使用原112独立FRPC桥接',['原方案已上线并保留完整证据'],['运行依赖112，不能满足用户新增明确约束'], 'no',['SSH-NUMBER-DOMAIN','PRESERVE-NAS-AND-AUTH'],0)],
  chosenId:'NAS-native-container',decisionRationale:'用户明确追加NAS入口完全不依赖112。已改用NAS120本机容器直接转发，停用112旧桥接后101/116密码SSH与PTY实测通过。原112方案在先前要求下的历史与证据保留，本次使用change链明确其被新要求替代，不回写旧记录。尚未NAS重启或112物理关机，用户本人验收仍待确认。',
  basisRefs:data.refs,risk:'medium',affectedObjectives:objectives,rollbackPlan:{plan:'如NAS新增容器影响现有服务或公网入口不可用，先按新有范围计划核对并停止仅此容器，保留NAS原SSH和既有collector/容器。若考虑恢复旧112桥接，须再次核对用户独立性要求及端口冲突并取得相应范围，不能自动启回旧路径。',triggers:['容器影响既有NAS服务','公网严格pin不匹配','入口不可用或用户要求撤销'],impact:'新增公网59527可能暂时不可用；NAS原LAN SSH、既有容器和历史证据保持。',requiresNewExecutionPlan:true},actions:[],status:'selected',origin:'ai'};
}
function implementation(data,revision){return {commandId:commandId('decision-implementation'),expectedVersion:revision,origin:'ai',reason:'依据已发生NAS本机容器运行、112旧bridge停用及101/116密码/PTY核验补实施；不提升为本人验收。',actions:[{summary:MARKER+' NAS容器running/PID14788/restarts0，112旧bridge disabled/inactive/PID0；101和116普通密码SSH+PTY成功、NAS9527/uid1000核对。日本/广州strictpin通过；未做NAS重启/112物理关机，用户本人验收pending。',at:data.observedAt,state:'performed',evidenceRefs:data.refs}]};}
function experience(projectId,data){return {commandId:commandId('experience-capture'),expectedVersion:0,scope:'personal',payload:{projectId,kind:'lesson',title:EXPERIENCE,summary:'候选经验：依赖约束变化应以CAS change替代旧决定，停旧路径后验证新路径；密码技术实测与用户本人验收、重启和物理断电测试分开。未验证跨项目通用性。',conditions:'已明确获得NAS独立转发及技术密码登录授权，原SSH和容器保护域可核对；其他NAS/容器版本/网络环境须重验。',content:summary+'\n经验候选：保存旧方案为何曾被选及新约束为何替代，不把更正覆盖为从未出错；停用旧bridge并从独立客户端完成新公网密码/PTY核验可证明本轮路径，不能冒充NAS重启或112物理关机测试。新决定selected actions为空，实施证据单独追加，独立验收不因技术成功自动成立。',source:data.refs.map(ref=>ref.reference+' SHA256 '+ref.sha256).join('\n'),tags:['NAS','SSH','独立性','决策替代','候选经验']}};}

function http(base,ca,token,path,body){
 return new Promise((done,reject)=>{
  const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body)),req=request(new URL(path,base),{method:bytes?'POST':'GET',ca,rejectUnauthorized:true,headers:{accept:'application/json',cookie:'jarvis_session='+token,...(bytes?{'content-type':'application/json','content-length':bytes.length}:{})}},res=>{
   let size=0;const chunks=[];res.on('error',()=>reject(Error('SYNC_HTTP_UNAVAILABLE')));res.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024){res.destroy();reject(Error('SYNC_HTTP_TOO_LARGE'));}else chunks.push(chunk);});res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));ensure(res.statusCode===200,'SYNC_HTTP_'+(res.statusCode===409?'CONFLICT':'REJECTED'));done(value);}catch(error){reject(error?.message?.startsWith('SYNC_')?error:Error('SYNC_HTTP_INVALID'));}});
  });req.setTimeout(20000,()=>req.destroy(Error('SYNC_HTTP_UNAVAILABLE')));req.on('error',()=>reject(Error('SYNC_HTTP_UNAVAILABLE')));if(bytes)req.write(bytes);req.end();
 });
}
async function execute(input,data){
 const report={schema:'jarvis-nas120-independent-ssh-platform-sync-v1',marker:MARKER,startedAt:new Date().toISOString(),status:'failed',platformBuild:RELEASE,applicationReleaseChanged:false,productAccepted:false,independentAcceptance:false,experienceVerified:false,modelCalls:0,modelCredentialsRead:false,modelConfigurationWrites:0,sessionCreated:false,sessionRevoked:false,businessWrites:[],environmentInfo:{status:'skipped',reason:'OUT_OF_SCOPE_PRESERVE_EXISTING_PROJECT_CONTENT'},refs:data.refs};
 let db,token='',hash='',failure,skipped;
 try{
  ensure(userInfo().username==='jarvis','SYNC_SERVICE_ACCOUNT_REQUIRED');
  ensure(input.projectName==='贾维斯建设','SYNC_PROJECT_NAME_INVALID');
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
   let selected=found[0];
   if(!selected){const old=(await api(basePath+'/'+OLD_DECISION)).data;ensure(old.id===OLD_DECISION&&old.chosenId==='112-independent-tunnel'&&old.status==='implemented'&&old.independentAcceptance===false&&Number.isInteger(old.revision)&&old.revision>0,'SYNC_OLD_DECISION_CHANGED');report.previousDecisionBefore={id:old.id,revision:old.revision,status:old.status};selected=(await api(basePath+'/'+OLD_DECISION+'/change',decisionChange(data,old.revision))).data;report.businessWrites.push('decision-change-selected');}
   ensure(selected.changeOf===OLD_DECISION,'SYNC_CHANGE_CHAIN_INVALID');
   ensure(selected.chosenId==='NAS-native-container'&&selected.independentAcceptance===false&&['selected','implemented'].includes(selected.status),'SYNC_DECISION_CHANGED');
   const performed=selected.actions.some(action=>action.state==='performed'&&action.summary.startsWith(MARKER));
   if(!performed){selected=(await api(basePath+'/'+selected.id+'/implementation',implementation(data,selected.revision))).data;report.businessWrites.push('decision-implemented');}
   const detail=(await api(basePath+'/'+selected.id)).data;ensure(detail.status==='implemented'&&detail.independentAcceptance===false&&detail.revisions.length>=2,'SYNC_DECISION_READBACK');report.decision={id:detail.id,revision:detail.revision,status:detail.status,independentAcceptance:detail.independentAcceptance};
   const previous=(await api(basePath+'/'+OLD_DECISION)).data;ensure(previous.status==='superseded'&&previous.supersededBy===detail.id&&previous.revisions.length>=3,'SYNC_SUPERSEDED_READBACK');report.previousDecision={id:previous.id,revision:previous.revision,status:previous.status,supersededBy:previous.supersededBy};
   const prior=(await records('experiences')).filter(item=>item.title===EXPERIENCE&&item.projectId===projectId);ensure(prior.length<=1,'SYNC_EXPERIENCE_NOT_UNIQUE');
   let candidate=prior[0];if(!candidate){candidate=(await api('/api/v1/experiences/commands/capture',experience(projectId,data))).data;report.businessWrites.push('experience-inbox');}
   const candidateRead=(await api('/api/v1/experiences/'+candidate.id)).data;ensure(candidateRead.status==='inbox'&&candidateRead.verified===false,'SYNC_EXPERIENCE_STATE_CHANGED');report.experience={id:candidateRead.id,revision:candidateRead.revision,status:candidateRead.status,verified:candidateRead.verified};
   report.projectContentPreserved=true; // No project environment/notes write is in scope.

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
 const report=input.execute?await execute(input,data):{schema:'jarvis-nas120-independent-ssh-platform-sync-prepared-v1',status:'prepared',platformBuild:RELEASE,applicationReleaseChanged:false,sourceSHA256:SOURCE,bridgeSourceSHA256:BRIDGE_SOURCE,projectMatch:'exact name / personal / owner server-admin; 0 or >1 skips without guessing',session:'jarvis account; 120s in-memory token; finally delete only own hash',plannedActions:['GET old decision799944f8-2e27-4d85-9543-c255e318d250 current revision; POST /oldId/change with expectedVersion; selected actions empty; old history superseded but preserved; append new implementation CAS; independentAcceptance false','experience capture inbox and verified false','do not write project environment/notes; preserve full existing content without truncation or schema expansion'],idempotency:'fixed marker plus deterministic command IDs; GET existing marker before writes; no automatic retries',noModelCredentialReads:true,noProductCodeChanges:true,noDeployment:true,productionExecuted:false,refs:data.refs,oldDecisionId:OLD_DECISION,decisionChangeTemplate:decisionChange(data,2),implementationTemplate:implementation(data,1),experienceTitle:EXPERIENCE,experienceTemplate:experience('00000000-0000-4000-8000-000000000000',data),summary,projectEnvironmentWritePlanned:false};
 if(input.report){mkdirSync(dirname(resolve(input.report)),{recursive:true});writeFileSync(resolve(input.report),JSON.stringify(report,null,2)+'\n',{mode:0o600});}
 console.log(JSON.stringify(report));if(report.status==='failed')process.exitCode=1;
}catch(error){console.log(JSON.stringify({status:'failed',failure:{code:/^SYNC_[A-Z_]+$/.test(error?.message??'')?error.message:'SYNC_PREPARATION_FAILED'},productionExecuted:false}));process.exitCode=1;}
