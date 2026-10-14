/** Independent R31-R2 six-stage bytes and resource census. No IO on import. */
import {canonical} from './run-factory-main-repair-r26.mjs';
import {buildCleanupR29Scope as oldScope} from './verify-factory-truth-gate-build-cleanup-r29.mjs';
import {buildCleanupR29R4HostProgram} from './verify-factory-truth-gate-build-cleanup-r29-r4.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},same=(a,b)=>canonical(a)===canonical(b),H=/^[a-f0-9]{64}$/,U=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const buildEvidenceR31R2Stages=Object.freeze(['mount-proof','offline-install','build','typecheck','truth-unit','targeted-pure']);
const stages=buildEvidenceR31R2Stages,names=B=>stages.map(n=>'jarvis-tg-r31-r2-'+B.attempt+'-'+n);
export const buildEvidenceR31R2Pins=Object.freeze({source:'/var/lib/jarvis-development/101/targets-r31-candidate-r2/source',fingerprint:'7814f74e1e7c62b1aeb862a6617970551a00493ba2884bf65595cfe65ef2a981',metadataSHA:'38102dd6642558fbbfefeca3d680b00678797ff86a369cfbb8c12c47fa10779e',sourceFiles:625,sourceBytes:18413026,sourceIdentity:Object.freeze({device:66306,inode:7136362}),root:'/var/lib/jarvis-development/101/truth-gate-r31-build-r2',tool:'/opt/jarvis-development/software-factory/factory-truth-gate-build-r31-r2-7e2210f7fc4eab6f.py',toolSHA:'7e2210f7fc4eab6f0e7b36a340102443de56376abed4127f5cdc834520061124',sourceOrigin:'/var/lib/jarvis-development/101/targets-r31-preparation-r2/45cef625928b2a29f377c6cefd7238ba/origin.json',sourceOriginSHA256:'9667ec46d5026db98cc877f25d930e4d0a5753dfae7d99c5a72e35191bf613e1',sourcePreparationSHA256:'8ee5b15a6ab08ee1ad3e6a22a96e650048f5d89fd65fc2b564239681108d6894',qaManifestSHA256:'f6226a49db08df3f3e137f7db17e44b5eaf89b3d221b674e079839dafce29cec'});
export function assertBuildEvidenceScopeR31R2(B){
 need(B&&Object.entries(buildEvidenceR31R2Pins).every(([k,v])=>same(B[k],v))&&B.image===oldScope.image&&B.helperSHA===oldScope.helperSHA&&B.agentId===oldScope.agentId&&/^[a-f0-9]{32}$/.test(B.attempt??'')&&Number.isSafeInteger(B.ownerPID)&&B.ownerPID>1&&/^[0-9]+$/.test(B.ownerStartTicks??'')&&U.test(B.ownerBoot??''),'R31_R2_EVIDENCE_FIXED_SCOPE_OR_OWNER_UNKNOWN');
 const s=B.startScope;need(s&&Object.keys(s).sort().join(',')==='fingerprint,metadataSHA,qaManifestSHA256,rendererSHA256,reviewSHA256,root,source,sourceBytes,sourceFiles,sourceIdentity,sourceOrigin,sourceOriginSHA256,sourcePreparationSHA256,starterSHA256,tool,toolSHA'&&Object.entries(s).every(([k,v])=>['reviewSHA256','starterSHA256','rendererSHA256'].includes(k)?H.test(v??''):same(B[k],v)),'R31_R2_EVIDENCE_START_SCOPE_CHANGED');return B;
}
const probeRoots=['/corepack-runtime','/corepack-cache','/pnpm-store','/qa-tools'];
const tap=total=>({tests:total,pass:total,fail:0,cancelled:0,skipped:0,todo:0});
function assertStages(h,B){
 const c=h.stageResults;need(['pass','fail'].includes(h.buildResultStatus)&&Array.isArray(c)&&c.length<=6&&same(c.map(x=>x.id),stages.slice(0,c.length))&&same(h.noRecordedResultStages,stages.slice(c.length))&&h.noRecordedResultExecutionState==='unknown'&&h.logEvidenceDoubleRead===true&&Array.isArray(h.unrecordedStageLogs),'R31_R2_EVIDENCE_STAGE_PREFIX_INVALID');
 need(h.sourceOriginSHA256===B.sourceOriginSHA256&&h.sourcePreparationSHA256===B.sourcePreparationSHA256&&h.qaTools?.stable===true&&h.qaTools.nofollow===true&&h.qaTools.uid===0&&h.qaTools.mode===365&&h.qaTools.manifestSHA256===B.qaManifestSHA256&&Number.isSafeInteger(h.qaTools.identity?.device)&&h.qaTools.identity.device>=0&&Number.isSafeInteger(h.qaTools.identity.inode)&&h.qaTools.identity.inode>0&&same(Object.keys(h.qaTools.files??{}).sort(),['baseline-r29-t8.ts','baseline-r30-truth.ts','targeted-pure.mjs'])&&Object.values(h.qaTools.files).every(v=>H.test(v.sha256??'')&&Number.isSafeInteger(v.bytes)&&v.bytes>0)&&h.qaTools.entries===4,'R31_R2_EVIDENCE_QA_OR_ORIGIN_INVALID');
 for(const x of c){
  need(['pass','fail'].includes(x.status)&&typeof x.executed==='boolean'&&typeof x.candidateCodeExecuted==='boolean'&&x.candidateCodeExecuted===(x.executed&&x.id!=='mount-proof')&&H.test(x.containerID??'')&&H.test(x.logSHA256??'')&&Number.isSafeInteger(x.logBytes)&&x.logBytes>=0&&x.logBytes<=50*1024*1024&&typeof x.timeout==='boolean'&&typeof x.logLimitExceeded==='boolean'&&Number.isSafeInteger(x.exitCode)&&x.mountsAndSandboxFlagsActuallyVerified===true&&x.rawLogsExported===false&&x.independentLogVerified===true,'R31_R2_EVIDENCE_STAGE_FIELDS_INVALID');
  if(x.status==='pass')need(x.executed&&x.exitCode===0&&!x.timeout&&!x.logLimitExceeded,'R31_R2_EVIDENCE_PASS_WITHOUT_EXECUTION');
  if(['truth-unit','targeted-pure'].includes(x.id)){const total=x.id==='truth-unit'?16:26;need(x.expectedTests===total&&same(x.actualTAPCounts,x.tests)&&x.testCountsComplete===(x.actualTAPCounts!==null)&&(x.actualTAPCounts===null||Object.keys(x.actualTAPCounts).sort().join(',')==='cancelled,fail,pass,skipped,tests,todo'&&Object.values(x.actualTAPCounts).every(n=>Number.isSafeInteger(n)&&n>=0)),'R31_R2_EVIDENCE_TAP_NOT_ACTUAL');if(x.status==='pass')need(same(x.actualTAPCounts,tap(total)),'R31_R2_EVIDENCE_TAP_DENOMINATOR_INVALID');}
 }
 const bootstrap=h.normalBindBootstrap;if(c[0]?.status==='pass'){
  need(Array.isArray(h.bootstrapExpected)&&h.bootstrapExpected.length===4&&same(h.bootstrapExpected.map(v=>v.root),probeRoots)&&h.bootstrapExpected.every(v=>Number.isSafeInteger(v.device)&&v.device>=0&&Number.isSafeInteger(v.inode)&&v.inode>0&&Number.isSafeInteger(v.bytes)&&v.bytes>=0&&Number.isSafeInteger(v.mode)&&v.mode>=0&&v.mode<=511&&H.test(v.sha256??'')&&typeof v.path==='string'&&v.path.length>0&&!v.path.startsWith('/')&&!v.path.split('/').some(z=>['','..','.'].includes(z))),'R31_R2_EVIDENCE_BOOTSTRAP_BASIS_INVALID');
  const q=h.bootstrapExpected[3];need(q.device===h.qaTools.identity.device&&q.inode===h.qaTools.identity.inode&&q.path==='targeted-pure.mjs'&&q.sha256===h.qaTools.files[q.path].sha256&&q.bytes===h.qaTools.files[q.path].bytes&&q.mode===292,'R31_R2_EVIDENCE_BOOTSTRAP_QA_CHANGED');
  need(same(bootstrap,{schemaVersion:1,kind:'r31-normal-bind-bootstrap',uid:1000,gid:1000,caches:h.bootstrapExpected.map(e=>({...e,readOnlyMount:true,mutationRejected:true,bytesVerified:true})),workWritable:true,candidateCodeExecuted:false}),'R31_R2_EVIDENCE_BOOTSTRAP_CHANGED');
 }
 if(c.length>1)need(c[0].status==='pass','R31_R2_EVIDENCE_BOOTSTRAP_BYPASSED');if(c.length>2)need(c[1].status==='pass','R31_R2_EVIDENCE_INSTALL_BYPASSED');
 if(h.buildResultStatus==='pass')need(c.length===6&&c.every(x=>x.status==='pass'),'R31_R2_EVIDENCE_TERMINAL_PASS_INVALID');
 const pending=h.creationIntentStage??null;need(pending===null||stages.includes(pending),'R31_R2_EVIDENCE_CREATION_INTENT_INVALID');const unknown=pending!==null&&!c.some(x=>x.id===pending)?pending:null;
 need(h.executionIdentityUnknownStage===unknown&&h.containerCgroupIdentityComplete===(unknown===null),'R31_R2_EVIDENCE_CONTAINER_IDENTITY_FLAG_CHANGED');
 need(h.unrecordedStageLogs.every(x=>stages.slice(c.length).includes(x.id)&&H.test(x.sha256??'')&&Number.isSafeInteger(x.bytes)&&x.bytes>=0&&x.bytes<=50*1024*1024)&&new Set(h.unrecordedStageLogs.map(x=>x.id)).size===h.unrecordedStageLogs.length,'R31_R2_EVIDENCE_UNRECORDED_LOG_INVALID');
 return {sourceValidated:true,stageEvidenceValidated:true,buildStagePass:h.buildResultStatus==='pass',containerCgroupIdentityComplete:unknown===null,executionIdentityUnknownStage:unknown};
}
export function assertBuildEvidenceHostR31R2(h,B){assertBuildEvidenceScopeR31R2(B);const stage=assertStages(h,B),census=assertCensus(h,B);return {...census,...stage};}

