/** Fixed R27 host observation/install program builders. Importing does no IO. */
import {sha,canonical,repairScope as S} from './run-factory-main-repair-r26.mjs';
import {fixedToolSHA,repairVerifierHostReadProgram} from './prepare-factory-repair-verifier-r26.mjs';
import {r27VerifierScope as V,r27AuthenticationPolicy,r27SandboxImageContract,assertR27Observation} from './prepare-factory-verifier-r27.mjs';
import {reportReadFragment} from './factory-repair-evidence-read-r26.mjs';
import {cleanupReadFragment} from './verify-factory-repair-cleanup-r26.mjs';

const H=/^[a-f0-9]{64}$/,need=(v,c)=>{if(!v)throw Error(c);},same=(a,b)=>canonical(a)===canonical(b);
export const r27HostConstants=Object.freeze({agentId:'0b5aea06-47e1-4f4b-a32e-969417915c9c',mainMetadataSHA256:'f9a218fbffab9df21d05717978d8ad4d0baa63bf2c69f9f3a81e6e702711f626',mainIdentity:Object.freeze({device:66306,inode:14417953}),oldCandidateIdentity:Object.freeze({device:66306,inode:6713082}),originPath:'/var/lib/jarvis-development/101/repair-r27-preparation/origin.json',originSHA256:'d44a714159800bfd69803298b5c4bbfff61fad79f19fd378645cdee1d8bef39e',oldCandidate:S.workspace,oldCandidateFingerprint:'66a56a19ce783c020ed211d7c6a2b620f1767783cd9c58525df3ca33dc0ce246',oldCandidateFiles:605,oldCandidateMetadataSHA256:'627d3db589bc56dbbdd1fc2510cc738f78297551d8ecc12648a80fd081bdc1d0',collectorSHA256:'a8b75bd92b5922bce776861b81536d934fab6eba0fa6d2fa65228fabbad523fd',sudoRule:'/etc/sudoers.d/jarvis-main-acceptance-r27'});
export function assertR27Preparation(p){
 need(p?.schemaVersion===1&&p.kind==='software-factory-r27-independent-verifier-preparation'&&same(p.scope,V)&&p.preparedOffline===true&&p.installed===false&&p.verificationDispatched===false&&p.productAccepted===false&&p.modelsInvoked===false&&same(p.oldFixedTools,fixedToolSHA)&&same(p.authenticationPolicy,r27AuthenticationPolicy)&&same(p.sandboxImageContract,r27SandboxImageContract)&&p.newCollectorSHA256===r27HostConstants.collectorSHA256&&p.requiredTestFiles===45&&p.requiredPrototypeSuites===30&&p.minimumCoverage.lines>=90&&p.minimumCoverage.branches>=80&&[p.wrapperSHA256,p.baselineSHA256,p.policySHA256,p.sourceObservationSHA256].every(x=>H.test(x??'')),'R27_HOST_PREPARATION_INVALID');
 const o=assertR27Observation(p.sourceObservation);need(p.sourceObservationSHA256===sha(o)&&o.originSHA256===r27HostConstants.originSHA256,'R27_HOST_SOURCE_OBSERVATION_CHANGED');return p;
}
export function hostReadParams(preparation,{expectedTargetTemplateSHA256,expectedOtherNodeTemplatesSHA256=null,requireInstalled=false,verifySudo=false,idle=false,runId=null,attempt=null}={}){
 assertR27Preparation(preparation);need(H.test(expectedTargetTemplateSHA256??'')&&(expectedOtherNodeTemplatesSHA256===null||H.test(expectedOtherNodeTemplatesSHA256)),'R27_HOST_TEMPLATE_HASH_REQUIRED');
 if(verifySudo)need(requireInstalled===true,'R27_HOST_SUDO_READBACK_REQUIRES_INSTALLED');
 if(runId!==null)need(/^[a-f0-9]{40}$/.test(runId),'R27_HOST_RUN_SCOPE_INVALID');if(attempt!==null)need(/^[a-f0-9]{32}$/.test(attempt)&&runId!==null,'R27_HOST_ATTEMPT_SCOPE_INVALID');
 return {...V,source:S.source,mainFingerprint:S.baselineSHA,mainFiles:593,mainMetadataSHA256:r27HostConstants.mainMetadataSHA256,mainIdentity:r27HostConstants.mainIdentity,oldCandidateIdentity:r27HostConstants.oldCandidateIdentity,goalSHA:S.goalSHA,templateId:S.templateId,agentId:r27HostConstants.agentId,oldCandidate:r27HostConstants.oldCandidate,oldCandidateFingerprint:r27HostConstants.oldCandidateFingerprint,oldCandidateFiles:605,oldCandidateMetadataSHA256:r27HostConstants.oldCandidateMetadataSHA256,originPath:r27HostConstants.originPath,originSHA256:r27HostConstants.originSHA256,fixedTools:fixedToolSHA,candidateFingerprint:preparation.sourceObservation.candidateFingerprint,candidateMetadataSHA256:preparation.sourceObservation.candidateMetadataSHA256,candidateFiles:preparation.sourceObservation.files,preparation,expectedTargetTemplateSHA256,expectedOtherNodeTemplatesSHA256,expectedInstalled:expectedR27Installed(preparation),requireInstalled:requireInstalled===true,verifySudo:verifySudo===true,idle:idle===true,runId,attempt};
}
function inventorySource(){const all=repairVerifierHostReadProgram(),a=all.indexOf('def report_file_sha(q,limit):'),b=all.indexOf('def immutable():',a);need(a>0&&b>a,'R27_HOST_INVENTORY_TEMPLATE_CHANGED');return all.slice(a,b);}
export const r27HostBase=String.raw`
import os,sys,stat,pwd,json,hashlib,re,subprocess,sqlite3,signal
from pathlib import Path
from types import ModuleType
sys.dont_write_bytecode=True
def need(v,c):
 if not v:raise RuntimeError(c)
def deadline(signum,frame):raise RuntimeError('R27_HOST_OBSERVATION_TIMEOUT')
signal.signal(signal.SIGALRM,deadline);signal.alarm(150)
need(os.geteuid()==0,'R27_HOST_ROOT_REQUIRED')
need(p['workspace']=='/home/superopen/All-Projects/msf-repair-r27/source' and p['parent']=='/home/superopen/All-Projects/msf-repair-r27' and p['source']=='/home/superopen/All-Projects/msf' and p['oldCandidate']=='/home/superopen/All-Projects/msf-main-repair-r26/source' and p['entry']=='/usr/local/libexec/jarvis-msf-main-acceptance-r27' and p['configRoot']=='/etc/jarvis-development/main-acceptance-r27' and p['evidenceRoot']=='/var/lib/jarvis-development/101/main-acceptance-r27' and p['agentId']=='0b5aea06-47e1-4f4b-a32e-969417915c9c','R27_HOST_FIXED_SCOPE_CHANGED')
env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/root'}
def key(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def trusted(q):
 q=Path(q)
 for part in [q,*q.parents]:
  s=part.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R27_HOST_ROOT_CHAIN_UNTRUSTED')
 return q
def private_read(q,limit=2097152):
 q=trusted(q);fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and 0<=s.st_size<=limit,'R27_HOST_FILE_INVALID');data=bytearray()
  while len(data)<=limit:
   part=os.read(fd,min(65536,limit+1-len(data)))
   if not part:break
   data.extend(part)
  a=os.fstat(fd);need(key(s)==key(a)==key(q.lstat()) and len(data)==s.st_size,'R27_HOST_FILE_CHANGED');return bytes(data)
 finally:os.close(fd)
def hashv(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
tools_dir=Path('/opt/jarvis-development/software-factory');helper_body=private_read(tools_dir/'project-autonomy-evidence.py')
need(hashlib.sha256(helper_body).hexdigest()==p['fixedTools']['project-autonomy-evidence.py'],'R27_HOST_HELPER_CHANGED')
h=ModuleType('r27_public_observer');exec(compile(helper_body,str(tools_dir/'project-autonomy-evidence.py'),'exec'),h.__dict__)
def identity(fd):
 s=os.fstat(fd);return {'device':s.st_dev,'inode':s.st_ino}
def fingerprint_fd(fd):
 entries=[];h.walk(fd,entries);value=''.join(e['path']+'\0'+e['sha256']+'\n' for e in entries).encode()
 return {'sha256':hashlib.sha256(value).hexdigest(),'files':len(entries),'bytes':sum(e['bytes'] for e in entries),'manifest':entries}
def source_state(path):
 root=h.open_directory(path)
 try:
  first=fingerprint_fd(root);meta=[]
  for e in first['manifest']:
   fd=h.open_relative(root,e['path'])
   try:
    s=os.fstat(fd);meta.append([e['path'],s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns])
   finally:os.close(fd)
  second=fingerprint_fd(root);need(first==second,'R27_HOST_SOURCE_READ_CHANGED');ident=identity(root)
  named=h.open_directory(path)
  try:need(identity(named)==ident,'R27_HOST_SOURCE_DIRECTORY_REPLACED')
  finally:os.close(named)
  return {'sha256':first['sha256'],'files':first['files'],'bytes':first['bytes'],'metadataSHA':hashlib.sha256(json.dumps(meta,separators=(',',':')).encode()).hexdigest(),'stable':True,'identity':ident},first
 finally:os.close(root)
def quiet():
 values=subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID'],text=True,timeout=10,env=env)
 unit=dict(v.split('=',1) for v in values.splitlines() if '=' in v);pid=int(unit.get('MainPID',0));need(pid>1 and unit.get('ActiveState')=='active','R27_HOST_NODE_NOT_ACTIVE')
 def proc(q):
  text=(q/'stat').read_text();v=text[text.rfind(')')+2:].split();return int(v[1]),v[19]
 initial=proc(Path('/proc')/str(pid));children=[]
 for q in Path('/proc').iterdir():
  if not q.name.isdigit():continue
  try:
   if proc(q)[0]==pid:children.append(int(q.name))
  except (FileNotFoundError,ProcessLookupError):pass
 journal=Path('/var/lib/jarvis-development/101')/('.delivery-'+p['agentId'])/'journal.sqlite'
 for q in [journal,*journal.parents]:need(not q.is_symlink(),'R27_HOST_DELIVERY_PATH_UNTRUSTED')
 s=journal.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'R27_HOST_DELIVERY_FILE_INVALID')
 c=sqlite3.connect('file:'+str(journal)+'?mode=ro',uri=True,timeout=10)
 try:counts={'runs':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'deliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'logs':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
 finally:c.close()
 need(initial==proc(Path('/proc')/str(pid)),'R27_HOST_NODE_PROCESS_CHANGED')
 return {'active':True,'pid':pid,'start':initial[1],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'children':sorted(children),'counts':counts}
def node_templates():
 q=Path('/var/lib/jarvis-development/101/config.json');trusted(q.parent);fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid in [0,1000] and s.st_gid in [0,1000] and not s.st_mode&0o077 and 0<s.st_size<=2097152,'R27_HOST_NODE_CONFIG_UNTRUSTED');data=bytearray()
  while len(data)<=2097152:
   part=os.read(fd,min(65536,2097153-len(data)))
   if not part:break
   data.extend(part)
  a=os.fstat(fd);need(key(s)==key(a)==key(q.lstat()) and len(data)==s.st_size,'R27_HOST_NODE_CONFIG_CHANGED')
 finally:os.close(fd)
 cfg=json.loads(data);need(cfg.get('machineId')==p['machineId'] and cfg.get('agentId')==p['agentId'] and isinstance(cfg.get('templates'),list),'R27_HOST_NODE_CONFIG_IDENTITY_CHANGED');target=[v for v in cfg['templates'] if v.get('id')==p['templateId']]
 need(len(target)==1 and hashv(target[0])==p['expectedTargetTemplateSHA256'],'R27_HOST_NODE_TEMPLATE_CHANGED');others=hashv(sorted([v for v in cfg['templates'] if v.get('id')!=p['templateId']],key=lambda v:v['id']))
 if p.get('expectedOtherNodeTemplatesSHA256'):need(others==p['expectedOtherNodeTemplatesSHA256'],'R27_HOST_OTHER_NODE_TEMPLATES_CHANGED')
 return {'targetSHA256':hashv(target[0]),'otherTemplatesSHA256':others,'configSHA256':hashlib.sha256(data).hexdigest()}
def origin_state(candidate):
 q=Path('/var/lib/jarvis-development/101/repair-r27-preparation/origin.json');raw=private_read(q);o=json.loads(raw);digest=hashlib.sha256(raw).hexdigest()
 need(digest==p['originSHA256'] and o.get('version')==1 and o.get('phase')=='ready' and o.get('workspace')==p['workspace'] and o.get('parent')==p['parent'] and o.get('baselineSHA')==p['oldCandidateFingerprint'] and re.fullmatch('[a-f0-9]{32}',str(o.get('job',''))),'R27_HOST_ORIGIN_BINDING_CHANGED')
 account=pwd.getpwnam('superopen');parent=h.open_directory(p['parent']);fd=None
 try:
  s=os.fstat(parent);need(identity(parent)==o['parentIdentity'] and s.st_uid==account.pw_uid and s.st_gid==account.pw_gid and not s.st_mode&0o077,'R27_HOST_ORIGIN_PARENT_CHANGED');fd=os.open('source',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent);s=os.fstat(fd)
  need(identity(fd)==o['identity']==candidate['identity'] and s.st_uid==account.pw_uid and s.st_gid==account.pw_gid and not s.st_mode&0o077,'R27_HOST_ORIGIN_CANDIDATE_CHANGED')
 finally:
  if fd is not None:os.close(fd)
  os.close(parent)
 return {'sha256':digest,'bound':True,'identity':o['identity'],'parentIdentity':o['parentIdentity']}
def installed():
 paths=[('/usr/local/libexec/jarvis-msf-main-acceptance-r27',0o755),('/opt/jarvis-development/software-factory/project-autonomy-fa01-collector-r27.mjs',0o644),('/etc/jarvis-development/main-acceptance-r27/baseline.json',0o600),('/etc/jarvis-development/main-acceptance-r27/policy.json',0o600),('/etc/sudoers.d/jarvis-main-acceptance-r27',0o440)];out={};names=['wrapperSHA256','collectorSHA256','baselineSHA256','policySHA256','sudoRuleSHA256']
 for (path,mode),name in zip(paths,names):
  q=Path(path)
  if not os.path.lexists(q):continue
  trusted(q);s=q.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_mode&0o777==mode,'R27_HOST_INSTALLED_FILE_UNTRUSTED');out[name]=hashlib.sha256(private_read(q)).hexdigest()
 if not out:return None
 if len(out)!=5:return {'partial':True,'hashes':out}
 return out
def sandbox_image():
 contract=p['preparation']['sandboxImageContract'];r=subprocess.run(['/usr/bin/docker','image','inspect',contract['imageId']],capture_output=True,text=True,timeout=15,env=env);need(r.returncode==0 and len(r.stdout)<=2097152,'R27_HOST_SANDBOX_IMAGE_QUERY_FAILED');v=json.loads(r.stdout);need(isinstance(v,list) and len(v)==1,'R27_HOST_SANDBOX_IMAGE_INVALID');v=v[0]
 need(v.get('Id')==contract['imageId'] and v.get('Architecture')==contract['architecture'] and v.get('Os')==contract['os'] and contract['reference'] in v.get('RepoDigests',[]),'R27_HOST_SANDBOX_IMAGE_CONTRACT_CHANGED')
 return {'imageId':v['Id'],'architecture':v['Architecture'],'os':v['Os'],'reference':contract['reference'],'observed':True}
`;
function stateProgram(){
 const anchor="tools_dir=Path('/opt/jarvis-development/software-factory');helper_body=private_read(tools_dir/'project-autonomy-evidence.py')";
 const pins={fixedTools:fixedToolSHA,mainFingerprint:S.baselineSHA,mainFiles:593,mainMetadataSHA256:r27HostConstants.mainMetadataSHA256,mainIdentity:r27HostConstants.mainIdentity,oldCandidateFingerprint:r27HostConstants.oldCandidateFingerprint,oldCandidateFiles:605,oldCandidateMetadataSHA256:r27HostConstants.oldCandidateMetadataSHA256,oldCandidateIdentity:r27HostConstants.oldCandidateIdentity,originSHA256:r27HostConstants.originSHA256};
 const guard=`pinned=json.loads(${JSON.stringify(JSON.stringify(pins))})\nneed(all(p.get(k)==v for k,v in pinned.items()),'R27_HOST_FIXED_PINS_CHANGED')\nneed(p['preparation']['newCollectorSHA256']=='${r27HostConstants.collectorSHA256}' and p['preparation']['authenticationPolicy']==json.loads(${JSON.stringify(JSON.stringify(r27AuthenticationPolicy))}) and p['preparation']['sandboxImageContract']==json.loads(${JSON.stringify(JSON.stringify(r27SandboxImageContract))}),'R27_HOST_PREPARATION_PINS_CHANGED')\n`;
 need(r27HostBase.split(anchor).length===2,'R27_HOST_PIN_TARGET_CHANGED');
 return r27HostBase.replace(anchor,guard+anchor)+inventorySource()+String.raw`
def old_immutable():
 paths=['/etc/jarvis-development/project-autonomy/baseline.json','/etc/jarvis-development/project-autonomy/FA-01.json',str(tools_dir/'factory-no-model-receipt-r26.mjs')]
 for suffix in ['r26','r26-4','r26-repair']:
  paths+=['/usr/local/libexec/jarvis-msf-main-acceptance-'+suffix,'/etc/jarvis-development/main-acceptance-'+suffix+'/baseline.json','/etc/jarvis-development/main-acceptance-'+suffix+'/policy.json','/etc/sudoers.d/jarvis-main-acceptance-'+suffix]
 out={}
 for path in paths:
  q=Path(path);out[path]=hashlib.sha256(private_read(q)).hexdigest() if os.path.lexists(q) else hashlib.sha256(b'fixed-path-absent').hexdigest()
 for suffix in ['r26','r26-4','r26-repair']:out.update(report_inventory('/var/lib/jarvis-development/101/main-acceptance-'+suffix))
 return out
def state():
 main,_=source_state(p['source']);old,_=source_state(p['oldCandidate']);candidate,_=source_state(p['workspace'])
 need(main['sha256']==p['mainFingerprint'] and main['files']==593 and main['metadataSHA']==p['mainMetadataSHA256'] and main['identity']==p['mainIdentity'],'R27_HOST_MAIN_CHANGED');need(old['sha256']==p['oldCandidateFingerprint'] and old['files']==605 and old['metadataSHA']==p['oldCandidateMetadataSHA256'] and old['identity']==p['oldCandidateIdentity'],'R27_HOST_OLD_CANDIDATE_CHANGED')
 need(candidate['sha256']==p['candidateFingerprint'] and candidate['files']==p['candidateFiles'] and candidate['metadataSHA']==p['candidateMetadataSHA256'],'R27_HOST_NEW_CANDIDATE_CHANGED');origin=origin_state(candidate);node=quiet();templates=node_templates();tools={name:hashlib.sha256(private_read(tools_dir/name)).hexdigest() for name in p['fixedTools']};need(tools==p['fixedTools'],'R27_HOST_OLD_FIXED_TOOLS_CHANGED')
 if p.get('idle'):need(not node['children'] and not any(node['counts'].values()),'R27_HOST_NODE_NOT_ACK_IDLE')
 current=installed()
 if p.get('requireInstalled'):need(current is not None and current==p['expectedInstalled'],'R27_HOST_NEW_INSTALLATION_CHANGED')
 sudo_verified=False
 if p.get('verifySudo'):
  need(p.get('requireInstalled') is True,'R27_HOST_SUDO_READBACK_REQUIRES_INSTALLED')
  result=subprocess.run(['/usr/sbin/visudo','-cf','/etc/sudoers.d/jarvis-main-acceptance-r27'],capture_output=True,timeout=15,env=env);need(result.returncode==0,'R27_HOST_SUDO_READBACK_INVALID');sudo_verified=True
 return {'source':main,'candidate':candidate,'oldCandidate':old,'originSHA256':origin['sha256'],'originBound':True,'originIdentity':origin['identity'],'originParentIdentity':origin['parentIdentity'],'quiet':node,'nodeTemplates':templates,'fixedTools':tools,'oldImmutable':old_immutable(),'installed':current,'visudoVerified':sudo_verified,'sandboxImage':sandbox_image()}
first=state()
`;
}
const OUTPUT=String.raw`
second=state();need(first==second,'R27_HOST_OBSERVATION_CHANGED_RETRY_READ_ONLY')
print(json.dumps({'schemaVersion':1,'kind':'software-factory-r27-host-observation','observedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),**second,'helperVerified':True,'sourceVerificationScope':'public-manifest-and-metadata','mutationsPerformed':False,'modelsInvoked':False,'rawLogsExported':False,'privateEnvironmentExported':False,'productCodeExecuted':False,**({'cleanupAudit':cleanup_observation,'attempts':attempts} if 'cleanup_observation' in globals() else {})}))
`;
export function r27HostReadProgram(){return stateProgram()+OUTPUT;}
export function expectedR27Installed(preparation){assertR27Preparation(preparation);return {wrapperSHA256:preparation.wrapperSHA256,collectorSHA256:preparation.newCollectorSHA256,baselineSHA256:preparation.baselineSHA256,policySHA256:preparation.policySHA256,sudoRuleSHA256:sha('superopen ALL=(root) NOPASSWD: '+V.entry+' *\n')};}
export function assertHostObservation(h,preparation,{expectedTargetTemplateSHA256,expectedOtherNodeTemplatesSHA256=null,expectedMain=null,expectedOldCandidate=null,expectedOldImmutable=null,idle=false,requireInstalled=false,verifySudo=false}={}){
 assertR27Preparation(preparation);const o=preparation.sourceObservation;
 need(h?.schemaVersion===1&&h.kind==='software-factory-r27-host-observation'&&h.helperVerified===true&&h.mutationsPerformed===false&&h.modelsInvoked===false&&h.rawLogsExported===false&&h.privateEnvironmentExported===false&&h.productCodeExecuted===false&&h.sourceVerificationScope==='public-manifest-and-metadata','R27_HOST_OBSERVATION_INVALID');
 need(h.source?.sha256===S.baselineSHA&&h.source.files===593&&h.source.metadataSHA===r27HostConstants.mainMetadataSHA256&&same(h.source.identity,r27HostConstants.mainIdentity)&&h.oldCandidate?.sha256===r27HostConstants.oldCandidateFingerprint&&h.oldCandidate.files===605&&h.oldCandidate.metadataSHA===r27HostConstants.oldCandidateMetadataSHA256&&same(h.oldCandidate.identity,r27HostConstants.oldCandidateIdentity)&&h.candidate?.sha256===o.candidateFingerprint&&h.candidate.files===o.files&&h.candidate.metadataSHA===o.candidateMetadataSHA256&&[h.source,h.candidate,h.oldCandidate].every(v=>v.stable===true&&H.test(v.metadataSHA??'')&&Number.isSafeInteger(v.identity?.device)&&Number.isSafeInteger(v.identity?.inode)),'R27_HOST_SOURCE_BINDING_CHANGED');
 need(h.originBound===true&&h.originSHA256===o.originSHA256&&same(h.originIdentity,h.candidate.identity)&&same(h.fixedTools,fixedToolSHA)&&h.nodeTemplates?.targetSHA256===expectedTargetTemplateSHA256&&H.test(h.nodeTemplates.otherTemplatesSHA256??'')&&H.test(h.nodeTemplates.configSHA256??'')&&h.oldImmutable&&Object.values(h.oldImmutable).every(x=>H.test(x)),'R27_HOST_ROOT_OR_NODE_BINDING_CHANGED');
 if(expectedMain)need(same(h.source,expectedMain),'R27_HOST_MAIN_METADATA_CHANGED');if(expectedOldCandidate)need(same(h.oldCandidate,expectedOldCandidate),'R27_HOST_OLD_CANDIDATE_METADATA_CHANGED');if(expectedOldImmutable)need(same(h.oldImmutable,expectedOldImmutable),'R27_HOST_OLD_FILES_CHANGED');if(expectedOtherNodeTemplatesSHA256)need(h.nodeTemplates.otherTemplatesSHA256===expectedOtherNodeTemplatesSHA256,'R27_HOST_OTHER_NODE_TEMPLATES_CHANGED');
 need(h.quiet?.active===true&&Array.isArray(h.quiet.children)&&['runs','deliveries','logs'].every(k=>Number.isSafeInteger(h.quiet.counts?.[k])&&h.quiet.counts[k]>=0)&&same(h.sandboxImage,{imageId:r27SandboxImageContract.imageId,architecture:'amd64',os:'linux',reference:r27SandboxImageContract.reference,observed:true}),'R27_HOST_IDLE_OR_IMAGE_INVALID');
 if(idle)need(!h.quiet.children.length&&same(h.quiet.counts,{runs:0,deliveries:0,logs:0}),'R27_HOST_NODE_NOT_ACK_IDLE');if(requireInstalled)need(same(h.installed,expectedR27Installed(preparation)),'R27_HOST_NEW_INSTALLATION_CHANGED');if(verifySudo)need(requireInstalled===true&&h.visudoVerified===true,'R27_HOST_SUDO_READBACK_INVALID');return h;
}

