/** Read only the two actual R28 historical-fixture failures; never export raw logs. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {defaultReadRoot} from './install-factory-repair-verifier-r26.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const input='artifacts/software-factory/acceptance-r28/full-readback-1791781133917-ca266c57-2f68-4196-b958-8788e2c55d61.json';
const fixed={runId:'08ce8722e39ea5750857342cdaadc939ebb26d66',attempt:'bf82730b912848e289b63cffe358c9c4',workspace:'/home/superopen/All-Projects/msf-repair-r27/source',candidateFingerprint:'9b07a5115c22d14f82e04ba45b66efbc5ac04f7faa696ab84d81e33696ec7b76',candidateFiles:608};
const need=(v,c)=>{if(!v)throw Error(c);};
export const historicalFailureReadProgramR28=String.raw`import os,stat,json,hashlib,re,subprocess,sys,datetime
from pathlib import Path
from types import ModuleType
from urllib.parse import urlsplit,unquote
sys.dont_write_bytecode=True
def need(v,c):
 if not v:raise RuntimeError(c)
need(p['runId']=='08ce8722e39ea5750857342cdaadc939ebb26d66' and p['attempt']=='bf82730b912848e289b63cffe358c9c4' and p['workspace']=='/home/superopen/All-Projects/msf-repair-r27/source' and p['candidateFingerprint']=='9b07a5115c22d14f82e04ba45b66efbc5ac04f7faa696ab84d81e33696ec7b76' and p['candidateFiles']==608,'R28_HISTORY_FIXED_SCOPE_CHANGED')
def trusted(q):
 q=Path(q)
 for v in [q,*q.parents]:
  s=v.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R28_HISTORY_ROOT_CHAIN_INVALID')
 return q
def private_read(q,limit=16777216):
 q=trusted(q);fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and 0<=s.st_size<=limit,'R28_HISTORY_FILE_INVALID');data=b''
  while len(data)<=limit:
   c=os.read(fd,min(65536,limit+1-len(data)))
   if not c:break
   data+=c
  a=os.fstat(fd);z=q.lstat();keys=['st_dev','st_ino','st_uid','st_gid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns']
  need(len(data)==s.st_size and all(getattr(s,k)==getattr(a,k)==getattr(z,k) for k in keys),'R28_HISTORY_FILE_CHANGED');return data
 finally:os.close(fd)
helper_path=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py');helper_raw=private_read(helper_path)
need(hashlib.sha256(helper_raw).hexdigest()=='57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2','R28_HISTORY_HELPER_CHANGED')
h=ModuleType('read_only_history_fingerprint');exec(compile(helper_raw,str(helper_path),'exec'),h.__dict__)
root=Path(p['workspace']);before=h.fingerprint(str(root));need(before['sha256']==p['candidateFingerprint'] and before['files']==608,'R28_HISTORY_SOURCE_CHANGED')
attempt=Path('/var/lib/jarvis-development/101/main-acceptance-r28')/p['runId']/p['attempt'];detail_raw=private_read(attempt/'detailed-report.json')
need(hashlib.sha256(detail_raw).hexdigest()==p['detailSHA256'],'R28_HISTORY_REPORT_CHANGED')
detail=json.loads(detail_raw);report=detail['report'];need(report['runId']==p['runId'] and report['sourceFingerprint']==p['candidateFingerprint'] and report['sourceStable'] is True and report['status']=='fail' and detail['modelsInvoked'] is False and detail['productionDatabaseUsed'] is False and detail['privateEnvCopied'] is False,'R28_HISTORY_REPORT_SCOPE_INVALID')
need([c['id'] for c in report['checks'] if c['status']=='fail']==['prototype-syntax','prototype-design-boundary'],'R28_HISTORY_FAILURE_SET_CHANGED')
ev=attempt/'evidence';build_raw=private_read(ev/'collector-build.json');need(hashlib.sha256(build_raw).hexdigest()==p['buildSHA256'],'R28_HISTORY_BUILD_REPORT_CHANGED')
build=json.loads(build_raw);need(build['runId']==p['runId'] and build['sourceFingerprint']==p['candidateFingerprint'],'R28_HISTORY_BUILD_BINDING_CHANGED')
sources={};allowed={x['path']:x for x in before['manifest']};rootfd=h.open_directory(str(root))
try:
 for path in ['doc/tests/syntax.cjs','doc/tests/design-boundary.cjs']:
  need(path in allowed,'R28_HISTORY_PUBLIC_SOURCE_MISSING');fd=h.open_relative(rootfd,path)
  try:
   body=h.read_fd(fd,4194304);need(hashlib.sha256(body).hexdigest()==allowed[path]['sha256'],'R28_HISTORY_PUBLIC_SOURCE_CHANGED');sources[path]={'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body),'text':body.decode('utf8')}
  finally:os.close(fd)
finally:os.close(rootfd)
versions=['V1.1初始版','V1.2','V1.3','V1.4','V1.5','V1.6','V1.7','V1.8','V1.9'];paths=[x+'/msf-prototype.html' for x in versions]
presence=[]
for rel in paths:
 q=root
 for part in Path(rel).parts:
  q=q/part
  if os.path.lexists(q):need(not q.is_symlink(),'R28_HISTORY_PUBLIC_PATH_SYMLINK')
 exists=os.path.lexists(q);presence.append({'publicSourcePath':rel,'present':exists,'inPublicManifest':rel in allowed})
need(all(not x['present'] and not x['inPublicManifest'] for x in presence),'R28_HISTORY_HISTORICAL_FIXTURE_STATE_CHANGED')
evidence=[{'privateRunRelativePath':'detailed-report.json','sha256':hashlib.sha256(detail_raw).hexdigest(),'bytes':len(detail_raw)},{'privateRunRelativePath':'evidence/collector-build.json','sha256':hashlib.sha256(build_raw).hexdigest(),'bytes':len(build_raw)}];failures=[];log_bodies={}
for suite in ['syntax','design-boundary']:
 c=next(x for x in build['checks'] if x['id']=='prototype-'+suite);need(c['executed'] is True and c['status']=='fail' and c['exitCode']==1 and c.get('timedOut') is not True,'R28_HISTORY_REAL_FAILURE_REQUIRED')
 name='prototype-'+suite+'.log';body=private_read(ev/name);log_bodies[name]=body;evidence.append({'privateRunRelativePath':'evidence/'+name,'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body),'rawContentExported':False});log=body.decode('utf8',errors='replace')
 missing=[rel for rel in paths if rel in log and ('ENOENT' in log or 'ERR_FILE_NOT_FOUND' in log)]
 row={'checkId':c['id'],'executed':True,'exitCode':1,'timedOut':False,'timeoutLimitMs':120000,'errorCodesMentioned':[v for v in ['ENOENT','ENOTDIR','ERR_FILE_NOT_FOUND','AssertionError','ERR_ASSERTION'] if v in log],'historicalPathsMentioned':missing,'rawLogExported':False}
 if suite=='syntax':
  need('ENOENT' in log and 'V1.1初始版/msf-prototype.html' in log,'R28_HISTORY_SYNTAX_FIRST_FAILURE_UNPROVEN');row['provenFirstMissingPath']='V1.1初始版/msf-prototype.html';row['gitAssertionReachedInThisRun']=False
 else:
  labels=re.findall(r"test\('([^'\n]{3,150})'",sources['doc/tests/design-boundary.cjs']['text']);structured=None
  for line in reversed(log.splitlines()):
   try:v=json.loads(line)
   except Exception:continue
   if isinstance(v,dict) and isinstance(v.get('checks'),list):structured=v;break
  need(structured is not None and all(isinstance(x,dict) and isinstance(x.get('name'),str) and type(x.get('ok')) is bool for x in structured['checks']),'R28_HISTORY_BOUNDARY_STRUCTURED_REPORT_MISSING');bad=[]
  for x in structured['checks']:
   if x['ok']:continue
   name=x['name'];need(name in labels,'R28_HISTORY_BOUNDARY_PUBLIC_CASE_UNKNOWN');err=str(x.get('error',''))
   need(name=='API示例澄清新增版本并保留旧版原文' and 'ERR_FILE_NOT_FOUND' in err and 'V1.8/msf-prototype.html' in err,'R28_HISTORY_BOUNDARY_CAUSE_UNPROVEN')
   bad.append({'publicCaseTitle':name,'errorCode':'ERR_FILE_NOT_FOUND','missingPublicSourcePath':'V1.8/msf-prototype.html','failedPhase':'load-original-v1.8-before-version-comparison','versionPreservationAssertionReached':False,'rawErrorExported':False,'errorSHA256':hashlib.sha256(err.encode()).hexdigest()})
  need(len(bad)==1,'R28_HISTORY_BOUNDARY_FAILURE_SET_CHANGED');row['structuredChecks']={'total':len(structured['checks']),'passed':sum(x['ok'] for x in structured['checks']),'failed':len(bad),'failedCases':bad}
 failures.append(row)
syntax=sources['doc/tests/syntax.cjs']['text'];need("'e129d9c:'+rel" in syntax,'R28_HISTORY_GIT_REFERENCE_CHANGED')
# Query only the explicitly named commit in the original repository. No git log/config/private tree contents are exported.
original=Path('/home/superopen/All-Projects/msf');need(original.is_dir() and not original.is_symlink() and (original/'.git').is_dir() and not (original/'.git').is_symlink(),'R28_HISTORY_ORIGINAL_GIT_UNAVAILABLE')
git_base=['/usr/bin/git','-c','safe.directory='+str(original),'-C',str(original)];git_env={**os.environ,'GIT_OPTIONAL_LOCKS':'0','LC_ALL':'C','LANG':'C'}
def git_read(args):return subprocess.run(git_base+args,capture_output=True,text=True,timeout=15,env=git_env)
top=git_read(['rev-parse','--show-toplevel']);need(top.returncode==0 and top.stdout.strip()==str(original),'R28_HISTORY_ORIGINAL_GIT_SCOPE_INVALID')
head=git_read(['rev-parse','--verify','HEAD^{commit}']);need(head.returncode==0 and re.fullmatch('[a-f0-9]{40}',head.stdout.strip()),'R28_HISTORY_ORIGINAL_GIT_HEAD_INVALID')
git=git_read(['rev-parse','--verify','e129d9c^{commit}']);resolved=git.stdout.strip() if git.returncode==0 else None
need((git.returncode==0 and re.fullmatch('[a-f0-9]{40}',resolved)) or (git.returncode==128 and git.stdout.strip()=='' and git.stderr.strip()=='fatal: Needed a single revision'),'R28_HISTORY_GIT_REFERENCE_UNPROVEN')
git_observation={'reference':'e129d9c','objectType':'commit','originalPublicRepository':'/home/superopen/All-Projects/msf','originalRepositoryConfirmed':True,'currentHead':head.stdout.strip(),'resolved':resolved,'present':git.returncode==0,'returnCode':git.returncode,'failureCode':None if git.returncode==0 else 'GIT_COMMIT_UNRESOLVED','exactSafeDirectoryCommandOnly':True,'persistentGitConfigChanged':False,'candidateHasGitDirectory':os.path.lexists(root/'.git'),'actualSyntaxStoppedBeforeGitAssertion':True,'rawGitOutputExported':False}
shallow=git_read(['rev-parse','--is-shallow-repository']);need(shallow.returncode==0 and shallow.stdout.strip() in ['true','false'],'R28_HISTORY_SHALLOW_READ_INVALID')
count=git_read(['rev-list','--count','HEAD']);need(count.returncode==0 and re.fullmatch('[0-9]{1,9}',count.stdout.strip()),'R28_HISTORY_COMMIT_COUNT_INVALID')
origin=git_read(['remote','get-url','origin']);origin_fact={'present':False,'connectionTested':False,'fetchPerformed':False,'rawURLExported':False}
def classify_origin(value):
 if re.match(r'^[A-Za-z]:[\\/]',value):return {'transport':'windows-drive','hostname':None,'path':value,'local':False,'userInfoPresent':False,'queryPresent':False}
 if value.startswith('\\\\'):return {'transport':'windows-unc','hostname':None,'path':value,'local':False,'userInfoPresent':False,'queryPresent':False}
 if '://' in value:
  u=urlsplit(value);scheme=u.scheme.lower();host=(u.hostname or '').lower();local=scheme=='file' and host in ['', 'localhost']
  return {'transport':'file-url' if scheme=='file' else scheme if scheme in ['https','http','ssh','git'] else 'other-url','hostname':host or None,'path':unquote(u.path) if local else u.path,'local':local,'userInfoPresent':bool(u.username or u.password),'queryPresent':bool(u.query)}
 m=re.fullmatch(r'(?:(?P<user>[^/@:\s]+)@)?(?P<host>\[[^\]\s]+\]|[^/:\s]+):(?P<path>[^\r\n]+)',value)
 if m:return {'transport':'ssh-scp','hostname':m['host'].strip('[]').lower(),'path':m['path'],'local':False,'userInfoPresent':bool(m['user']),'queryPresent':False}
 return {'transport':'posix-absolute' if value.startswith('/') else 'local-relative','hostname':None,'path':value,'local':True,'userInfoPresent':False,'queryPresent':False}
if origin.returncode==0:
 value=origin.stdout.strip();need(0<len(value)<=4096 and not re.search('[\\r\\n\\x00]',value),'R28_HISTORY_ORIGIN_READ_INVALID')
 classified=classify_origin(value);host=classified['hostname'];need(host is None or re.fullmatch('[a-z0-9.:-]{1,253}',host),'R28_HISTORY_ORIGIN_HOST_INVALID')
 origin_fact.update({'present':True,'transport':classified['transport'],'hostname':host,'hostSHA256':hashlib.sha256(host.encode()).hexdigest() if host else None,'pathSHA256':hashlib.sha256(classified['path'].encode()).hexdigest(),'userInfoPresent':classified['userInfoPresent'],'queryStripped':True,'queryPresent':classified['queryPresent'],'networkAvailability':'not-tested'})
 local_target={'inspectableOn101':classified['local'],'exists':None,'directory':None,'symlinkRejected':False,'gitRepositoryConfirmed':False,'requiredReferencePresent':None,'rawPathExported':False}
 if classified['local']:
  need(not re.search('[\\r\\n\\x00]',classified['path']),'R28_HISTORY_LOCAL_ORIGIN_INVALID');q=Path(classified['path']);q=q if q.is_absolute() else original/q;q=Path(os.path.abspath(q));present=os.path.lexists(q)
  symlink=any(v.is_symlink() for v in [q,*q.parents] if os.path.lexists(v));local_target.update({'exists':present,'directory':q.is_dir() if present and not symlink else False,'symlinkRejected':symlink})
  if present and q.is_dir() and not symlink:
   base=['/usr/bin/git','-c','safe.directory='+str(q),'-C',str(q)]
   def origin_git(args):return subprocess.run(base+args,capture_output=True,text=True,timeout=15,env=git_env)
   bare=origin_git(['rev-parse','--is-bare-repository']);repo=False
   if bare.returncode==0 and bare.stdout.strip() in ['true','false']:
    location=origin_git(['rev-parse','--absolute-git-dir'] if bare.stdout.strip()=='true' else ['rev-parse','--show-toplevel']);repo=location.returncode==0 and location.stdout.strip()==str(q)
   local_target['gitRepositoryConfirmed']=repo
   if repo:
    origin_head=origin_git(['rev-parse','--verify','HEAD^{commit}']);local_target['headConfirmed']=origin_head.returncode==0 and re.fullmatch('[a-f0-9]{40}',origin_head.stdout.strip()) is not None
    origin_ref=origin_git(['rev-parse','--verify','e129d9c^{commit}']);resolved_origin=origin_ref.stdout.strip() if origin_ref.returncode==0 else None
    need((origin_ref.returncode==0 and re.fullmatch('[a-f0-9]{40}',resolved_origin)) or (origin_ref.returncode==128 and origin_ref.stdout.strip()=='' and origin_ref.stderr.strip()=='fatal: Needed a single revision'),'R28_HISTORY_LOCAL_ORIGIN_REFERENCE_UNPROVEN')
    local_target.update({'requiredReferencePresent':origin_ref.returncode==0,'requiredReferenceResolved':resolved_origin})
    if resolved_origin:
     original_files=[]
     for rel in paths:
      obj=origin_git(['rev-parse','--verify',resolved_origin+':'+rel]);kind=origin_git(['cat-file','-t',resolved_origin+':'+rel]) if obj.returncode==0 else None
      exists=obj.returncode==0 and re.fullmatch('[a-f0-9]{40}',obj.stdout.strip()) is not None and kind is not None and kind.returncode==0 and kind.stdout.strip()=='blob';original_files.append({'publicSourcePath':rel,'presentInReference':exists,'blobObject':obj.stdout.strip() if exists else None})
     local_target['historicalFilesInRequiredReference']=original_files
 origin_fact['localTarget']=local_target
else:need(origin.returncode==2 and origin.stdout.strip()=='' and origin.stderr.strip()=="error: No such remote 'origin'",'R28_HISTORY_ORIGIN_READ_UNPROVEN')
git_observation['recoverySource']={'shallow':shallow.stdout.strip()=='true','reachableHeadCommitCount':int(count.stdout.strip()),'origin':origin_fact,'originalReferenceResolvedLocally':git.returncode==0,'localRestorePossibleFromRequiredReference':git.returncode==0,'remoteRestorePossible':None,'historicalContentAuthenticityMustBeVerified':True}
head_after=git_read(['rev-parse','--verify','HEAD^{commit}']);need(head_after.returncode==0 and head_after.stdout.strip()==head.stdout.strip(),'R28_HISTORY_ORIGINAL_GIT_CHANGED')
after=h.fingerprint(str(root));need(before==after and private_read(attempt/'detailed-report.json')==detail_raw and private_read(ev/'collector-build.json')==build_raw and all(private_read(ev/name)==body for name,body in log_bodies.items()),'R28_HISTORY_READ_CHANGED')
print(json.dumps({'schemaVersion':1,'kind':'software-factory-r28-historical-failure-observation','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runId':p['runId'],'attempt':p['attempt'],'candidateFingerprint':before['sha256'],'candidateFiles':before['files'],'sourceUnchanged':True,'privateEvidence':evidence,'publicSources':[{'path':k,'sha256':v['sha256'],'bytes':v['bytes']} for k,v in sources.items()],'historicalFilePresence':presence,'gitReference':git_observation,'failures':failures,'allNinePathsRequiredBySyntaxSource':all(x in syntax or x.split('/')[0] in syntax for x in paths),'originalsRestored':False,'assertionsChanged':False,'rawLogsExported':False,'privateApplicationConfigurationRead':False,'gitOriginSettingRead':True,'rawGitConfigurationExported':False,'modelsInvoked':False,'productAccepted':False,'readOnly':True,'resourcesRemoved':False,'signalsSent':False},ensure_ascii=False))
`;
export async function prepareHistoricalContextR28({readRoot=defaultReadRoot}={}){
 const raw=await readFile(input),r=JSON.parse(raw);need(r.runId===fixed.runId&&r.terminalReportBinding?.attempt===fixed.attempt&&r.terminalReportBinding?.bound===true&&r.terminal?.signedReceiptIngested===true&&r.terminal?.nonlate===true&&r.signedReport?.sourceStable===true&&r.signedReport?.checks?.total===50&&r.signedReport?.checks?.failed===2,'R28_HISTORY_SIGNED_TERMINAL_REQUIRED');
 const build=r.partialEvidence[0].collectors.find(c=>c.file==='collector-build.json');need(build&&build.checks.filter(c=>c.status==='fail').map(c=>c.id).join(',')==='prototype-syntax,prototype-design-boundary','R28_HISTORY_TWO_FAILURES_REQUIRED');
 const observed=await readRoot({...fixed,detailSHA256:r.terminalReportBinding.privateEnvelopeSHA256,buildSHA256:build.sha256},historicalFailureReadProgramR28);
 need(observed?.readOnly===true&&observed.runId===fixed.runId&&observed.attempt===fixed.attempt&&observed.sourceUnchanged===true,'R28_HISTORY_OBSERVATION_INVALID');
 const report={...observed,corrects:{path:'artifacts/software-factory/acceptance-r28/historical-failure-context-1791781292405-5da76fc7-5b30-483c-9c98-0fb9841d6a00.json',sha256:'77924c4947780e18b68822c7f618ae785e855ffd367b0b2d6266e26c78a4bf3c',field:'gitReference.present',reason:'A generic128 return alone does not distinguish missing objects from repository trust failure. This read verifies exact repository and real HEAD first, uses command-only exact safe.directory and exports only an allowlisted unresolved-commit result.'},terminalReadback:{path:input,sha256:sha(raw),signedProtocolSHA256:r.terminalReportBinding.signedProtocolSHA256,canonicalReportSHA256:r.terminalReportBinding.canonicalReportSHA256},recoveryContract:{requiredOriginalHTML:observed.historicalFilePresence.map(v=>v.publicSourcePath),requiredReference:'e129d9c (original commit object, not an invented replacement)',requiredImmutableComparisons:8,allowSyntheticReplacement:false,allowDeleteOrSkipAssertions:false,actualRestoreNotPerformed:true,afterRestore:'Create a newly fingerprinted independent candidate and verify original syntax and design-boundary suites. This report does not authorize another dispatch.'},remainingBoundary:'This batch is not independent acceptance of all74 objectives or delivery from zero.'};
 const stem='artifacts/software-factory/acceptance-r28/historical-failure-context-'+Date.now()+'-'+randomUUID(),json=JSON.stringify(report,null,2)+'\n';await writeFile(stem+'.json',json,{flag:'wx'});
 const boundary=observed.failures.find(v=>v.checkId==='prototype-design-boundary'),markdown=['# R28 剩余两项失败：真实历史原件缺失','',`本次运行：${fixed.runId}；attempt：${fixed.attempt}。`,`完整终态：50检查48通过2失败；332测试全部通过；原30原型28通过2失败。`,'','## 逐项实际证据','','- syntax：本次在读取 V1.1初始版/msf-prototype.html 时出现 ENOENT，尚未执行后续 Git 不可变性比较。',`- design-boundary：实际失败用例「API示例澄清新增版本并保留旧版原文」，加载 V1.8/msf-prototype.html 时出现 ERR_FILE_NOT_FOUND，尚未执行新旧版本内容对比；其余 ${boundary.structuredChecks.passed}/${boundary.structuredChecks.total} 个用例通过。`,'','## 需要补回的真实原件','',...observed.historicalFilePresence.map(v=>`- ${v.publicSourcePath}：本候选实际文件与公开清单均不存在。`),'',`syntax 指定 e129d9c 原始 commit，实际原软件工厂 Git 仓库解析：${observed.gitReference.present?'存在':'不存在'}。本次 syntax 没有运行到该检查，这是一项单独核对的恢复前置条件。`,'','需要恢复原始备份或设计仓库中的九个 HTML，以及可验证其 V1.1–V1.8 原文的原 Git 对象；不可编造历史版本、重新定义验收基线、删断言或跳过检查。尚未恢复原件、修改源码或派发下一轮。','',`完整终态读回：${input}；SHA-256 ${sha(raw)}。`,`本诊断JSON：${stem}.json；SHA-256 ${sha(json)}。`,'','JSON保存本attempt原始证据与公开测试源码的SHA、实际缺件存在性、精确失败阶段；原日志、任意错误文本、私人配置均未导出。本批通过不等于74目标或从零交付已完成。',''].join('\n');await writeFile(stem+'.md',markdown,{flag:'wx'});
 return {jsonPath:stem+'.json',jsonSHA256:sha(json),mdPath:stem+'.md',mdSHA256:sha(markdown),observed,readOnly:true,rawLogsExported:false,modelsInvoked:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await prepareHistoricalContextR28()));}catch(e){process.exitCode=1;const m=String(e?.message??'');console.log(JSON.stringify({kind:'software-factory-r28-historical-failure-diagnostic-error',errorCode:/^R28_HISTORY_[A-Z0-9_]+$/.test(m)?m:'R28_HISTORY_READ_FAILED',errorSHA256:sha(m),rawErrorExported:false,readOnly:true,modelsInvoked:false,resourcesRemoved:false,signalsSent:false}));}}