export function buildEvidenceHostProgramR31R2(B){
 assertBuildEvidenceScopeR31R2(B);let p=buildCleanupR29R4HostProgram(B);const replace=(a,b)=>{need(p.split(a).length===2,'R31_R2_EVIDENCE_READER_TEMPLATE_CHANGED');p=p.replace(a,b)};
 p=p.replaceAll('jarvis-tg-r29-','jarvis-tg-r31-r2-').replaceAll('jarvis.truthgate.r29','jarvis.truthgate.r31.r2').replaceAll('r29-build-once-launch','r31-r2-build-once-launch').replaceAll('R29_BUILD_CLEANUP','R31_R2_EVIDENCE').replaceAll('R29_R4_CLEANUP','R31_R2_EVIDENCE');
 replace("names=['jarvis-tg-r31-r2-'+p['attempt']+'-'+s for s in ['mount-proof','offline-install','build','typecheck','truth-unit']]","names=['jarvis-tg-r31-r2-'+p['attempt']+'-'+s for s in ['mount-proof','offline-install','build','typecheck','truth-unit','targeted-pure']]");replace('len(absent)==5','len(absent)==6');
 replace("need(state.get('attempt')==p['attempt']", "need(state.get('status') in ['pass','fail'],'R31_R2_EVIDENCE_TERMINAL_NOT_READY')\nneed(state.get('attempt')==p['attempt']");
 replace("expected_state_owner={'unit'", "need(launch.get('scope')==p['startScope'] and ownership.get('sourcePreparationSHA256')==p['sourcePreparationSHA256'] and ownership.get('qaManifestSHA256')==p['qaManifestSHA256'],'R31_R2_EVIDENCE_FROZEN_LAUNCH_SCOPE_CHANGED')\norigin_raw=private_read(Path(p['sourceOrigin']));need(digest(origin_raw)==p['sourceOriginSHA256'],'R31_R2_EVIDENCE_ORIGIN_CHANGED')\nexpected_state_owner={'unit'");
 const a=p.indexOf("stages=['mount-proof'"),z=p.indexOf('def work_state():',a);need(a>0&&z>a,'R31_R2_EVIDENCE_RESULT_TEMPLATE_CHANGED');
 p=p.slice(0,a)+String.raw`
def strict_json(raw):
 def pairs(items):
  value={}
  for k,v in items:
   need(k not in value,'R31_R2_EVIDENCE_DUPLICATE_JSON_KEY');value[k]=v
  return value
 def constant(_):raise RuntimeError('R31_R2_EVIDENCE_NONFINITE_JSON')
 return json.loads(raw,object_pairs_hook=pairs,parse_constant=constant)
def typed_equal(a,b):
 if type(a) is not type(b):return False
 if isinstance(a,dict):return a.keys()==b.keys() and all(typed_equal(v,b[k]) for k,v in a.items())
 if isinstance(a,list):return len(a)==len(b) and all(typed_equal(x,y) for x,y in zip(a,b))
 return a==b
def read_qa():
 path=root/'qa-tools';fd=h.open_directory(str(path))
 try:
  info=os.fstat(fd);need(info.st_uid==info.st_gid==0 and stat.S_IMODE(info.st_mode)==0o555 and sorted(os.listdir(fd))==['baseline-r29-t8.ts','baseline-r30-truth.ts','manifest.json','targeted-pure.mjs'],'R31_R2_EVIDENCE_QA_ROOT_CHANGED')
  raw=private_read(path/'manifest.json');need(digest(raw)==p['qaManifestSHA256'],'R31_R2_EVIDENCE_QA_MANIFEST_CHANGED');value=strict_json(raw)
  need(set(value)=={'schemaVersion','kind','files'} and type(value['schemaVersion']) is int and value['schemaVersion']==1 and value['kind']=='r31-bounded-qa-tools' and sorted(value['files'])==['baseline-r29-t8.ts','baseline-r30-truth.ts','targeted-pure.mjs'],'R31_R2_EVIDENCE_QA_SCOPE_CHANGED')
  for n in ['manifest.json',*value['files']]:
   s=os.stat(n,dir_fd=fd,follow_symlinks=False);need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o444,'R31_R2_EVIDENCE_QA_FILE_UNTRUSTED')
   body=private_read(path/n)
   if n!='manifest.json':
    entry=value['files'][n];need(set(entry)=={'sha256','bytes'} and type(entry['bytes']) is int and 0<entry['bytes']<=2000000 and len(body)==entry['bytes'] and digest(body)==entry['sha256'],'R31_R2_EVIDENCE_QA_BYTES_CHANGED')
   need(stat_key(s)==stat_key(os.stat(n,dir_fd=fd,follow_symlinks=False)),'R31_R2_EVIDENCE_QA_FILE_CHANGED')
  named=h.open_directory(str(path))
  try:need(stat_key(info)==stat_key(os.fstat(fd)) and identity(fd)==identity(named),'R31_R2_EVIDENCE_QA_ROOT_CHANGED')
  finally:os.close(named)
  return {'identity':identity(fd),'manifestSHA256':digest(raw),'files':value['files'],'uid':info.st_uid,'mode':stat.S_IMODE(info.st_mode),'entries':4,'stable':True,'nofollow':True}
 finally:os.close(fd)
CACHE_PRODUCER=Path('/var/lib/jarvis-development/101/truth-gate-r29-build/6cc370ff0a1b82babedc165b0e574c26')
CACHE_PINS=[('corepack-runtime','7912713a300f2316823a46a8e034c3c5d85a3190ca0dea9e7f13cd6138c1fe5b'),('corepack-cache','746e0d599f6038fc9e09af755cb8343f2e2f2253c4d46a359f803a99058b2bff'),('pnpm-store','120ec4b1f4615c0097575d77865b233fd87fb3eb1df5da7a5ec5ebf212e403bc')]
def full_metadata(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def hash_sample(fd):
 before=os.fstat(fd);need(before.st_size<=128*1024*1024,'R31_R2_EVIDENCE_CACHE_SAMPLE_LIMIT');hasher=hashlib.sha256();size=0
 while True:
  chunk=os.read(fd,65536)
  if not chunk:break
  size+=len(chunk);need(size<=before.st_size,'R31_R2_EVIDENCE_CACHE_SAMPLE_CHANGED');hasher.update(chunk)
 need(size==before.st_size and full_metadata(before)==full_metadata(os.fstat(fd)),'R31_R2_EVIDENCE_CACHE_SAMPLE_CHANGED');return hasher.hexdigest(),size
def probe_basis(qa):
 expected=[]
 for name,pin in CACHE_PINS:
  path=CACHE_PRODUCER/'cache-manifests'/(name+'.json');raw=private_read(path,16*1024*1024);need(digest(raw)==pin,'R31_R2_EVIDENCE_CACHE_MANIFEST_CHANGED');manifest=strict_json(raw);cache=CACHE_PRODUCER/'caches'/name
  need(manifest.get('root')==str(cache) and manifest.get('kind')=='r29-independent-readonly-cache-closure','R31_R2_EVIDENCE_CACHE_SCOPE_CHANGED');file=next((e for e in manifest['entries'] if e['kind']=='file'),None);need(file is not None,'R31_R2_EVIDENCE_CACHE_SAMPLE_MISSING');fd=h.open_directory(str(cache))
  try:
   s=os.fstat(fd);need(s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o555 and identity(fd)==manifest['identity'],'R31_R2_EVIDENCE_CACHE_ROOT_CHANGED');sample=h.open_relative(fd,file['path'])
   try:
    fs=os.fstat(sample);need(stat.S_ISREG(fs.st_mode) and fs.st_uid==fs.st_gid==0 and fs.st_nlink==1 and not fs.st_mode&0o222 and fs.st_size==file['bytes'] and full_metadata(fs)==file['metadata'],'R31_R2_EVIDENCE_CACHE_SAMPLE_CHANGED');sha1,size=hash_sample(sample);need(sha1==file['sha256'] and size==file['bytes'],'R31_R2_EVIDENCE_CACHE_SAMPLE_CHANGED')
   finally:os.close(sample)
   expected.append({'root':'/'+name,'device':s.st_dev,'inode':s.st_ino,'path':file['path'],'sha256':file['sha256'],'bytes':file['bytes'],'mode':stat.S_IMODE(fs.st_mode)})
  finally:os.close(fd)
 file=qa['files']['targeted-pure.mjs'];expected.append({'root':'/qa-tools','device':qa['identity']['device'],'inode':qa['identity']['inode'],'path':'targeted-pure.mjs','sha256':file['sha256'],'bytes':file['bytes'],'mode':0o444});return expected
qa_before=read_qa();need(typed_equal(state.get('qaTools'),{k:qa_before[k] for k in ['identity','manifestSHA256','files']}),'R31_R2_EVIDENCE_PRODUCER_QA_UNBOUND');bootstrap_expected=probe_basis(qa_before)
stages=['mount-proof','offline-install','build','typecheck','truth-unit','targeted-pure'];checks=state.get('checks');need(isinstance(checks,list) and len(checks)<=6 and [c.get('id') for c in checks]==stages[:len(checks)] and state.get('noRecordedResultStages')==stages[len(checks):] and state.get('noRecordedResultExecutionState')=='unknown','R31_R2_EVIDENCE_RESULT_PREFIX_INVALID')
log_frames={};stage_results=[];unrecorded_logs=[];verified_bootstrap=None
for c in checks:
 need(c.get('status') in ['pass','fail'] and type(c.get('executed')) is bool and type(c.get('candidateCodeExecuted')) is bool and c['candidateCodeExecuted']==(c['executed'] and c['id']!='mount-proof') and re.fullmatch('[a-f0-9]{64}',c.get('containerID','')) and re.fullmatch('[a-f0-9]{64}',c.get('logSHA256','')) and type(c.get('logBytes')) is int and 0<=c['logBytes']<=50*1024*1024 and type(c.get('exitCode')) is int and type(c.get('timeout')) is bool and type(c.get('logLimitExceeded')) is bool and c.get('mountsAndSandboxFlagsActuallyVerified') is True and c.get('rawLogsExported') is False,'R31_R2_EVIDENCE_RESULT_FIELDS_INVALID')
 raw=private_read(attempt_root/(c['id']+'.log'),50*1024*1024);need(len(raw)==c['logBytes'] and digest(raw)==c['logSHA256'],'R31_R2_EVIDENCE_LOG_HASH_CHANGED');log_frames[c['id']]=[digest(raw),len(raw)];safe={k:c[k] for k in ['id','executed','candidateCodeExecuted','status','exitCode','timeout','logLimitExceeded','containerID','logSHA256','logBytes','rawLogsExported','tests','mountsAndSandboxFlagsActuallyVerified'] if k in c};safe['independentLogVerified']=True
 diagnostics=c.get('compilerDiagnosticCodes',[]);need(isinstance(diagnostics,list) and all(isinstance(e,dict) and set(e)=={'path','code'} and re.fullmatch(r'(?:apps|packages)/[A-Za-z0-9_./-]+\.(?:ts|tsx)',e['path']) and re.fullmatch('TS[0-9]{4}',e['code']) for e in diagnostics),'R31_R2_EVIDENCE_COMPILER_DIAGNOSTICS_INVALID');safe['compilerDiagnosticCodes']=diagnostics
 if c['id']=='mount-proof' and c['status']=='pass':
  bootstrap=strict_json(raw);wanted={'schemaVersion':1,'kind':'r31-normal-bind-bootstrap','uid':1000,'gid':1000,'caches':[{**e,'readOnlyMount':True,'mutationRejected':True,'bytesVerified':True} for e in bootstrap_expected],'workWritable':True,'candidateCodeExecuted':False};need(typed_equal(bootstrap,wanted) and typed_equal(bootstrap,state.get('normalBindBootstrap')),'R31_R2_EVIDENCE_BOOTSTRAP_CHANGED');verified_bootstrap=bootstrap
 if c['id'] in ['truth-unit','targeted-pure']:
  counts={};summary_complete=True
  for field in ['tests','pass','fail','cancelled','skipped','todo']:
   matches=re.findall(r'^# '+field+r' ([0-9]+)\s*$',raw.decode('utf8'),re.M)
   if len(matches)!=1:summary_complete=False
   else:counts[field]=int(matches[0])
  actual_counts=counts if summary_complete else None
  if c.get('tests') is not None:need(typed_equal(actual_counts,c['tests']),'R31_R2_EVIDENCE_TEST_COUNTS_INVALID')
  safe.update(tests=actual_counts,actualTAPCounts=actual_counts,testCountsComplete=summary_complete,expectedTests=16 if c['id']=='truth-unit' else 26)
  if c['status']=='pass':need(counts=={'tests':16 if c['id']=='truth-unit' else 26,'pass':16 if c['id']=='truth-unit' else 26,'fail':0,'cancelled':0,'skipped':0,'todo':0},'R31_R2_EVIDENCE_TEST_COUNTS_INVALID')
 if c['status']=='pass':need(c['executed'] is True and c['exitCode']==0 and c['timeout'] is False and c['logLimitExceeded'] is False,'R31_R2_EVIDENCE_PASS_WITHOUT_EXECUTION')
 stage_results.append(safe)
for stage in stages[len(checks):]:
 path=attempt_root/(stage+'.log')
 if os.path.lexists(path):
  raw=private_read(path,50*1024*1024);log_frames[stage]=[digest(raw),len(raw)];unrecorded_logs.append({'id':stage,'sha256':digest(raw),'bytes':len(raw)})
if len(checks)>1:need(checks[0]['status']=='pass','R31_R2_EVIDENCE_BOOTSTRAP_BYPASSED')
if len(checks)>2:need(checks[1]['status']=='pass','R31_R2_EVIDENCE_INSTALL_BYPASSED')
if state['status']=='pass':need(len(checks)==6 and all(c['status']=='pass' for c in checks),'R31_R2_EVIDENCE_TERMINAL_PASS_INVALID')
creation_stage=state.get('creationIntent',{}).get('stage');creation_name=state.get('creationIntent',{}).get('name');need((creation_stage is None and creation_name is None) or creation_stage in stages and creation_name=='jarvis-tg-r31-r2-'+p['attempt']+'-'+creation_stage,'R31_R2_EVIDENCE_CREATION_INTENT_CHANGED')
identity_unknown=creation_stage if creation_stage is not None and not any(c['id']==creation_stage for c in checks) else None;container_identity_complete=identity_unknown is None;OWNED_CONTAINER_IDS={c['containerID'] for c in checks}

`+p.slice(z);
 const related='related=sorted(descendants|cgroup|workspace|owner_group)';replace(related,"container_group={pid for pid,v in records.items() if any(any(part in OWNED_CONTAINER_IDS or part.startswith('docker-') and part.endswith('.scope') and part[7:-6] in OWNED_CONTAINER_IDS for part in x.split('/')) for x in v['cgroups'])};related=sorted(descendants|cgroup|workspace|owner_group|container_group)");
 replace("'ownerCgroupProcesses':sorted(owner_group)","'containerCgroupProcesses':sorted(container_group),'ownerCgroupProcesses':sorted(owner_group)");
 replace("p={**p,'workspace':str(work)}","p={**p,'workspace':str(attempt_root)}");
 replace("need(private_read(owner_path)==owner_raw", "qa_after=read_qa();need(qa_before==qa_after and probe_basis(qa_after)==bootstrap_expected and private_read(Path(p['sourceOrigin']))==origin_raw,'R31_R2_EVIDENCE_QA_OR_ORIGIN_CHANGED')\nfor stage,frame in log_frames.items():\n raw=private_read(attempt_root/(stage+'.log'),50*1024*1024);need([digest(raw),len(raw)]==frame,'R31_R2_EVIDENCE_LOG_CHANGED_AFTER_CENSUS')\nneed(private_read(owner_path)==owner_raw");
 replace("complete=not scan_before", "complete=container_identity_complete and not scan_before");
 replace("'stageResults':checks,'normalBindBootstrap':state.get('normalBindBootstrap'),'cacheCopies':state.get('cacheCopies')", "'stageResults':stage_results,'normalBindBootstrap':verified_bootstrap,'bootstrapExpected':bootstrap_expected,'qaTools':qa_after,'sourceOriginSHA256':digest(origin_raw),'sourcePreparationSHA256':p['sourcePreparationSHA256'],'logEvidenceDoubleRead':True,'unrecordedStageLogs':unrecorded_logs,'noRecordedResultStages':state['noRecordedResultStages'],'noRecordedResultExecutionState':'unknown','creationIntentStage':creation_stage,'executionIdentityUnknownStage':identity_unknown,'containerCgroupIdentityComplete':container_identity_complete");
 replace("'includesBuildOwnerCgroup':True", "'includesBuildOwnerCgroup':True,'includesOwnedContainerCgroups':True,'workspace':str(attempt_root)");return p;
}
function assertCensus(h,B){
 need(h?.attempt===B.attempt&&same(h.source,{sha256:B.fingerprint,metadataSHA:B.metadataSHA,files:625,bytes:B.sourceBytes,identity:B.sourceIdentity,stable:true})&&h.sourceBeforeAfterStable===true&&h.privateReceiptsStable===true&&h.installedToolSHA256===B.toolSHA&&['ownershipSHA256','launchSHA256','stateSHA256'].every(k=>H.test(h[k]??'')),'R31_R2_EVIDENCE_BINDING_CHANGED');
 need(h.work?.stable===true&&h.work.nofollow===true&&h.work.entries>=625&&Number.isSafeInteger(h.work.entries)&&H.test(h.work.metadataSHA256??'')&&Number.isSafeInteger(h.work.identity?.device)&&Number.isSafeInteger(h.work.identity.inode)&&h.work.identity.inode>0&&h.mutationsPerformed===false&&h.signalsSent===false&&h.resourcesRemoved===false&&h.rawLogsExported===false&&h.privateEnvironmentExported===false&&h.rawArgvExported===false,'R31_R2_EVIDENCE_READ_BOUNDARY_CHANGED');
 need(h.procScope?.fullProcScan===true&&h.procScope.includesAllDescendants===true&&h.procScope.includesUnitCgroupOrphans===true&&h.procScope.includesWorkspaceCwdExeArgvFD===true&&h.procScope.includesBuildOwnerCgroup===true&&h.procScope.includesOwnedContainerCgroups===true&&h.procScope.workspace===B.root+'/'+B.attempt&&h.procScope.twoScans===true&&h.procScope.persistentMainPIDExcluded===h.node?.pid&&h.scans?.length===2&&h.node.pid>1&&Number.isSafeInteger(h.node.pid)&&h.node.uid===1000&&h.node.active===true&&U.test(h.node.boot??'')&&/^[0-9]+$/.test(h.node.startTicks??'')&&Number.isSafeInteger(h.node.procDevice)&&Number.isSafeInteger(h.node.procInode)&&h.node.procInode>0&&h.node.cgroup==='/system.slice/jarvis-software-factory-development.service'&&['cwdSHA256','exeSHA256','argvSHA256'].every(k=>H.test(h.node[k]??'')),'R31_R2_EVIDENCE_NODE_INVALID');
 for(const s of h.scans){
  need(s.fullProcScan===true&&s.pidfdSupported===true&&same(s.node,h.node)&&same(s.ack,h.nodeACK)&&['allDescendants','unitCgroupOtherProcesses','workspaceRelatedProcesses','ownerCgroupProcesses','containerCgroupProcesses','relatedProcesses','listedPIDs','inspectedPIDs','readIncompletePIDs','exitedDuringScan'].every(k=>Array.isArray(s[k])),'R31_R2_EVIDENCE_CENSUS_INCOMPLETE');
  const exits=s.exitedDuringScan.map(x=>x.pid),ids=[...s.inspectedPIDs,...exits,...s.readIncompletePIDs];need(ids.every(x=>Number.isSafeInteger(x)&&x>0)&&new Set(ids).size===ids.length&&new Set(s.listedPIDs).size===s.listedPIDs.length&&same([...ids].sort((a,b)=>a-b),[...s.listedPIDs].sort((a,b)=>a-b))&&s.inspectedPIDs.includes(h.node.pid)&&s.processesScanned===ids.length&&same(s.counts,{listed:ids.length,inspected:s.inspectedPIDs.length,pidfdProvenExits:exits.length,incomplete:s.readIncompletePIDs.length}),'R31_R2_EVIDENCE_COUNTS_NOT_CLOSED');
  for(const e of s.exitedDuringScan){const k=e.kernelProof,v=e.processIdentity,i=e.listedProcIdentity;need(e.boot===h.node.boot&&Number.isSafeInteger(i?.device)&&i.device>=0&&Number.isSafeInteger(i.inode)&&i.inode>0&&k?.type==='pidfd-POLLIN'&&k.attached===true&&k.identityBound===true&&k.requestedPID===e.pid&&k.exitConfirmed===true&&k.procPathAbsent===true&&[1,17].includes(k.pollEvents)&&v?.pid===e.pid&&v.boot===e.boot&&v.procDevice===i.device&&v.procInode===i.inode&&(v.startTicks===undefined||/^[0-9]+$/.test(v.startTicks))&&(v.ppid===undefined||Number.isSafeInteger(v.ppid)&&v.ppid>=0),'R31_R2_EVIDENCE_PIDFD_PROOF_INVALID');}
 }
 need(h.workspaceSockets?.nofollow===true&&Array.isArray(h.workspaceSockets.filesystem)&&Array.isArray(h.workspaceSockets.procNetUnix)&&Object.keys(h.nodeACK?.counts??{}).sort().join(',')==='deliveries,logs,runs'&&Object.values(h.nodeACK.counts).every(x=>Number.isSafeInteger(x)&&x>=0),'R31_R2_EVIDENCE_ACK_OR_SOCKETS_INVALID');
 const processesComplete=h.containerCgroupIdentityComplete===true&&h.scans.every(s=>!s.readIncompletePIDs.length&&!s.relatedProcesses.length&&['allDescendants','unitCgroupOtherProcesses','workspaceRelatedProcesses','ownerCgroupProcesses','containerCgroupProcesses'].every(k=>!s[k].length))&&!h.workspaceSockets.filesystem.length&&!h.workspaceSockets.procNetUnix.length&&Object.values(h.nodeACK.counts).every(x=>x===0);need(h.nativeProcessAndSocketCleanupVerified===processesComplete,'R31_R2_EVIDENCE_PROCESS_FLAG_CHANGED');
 const d=h.docker;need(d?.readOnly===true&&d.containersNetworksVolumesQueried===true&&same(d.exactNames,names(B))&&Array.isArray(d.absentNames)&&Array.isArray(d.present)&&new Set(d.absentNames).size===d.absentNames.length&&d.absentNames.every(x=>names(B).includes(x))&&d.labelScopes?.length===2&&same(d.labelScopes.map(x=>x.filters),[['label=jarvis.truthgate.r31.r2.attempt='+B.attempt],['label=jarvis.truthgate.r31.r2.attempt='+B.attempt,'label=jarvis.truthgate.r31.r2.kind=build']])&&d.labelScopes.every(x=>['containers','networks','volumes'].every(k=>Array.isArray(x[k]))),'R31_R2_EVIDENCE_DOCKER_INCOMPLETE');
 const dockerComplete=d.absentNames.length===6&&!d.present.length&&d.labelScopes.every(x=>['containers','networks','volumes'].every(k=>!x[k].length));need(d.complete===dockerComplete,'R31_R2_EVIDENCE_DOCKER_FLAG_CHANGED');
 const unit='jarvis-tg-r31-r2-'+B.attempt+'-owner.service',cg='/system.slice/'+unit,o=h.owner;need(o?.readOnly===true&&same(o.identity,{pid:B.ownerPID,startTicks:B.ownerStartTicks,boot:B.ownerBoot})&&o.bootSame===true&&typeof o.pidAbsent==='boolean'&&o.unit?.Id===unit&&['loaded','not-found'].includes(o.unit.LoadState)&&['active','inactive','failed','activating','deactivating'].includes(o.unit.ActiveState)&&/^[0-9]+$/.test(o.unit.MainPID??'')&&['',cg].includes(o.unit.ControlGroup)&&o.cgroupPath===cg&&Array.isArray(o.cgroupPIDs)&&o.cgroupPIDs.every(x=>Number.isSafeInteger(x)&&x>0),'R31_R2_EVIDENCE_OWNER_INVALID');
 const ownerComplete=o.pidAbsent&&['inactive','failed'].includes(o.unit.ActiveState)&&o.unit.MainPID==='0'&&!o.cgroupPIDs.length;need(o.complete===ownerComplete,'R31_R2_EVIDENCE_OWNER_FLAG_CHANGED');return {buildResourcesIndependentlyClean:processesComplete&&dockerComplete&&ownerComplete,processesComplete,dockerComplete,ownerComplete,nodeACKIdle:Object.values(h.nodeACK.counts).every(x=>x===0)};
}