export function buildR27InstallPayload({preparation,wrapper,collector,baseline,policy,host,installJob}){
 assertR27Preparation(preparation);need(/^[a-f0-9]{32}$/.test(installJob??''),'R27_INSTALL_JOB_REQUIRED');
 const expected=expectedR27Installed(preparation),rule='superopen ALL=(root) NOPASSWD: '+V.entry+' *\n';
 const files=[[V.entry,wrapper,0o755,'wrapperSHA256'],[V.collectorPath,collector,0o644,'collectorSHA256'],[V.configRoot+'/baseline.json',baseline,0o600,'baselineSHA256'],[V.configRoot+'/policy.json',policy,0o600,'policySHA256'],[r27HostConstants.sudoRule,rule,0o440,'sudoRuleSHA256']].map(([path,body,mode,key])=>{need((typeof body==='string'||Buffer.isBuffer(body))&&sha(body)===expected[key],'R27_INSTALL_BODY_HASH_CHANGED');return {path,body:Buffer.from(body).toString('base64'),mode,sha256:sha(body)};});
 assertHostObservation(host,preparation,{expectedTargetTemplateSHA256:host.nodeTemplates.targetSHA256,idle:true});
 return {...hostReadParams(preparation,{expectedTargetTemplateSHA256:host.nodeTemplates.targetSHA256,expectedOtherNodeTemplatesSHA256:host.nodeTemplates.otherTemplatesSHA256,idle:true}),expectedHost:host,files,expectedInstalled:expected,installJob};
}
export function r27InstallProgram(){return stateProgram()+String.raw`
import base64,fcntl
os.umask(0o077);need(p.get('idle') is True and re.fullmatch('[a-f0-9]{32}',str(p.get('installJob',''))),'R27_INSTALL_FIXED_JOB_REQUIRED')
def safe_host(v):return {k:v[k] for k in ['source','candidate','oldCandidate','originSHA256','originBound','originIdentity','originParentIdentity','quiet','nodeTemplates','fixedTools','oldImmutable','installed','visudoVerified','sandboxImage']}
need(safe_host(first)==safe_host(p['expectedHost']),'R27_INSTALL_PREPARE_OBSERVATION_CHANGED')
paths=['/usr/local/libexec/jarvis-msf-main-acceptance-r27','/opt/jarvis-development/software-factory/project-autonomy-fa01-collector-r27.mjs','/etc/jarvis-development/main-acceptance-r27/baseline.json','/etc/jarvis-development/main-acceptance-r27/policy.json','/etc/sudoers.d/jarvis-main-acceptance-r27'];modes=[0o755,0o644,0o600,0o600,0o440]
need([x['path'] for x in p['files']]==paths and [x['mode'] for x in p['files']]==modes,'R27_INSTALL_PAYLOAD_SCOPE_CHANGED');bodies=[]
for item in p['files']:
 data=base64.b64decode(item['body'],validate=True);need(0<len(data)<=2097152 and hashlib.sha256(data).hexdigest()==item['sha256'],'R27_INSTALL_PAYLOAD_HASH_CHANGED');bodies.append(data)
manifest=p['preparation'];expected={'wrapperSHA256':manifest['wrapperSHA256'],'collectorSHA256':manifest['newCollectorSHA256'],'baselineSHA256':manifest['baselineSHA256'],'policySHA256':manifest['policySHA256'],'sudoRuleSHA256':hashlib.sha256(('superopen ALL=(root) NOPASSWD: '+p['entry']+' *\n').encode()).hexdigest()}
need(expected==p['expectedInstalled'] and [hashlib.sha256(b).hexdigest() for b in bodies]==list(expected.values()),'R27_INSTALL_PREPARATION_HASH_CHANGED')
base=json.loads(bodies[2]);policy=json.loads(bodies[3]);need(base.get('workspace')==p['workspace'] and base.get('sourceFingerprintObserved')==p['candidateFingerprint'] and policy.get('workspace')==p['workspace'] and policy.get('sourceFingerprint')==p['candidateFingerprint'] and policy.get('evidenceRoot')==p['evidenceRoot'],'R27_INSTALL_CONFIG_SOURCE_CHANGED')
need(len(base.get('requiredTestFiles',[]))==45 and len(base.get('requiredPrototypeSuites',[]))==30 and base['minimumCoverage']['lines']>=90 and base['minimumCoverage']['branches']>=80 and policy.get('authenticationPolicy')==manifest['authenticationPolicy'] and policy.get('sandboxImageContract')==manifest['sandboxImageContract'],'R27_INSTALL_CONFIG_SCOPE_CHANGED')
need(bodies[4]==('superopen ALL=(root) NOPASSWD: '+p['entry']+' *\n').encode(),'R27_INSTALL_SUDO_BODY_CHANGED')
check=subprocess.run(['/usr/sbin/visudo','-cf','-'],input=bodies[4],capture_output=True,timeout=15,env=env);need(check.returncode==0,'R27_INSTALL_SUDO_INVALID')
def directory(q):
 trusted(q.parent)
 if not os.path.lexists(q):os.mkdir(q,0o700)
 trusted(q);s=q.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_mode&0o777==0o700,'R27_INSTALL_DIRECTORY_UNTRUSTED')
def put_atomic(q,data,mode):
 trusted(q.parent)
 if os.path.lexists(q):
  trusted(q);s=q.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_mode&0o777==mode and private_read(q)==data,'R27_INSTALL_EXISTING_FILE_CONFLICT');return
 temporary=q.parent/(q.name+'.r27-'+p['installJob']+'.tmp');fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  view=memoryview(data)
  while view:
   count=os.write(fd,view);need(count>0,'R27_INSTALL_SHORT_WRITE');view=view[count:]
  os.fchmod(fd,mode);os.fsync(fd)
 finally:os.close(fd)
 need(private_read(temporary)==data,'R27_INSTALL_TEMP_BYTES_CHANGED')
 # link is an atomic no-replace publication. The exact fresh temporary name
 # is unlinked afterwards; existing targets are never replaced or removed.
 os.link(temporary,q,follow_symlinks=False);os.unlink(temporary)
 need(private_read(q)==data,'R27_INSTALL_READBACK_CHANGED');parent=os.open(q.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(parent)
 finally:os.close(parent)
directory(Path(p['configRoot']));directory(Path(p['evidenceRoot']))
lock_path=Path(p['configRoot'])/'installation.lock';lock=os.open(lock_path,os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
try:
 s=os.fstat(lock);need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o077,'R27_INSTALL_LOCK_UNTRUSTED');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 current=state();need(safe_host(current)==safe_host(first),'R27_INSTALL_PRECOMMIT_OBSERVATION_CHANGED')
 for item,data in zip(p['files'][:4],bodies[:4]):put_atomic(Path(item['path']),data,item['mode'])
 before_authority=state();need({k:v for k,v in before_authority.items() if k!='installed'}=={k:v for k,v in first.items() if k!='installed'},'R27_INSTALL_SCOPE_CHANGED_BEFORE_AUTHORITY')
 put_atomic(Path(paths[4]),bodies[4],modes[4]);need(subprocess.run(['/usr/sbin/visudo','-cf',paths[4]],capture_output=True,timeout=15,env=env).returncode==0,'R27_INSTALL_SUDO_READBACK_INVALID')
 after=state();need(after['installed']==p['expectedInstalled'] and {k:v for k,v in after.items() if k!='installed'}=={k:v for k,v in first.items() if k!='installed'},'R27_INSTALL_POSTCOMMIT_OBSERVATION_CHANGED')
 print(json.dumps({'schemaVersion':1,'kind':'software-factory-r27-root-verifier-installation','installed':True,'installJob':p['installJob'],'entry':p['entry'],'source':after['source'],'candidate':after['candidate'],'oldCandidate':after['oldCandidate'],'originSHA256':after['originSHA256'],'originBound':True,'quiet':after['quiet'],'nodeTemplates':after['nodeTemplates'],'fixedTools':after['fixedTools'],'oldImmutable':after['oldImmutable'],'installedFiles':after['installed'],'sandboxImage':after['sandboxImage'],'oldFilesUnchanged':True,'mainSourceUnchanged':True,'oldCandidateUnchanged':True,'nodeACKIdle':True,'visudoVerified':True,'modelsInvoked':False,'verificationDispatched':False,'productAccepted':False,'uncertainOutcomeRequiresReadOnlyReconciliation':False}))
finally:os.close(lock)
`;}
export function r27CleanupReadProgram(){
 let fragment=cleanupReadFragment.replace("v.get('files')==605","v.get('files')==p['candidateFiles']");need(fragment!==cleanupReadFragment,'R27_HOST_CLEANUP_TEMPLATE_CHANGED');
 // The assembled R27 program has a metadata guard named key(). Keep the
 // source receipt loop local names from replacing that callable at module scope.
 for(const [before,after] of [["for key in ['before','after']:","for source_key in ['before','after']:"],["scope_root/('source-'+key+'.json')","scope_root/('source-'+source_key+'.json')"],["private_sources[key]","private_sources[source_key]"]]){need(fragment.split(before).length===2,'R27_HOST_CLEANUP_SOURCE_LOOP_CHANGED');fragment=fragment.replace(before,after);}
 return stateProgram()+String.raw`
need(re.fullmatch('[a-f0-9]{40}',str(p.get('runId',''))) and re.fullmatch('[a-f0-9]{32}',str(p.get('attempt',''))),'R27_HOST_EXACT_CLEANUP_SCOPE_REQUIRED')
`+reportReadFragment+fragment+OUTPUT;
}
