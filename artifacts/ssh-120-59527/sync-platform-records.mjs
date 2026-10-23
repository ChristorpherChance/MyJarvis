/**
 * NAS120 SSH metadata only; does not change product code, transport, DNS or NAS. Default mode prepares public inputs without HTTP/DB access.
 * Execute as jarvis; token is memory-only, TTL120s, finally deletes only its hash.
 * --execute --base-url=https://cc-jarvis.ikvein.com --data-dir=/var/lib/jarvis/data
 * --evidence-dir=/path/to/public/ssh-120-59527 --project-name=贾维斯建设
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
const SOURCE='9c9066d1659e840e9757ae4220ab01b9e9a06ae9018775f02cf8f5fe9b2b88fb';
const PIN='SHA256:6R7RvgtD74nLDuSTqXz4yZC5NcX8tyd0O2sVybmDYas';
const MARKER='[NAS120-SSH-59527-20261020]';
const QUESTION=MARKER+' NAS120采用112独立SSH转发，沿用ssh-编号域名与原NAS认证边界';
const EXPERIENCE=MARKER+' NAS公网SSH转发的域名、主机指纹与认证验收边界';
const ensure=(v,code)=>{if(!v)throw Error(code);};
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const sha=v=>createHash('sha256').update(Buffer.isBuffer(v)||typeof v==='string'?v:canonical(v)).digest('hex');
const commandId=key=>{const value=sha(MARKER+key);return value.slice(0,8)+'-'+value.slice(8,12)+'-4'+value.slice(13,16)+'-8'+value.slice(17,20)+'-'+value.slice(20,32);};
const summary=[
 MARKER+' 已上线 ssh-120.ikvein.com:59527，遵循用户偏好的 ssh-编号.ikvein.com 命名。',
 '权威DNS核对既有精确 *.ikvein.com 记录覆盖该主机；没有修改DNS，没有创建无效ssh-*前缀wildcard，没有新增HTTPS入口。',
 '112新增独立jarvis-nas120-ssh-tunnel.service，DynamicUser与systemd LoadCredential提供单代理FRPC，转发到192.168.10.120:22；公网SSH依赖112在线。广州仅新增LIMIT IN 59527/tcp。',
 'NAS沿用QTS原SSH、原密码和既有限制collector权限；112原7项服务及配置、广州原3项服务PID与FRPS配置均保持。',
 'Windows默认SSH客户端、日本及广州公网严格主机指纹比对通过：'+PIN+'。没有提交用户密码，普通交互/密码登录和用户本人验收仍待确认。',
 '112经公网59527沿用既有限制collector身份执行固定snapshot成功且签名/原peer绑定核对通过；原SSH客户端合法使用既有key完成固定snapshot，没有转移私钥。该结果不替代本人普通SSH登录验收。',
 '本记录是已发生操作的AI事实回顾，independentAcceptance=false；经验仅inbox未验证，不发布Skill。只同步决定和经验，不替换或截断项目既有notes/environment。',
].join('\n');

function options(){
 const parsed={execute:false,projectName:'贾维斯建设',evidenceDir:dirname(fileURLToPath(import.meta.url))};
 const names={'base-url':'baseUrl','data-dir':'dataDir','ca-file':'caFile','report':'report','evidence-dir':'evidenceDir','project-name':'projectName'};
 for(const arg of process.argv.slice(2)){if(arg==='--execute'){parsed.execute=true;continue;}const m=/^--([a-z-]+)=(.+)$/.exec(arg);ensure(m&&names[m[1]],'SYNC_ARGUMENT_INVALID');parsed[names[m[1]]]=m[2];}
 return parsed;
}
function evidence(dir){
 const names=['install-public.json','gateway-public.json','dns-public.json','network-public.json','windows-public.json','lan-target-public.json','public-auth-snapshot.json','final-validation.json'];
 const values={},refs=names.map(name=>{
  const path=join(resolve(dir),name);ensure(existsSync(path)&&lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'SYNC_EVIDENCE_MISSING');
  const bytes=readFileSync(path);values[name]=JSON.parse(bytes.toString('utf8'));
  return {reference:'artifacts/ssh-120-59527/'+name,sha256:createHash('sha256').update(bytes).digest('hex'),kind:'observation'};
 });
 const [install,gateway,dns,network,windows,lan,auth]=names.map(name=>values[name]);
 ensure(install.status==='activated'&&install.node==='112'&&install.target==='192.168.10.120:22'&&install.remotePort===59527&&install.domain==='ssh-120.ikvein.com'&&install.unit==='jarvis-nas120-ssh-tunnel.service'&&install.runtimeUser==='DynamicUser'&&install.credentialDelivery.includes('LoadCredential')&&install.active===true&&install.enabled==='enabled'&&install.protectedStateUnchanged===true&&canonical(install.protectedBefore)===canonical(install.protectedAfter)&&Object.keys(install.protectedAfter.units).length===7&&install.nasConfigurationModified===false&&install.existingConfigurationsModified===false,'SYNC_INSTALL_EVIDENCE_INVALID');
 ensure(gateway.status==='applied'&&gateway.publicPort===59527&&gateway.rule==='LIMIT IN 59527/tcp'&&canonical(gateway.protectedServicesBefore)===canonical(gateway.protectedServicesAfter)&&Object.keys(gateway.protectedServicesAfter).length===3&&gateway.frpsConfigurationModified===false&&gateway.existingServicesRestarted===false,'SYNC_GATEWAY_EVIDENCE_INVALID');
 ensure(dns.status==='passed'&&dns.existingWildcardRecord==='*.ikvein.com'&&dns.dnsRecordsModified===false&&dns.prefixWildcardRecordCreated===false&&dns.httpsCertificateRequiredForNativeSsh===false&&dns.naming==='ssh-<server-id>.ikvein.com'&&['*.ikvein.com','ssh-120.ikvein.com'].every(query=>dns.checks.some(check=>check.query===query&&check.status==='passed'&&check.address==='8.163.127.192')),'SYNC_DNS_EVIDENCE_INVALID');
 ensure(network.status==='passed'&&network.passwordLoginPerformed===false&&['jarvis-jp','jarvis-gz'].every(id=>{const check=network.checks[id];return check?.status==='passed'&&check.domain==='ssh-120.ikvein.com'&&check.port===59527&&check.tcpReachable===true&&check.strictHostKeyMatched===true&&check.hostKeySHA256===PIN&&check.passwordSubmitted===false&&check.jumpHostUsed===false&&check.privateKeysTransferred===false;}),'SYNC_NETWORK_EVIDENCE_INVALID');
 ensure(windows.status==='passed'&&windows.domain==='ssh-120.ikvein.com'&&windows.port===59527&&windows.defaultClientKexUsed===true&&windows.strictHostKeyMatched===true&&windows.hostKeySHA256===PIN&&windows.passwordSubmitted===false&&windows.jumpHostUsed===false&&windows.privateKeysTransferred===false,'SYNC_WINDOWS_EVIDENCE_INVALID');
 ensure(lan.target==='192.168.10.120'&&lan.sshPort===22&&lan.hostKey.strictPinMatched===true&&lan.hostKey.fingerprint.includes(PIN)&&lan.restrictedCollector.exitCode===0&&lan.restrictedCollector.signatureVerified===true&&lan.nasConfigurationChanged===false&&lan.userPasswordReadOrSent===false&&lan.rawCollectorEnvelopePersisted===false,'SYNC_LAN_EVIDENCE_INVALID');
 ensure(auth.status==='passed'&&auth.endpoint==='ssh-120.ikvein.com:59527'&&auth.sshExitCode===0&&auth.fixedRemoteCommand==='snapshot'&&auth.strictOriginalPin===true&&auth.expectedHostKeyFingerprint===PIN&&auth.signatureAndOriginalPeerBindingVerified===true&&auth.userPasswordSent===false&&auth.ordinaryInteractiveLoginVerified===false&&auth.ordinaryPasswordLoginVerified===false&&auth.collectorPermissionsExpanded===false&&auth.nasConfigurationChanged===false&&auth.originalConfigurationAndIdentityMetadataUnchanged===true,'SYNC_PUBLIC_AUTH_EVIDENCE_INVALID');
 const final=values['final-validation.json'];
 ensure(final.status==='passed'&&final.endpoint.domain==='ssh-120.ikvein.com'&&final.endpoint.port===59527&&final.endpoint.target==='192.168.10.120:22'&&final.endpoint.hostKeySHA256===PIN&&final.activation.node==='112'&&final.activation.unit==='jarvis-nas120-ssh-tunnel.service'&&final.activation.enabled===true&&final.activation.active===true&&final.passwordSubmitted===false&&final.ordinaryInteractiveLoginTested===false&&final.userAcceptance==='pending'&&final.newHttpsEndpointCreated===false&&final.nasSshConfigurationModified===false&&final.supplierModelCalls===0&&final.source.path==='scripts/ssh-access/install-nas120-tunnel.py'&&final.source.sha256===SOURCE&&final.evidence.length===10,'SYNC_FINAL_EVIDENCE_INVALID');
 const repo=resolve(dir,'../..');ensure(sha(readFileSync(join(repo,final.source.path)))===SOURCE,'SYNC_SOURCE_CHANGED');
 for(const ref of final.evidence){ensure(/^artifacts\/ssh-120-59527\/[a-z0-9-]+\.json$/.test(ref.path)&&/^[a-f0-9]{64}$/.test(ref.sha256),'SYNC_FINAL_REFERENCE_INVALID');const path=join(repo,ref.path);ensure(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink()&&sha(readFileSync(path))===ref.sha256,'SYNC_FINAL_REFERENCE_CHANGED');}
 return {refs,observedAt:new Date(final.at).toISOString(),sourceSHA256:SOURCE};
}

function decision(data){
 const objectives=['NAS120-SSH-59527','SSH-NUMBER-DOMAIN','PRESERVE-NAS-AND-AUTH'];
 const option=(id,title,advantages,disadvantages,coveredObjectives,operationalImpact)=>({id,title,advantages,disadvantages,impact:title,compliesWithGoals:'yes',withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives,operationalImpact});
 return {commandId:commandId('decision-record'),expectedVersion:0,changeOf:null,questionSummary:QUESTION,
  context:{observedAt:data.observedAt,goalSpecHash:null,sourceFingerprint:SOURCE,sourceVersion:'NAS120 SSH 59527 installer SHA256 '+SOURCE+' / no application release / existing platform '+RELEASE,runId:null,taskId:null,machineId:null,objectives,constraints:['公网入口只转发NAS原SSH，不改QTS认证、密码或既有collector权限','既有112与广州业务、SSH、FRP配置及进程保护域保持','域名沿用权威DNS精确*.ikvein.com记录覆盖；技术连通和本人密码验收分别记录'],situation:summary},
  options:[option('112-independent-tunnel','112新增独立单代理FRPC转发到NAS原SSH',['沿用NAS原SSH与密码','无需在QTS新增常驻程序','DynamicUser和LoadCredential隔离新增转发'],['公网入口依赖112在线','仍需用户本人完成普通SSH密码登录验收'],objectives,1),option('nas-native-frpc','在NAS安装原生FRPC常驻转发',['公网转发可独立于112'],['需要新增NAS常驻程序与升级维护','现有需求不需要扩大QTS持久配置和权限影响'],objectives,3)],
  chosenId:'112-independent-tunnel',decisionRationale:'用户需要NAS120以ssh-编号域名和59527端口直接连接。已选并实施112独立转发，复用NAS原SSH和现有域名覆盖，避免无必要QTS常驻程序和升级影响；公网主机指纹与限制snapshot验证分别留证。此为已发生操作的真实回顾，未冒充事前记录或用户密码验收。',
  basisRefs:data.refs,risk:'medium',affectedObjectives:objectives,rollbackPlan:{plan:'如新增59527入口出现可用性或安全问题，按新的有范围执行计划停止新增jarvis-nas120-ssh-tunnel.service并移除对应新增防火墙规则；保留NAS原SSH、既有collector、112及广州原业务和配置。无需更改DNS，未声明已经回退。',triggers:['新增入口指纹与原NAS pin不匹配','独立转发影响原保护域','用户要求撤销新增公网入口'],impact:'仅新增公网59527入口可能中断，NAS原LAN SSH及既有采集保持；既有证据和记录保留。',requiresNewExecutionPlan:true},actions:[],status:'selected',origin:'ai'};
}
function implementation(data,revision){
 return {commandId:commandId('decision-implementation'),expectedVersion:revision,origin:'ai',reason:'依据已发生112独立转发、广州限速放行及公网/限制snapshot公开证据追加实施；保留选择版本，本人普通SSH/密码验收仍未完成。',actions:[{summary:MARKER+' ssh-120.ikvein.com:59527已上线；Windows默认SSH、日本和广州strict hostkey通过，112经公网执行原限制snapshot及签名绑定核对通过。NAS原配置、密码和collector权限保持；未提交用户密码。',at:data.observedAt,state:'performed',evidenceRefs:data.refs}]};
}
function experience(projectId,data){
 return {commandId:commandId('experience-capture'),expectedVersion:0,scope:'personal',payload:{projectId,kind:'lesson',title:EXPERIENCE,summary:'候选经验：复用NAS原SSH，新增转发独立隔离；核对完整DNS通配记录与原主机pin，区别传输、限制命令和本人密码验收。未验证跨项目通用性。',conditions:'现有NAS原SSH与既有限制collector绑定已可核对，112在线且已获得新增公网转发授权；其他NAS/网络/QTS版本需重新验证。',content:summary+'\n经验候选：先核权威DNS已有完整label通配覆盖，避免无效前缀wildcard或不需要的HTTPS改动；公网严格主机pin匹配与限制snapshot成功不等于本人普通SSH密码登录验收。新增转发使用独立服务和凭据，保留原SSH及QTS权限边界。经验未验证、未发布Skill。',source:data.refs.map(r=>r.reference+' SHA256 '+r.sha256).join('\n'),tags:['NAS','SSH','公网转发','主机指纹','候选经验']}};
}

function http(base,ca,token,path,body){
 return new Promise((done,reject)=>{
  const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body)),req=request(new URL(path,base),{method:bytes?'POST':'GET',ca,rejectUnauthorized:true,headers:{accept:'application/json',cookie:'jarvis_session='+token,...(bytes?{'content-type':'application/json','content-length':bytes.length}:{})}},res=>{
   let size=0;const chunks=[];res.on('error',()=>reject(Error('SYNC_HTTP_UNAVAILABLE')));res.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024){res.destroy();reject(Error('SYNC_HTTP_TOO_LARGE'));}else chunks.push(chunk);});res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));ensure(res.statusCode===200,'SYNC_HTTP_'+(res.statusCode===409?'CONFLICT':'REJECTED'));done(value);}catch(error){reject(error?.message?.startsWith('SYNC_')?error:Error('SYNC_HTTP_INVALID'));}});
  });req.setTimeout(20000,()=>req.destroy(Error('SYNC_HTTP_UNAVAILABLE')));req.on('error',()=>reject(Error('SYNC_HTTP_UNAVAILABLE')));if(bytes)req.write(bytes);req.end();
 });
}
async function execute(input,data){
 const report={schema:'jarvis-nas120-ssh-platform-sync-v1',marker:MARKER,startedAt:new Date().toISOString(),status:'failed',platformBuild:RELEASE,applicationReleaseChanged:false,productAccepted:false,independentAcceptance:false,experienceVerified:false,modelCalls:0,modelCredentialsRead:false,modelConfigurationWrites:0,sessionCreated:false,sessionRevoked:false,businessWrites:[],environmentInfo:{status:'skipped',reason:'OUT_OF_SCOPE_PRESERVE_EXISTING_PROJECT_CONTENT'},refs:data.refs};
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
   let selected=found[0];if(!selected){selected=(await api(basePath,decision(data))).data;report.businessWrites.push('decision-selected');}
   ensure(selected.chosenId==='112-independent-tunnel'&&selected.independentAcceptance===false&&['selected','implemented'].includes(selected.status),'SYNC_DECISION_CHANGED');
   const performed=selected.actions.some(action=>action.state==='performed'&&action.summary.startsWith(MARKER));
   if(!performed){selected=(await api(basePath+'/'+selected.id+'/implementation',implementation(data,selected.revision))).data;report.businessWrites.push('decision-implemented');}
   const detail=(await api(basePath+'/'+selected.id)).data;ensure(detail.status==='implemented'&&detail.independentAcceptance===false&&detail.revisions.length>=2,'SYNC_DECISION_READBACK');report.decision={id:detail.id,revision:detail.revision,status:detail.status,independentAcceptance:detail.independentAcceptance};
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
 const report=input.execute?await execute(input,data):{schema:'jarvis-nas120-ssh-platform-sync-prepared-v1',status:'prepared',platformBuild:RELEASE,applicationReleaseChanged:false,sourceSHA256:SOURCE,projectMatch:'exact name / personal / owner server-admin; 0 or >1 skips without guessing',session:'jarvis account; 120s in-memory token; finally delete only own hash',plannedActions:['selected decision then CAS append implementation; independentAcceptance false','experience capture inbox and verified false','do not write project environment/notes; preserve full existing content without truncation or schema expansion'],idempotency:'fixed marker plus deterministic command IDs; GET existing marker before writes; no automatic retries',noModelCredentialReads:true,noProductCodeChanges:true,noDeployment:true,productionExecuted:false,refs:data.refs,decisionTemplate:decision(data),implementationTemplate:implementation(data,1),experienceTitle:EXPERIENCE,experienceTemplate:experience('00000000-0000-4000-8000-000000000000',data),summary,projectEnvironmentWritePlanned:false};
 if(input.report){mkdirSync(dirname(resolve(input.report)),{recursive:true});writeFileSync(resolve(input.report),JSON.stringify(report,null,2)+'\n',{mode:0o600});}
 console.log(JSON.stringify(report));if(report.status==='failed')process.exitCode=1;
}catch(error){console.log(JSON.stringify({status:'failed',failure:{code:/^SYNC_[A-Z_]+$/.test(error?.message??'')?error.message:'SYNC_PREPARATION_FAILED'},productionExecuted:false}));process.exitCode=1;}
