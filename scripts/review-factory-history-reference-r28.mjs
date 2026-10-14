/** Narrow read-only Git metadata confirmation. No fetch, checkout, config writes or historical bodies. */
import {readFile,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {sha} from './run-factory-main-repair-r26.mjs';
export const readHistoryGitMetadataR28Program=String.raw`
import os,stat,json,subprocess,hashlib,re,signal
from pathlib import Path
from urllib.parse import urlsplit
def need(v,c):
 if not v:raise RuntimeError(c)
signal.signal(signal.SIGALRM,lambda a,b:(_ for _ in ()).throw(RuntimeError('R28_HISTORY_REVIEW_TIMEOUT')));signal.alarm(45)
repo=Path('/home/superopen/All-Projects/msf');gitdir=repo/'.git'
need(p['repo']==str(repo) and p['ref']=='e129d9c' and p['head']=='89e6af3ac64f707c3ba6fc09e9e09fe4a4174171','R28_HISTORY_REVIEW_FIXED_SCOPE_CHANGED')
def key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
for q in [repo,gitdir,*repo.parents]:
 s=q.lstat();need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode),'R28_HISTORY_REVIEW_REPOSITORY_PATH_INVALID')
before={str(q):key(q.lstat()) for q in [repo,gitdir,gitdir/'HEAD',gitdir/'config']}
need(stat.S_ISREG((gitdir/'HEAD').lstat().st_mode) and stat.S_ISREG((gitdir/'config').lstat().st_mode),'R28_HISTORY_REVIEW_GIT_FILES_INVALID')
env={'PATH':'/usr/bin:/bin','HOME':'/root','LC_ALL':'C','LANG':'C','GIT_OPTIONAL_LOCKS':'0','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null'}
base=['/usr/bin/git','-c','safe.directory='+str(repo),'-C',str(repo)]
def git(args):return subprocess.run(base+args,capture_output=True,text=True,timeout=8,env=env)
top=git(['rev-parse','--show-toplevel']);gd=git(['rev-parse','--absolute-git-dir']);need(top.returncode==0 and top.stdout.strip()==str(repo) and gd.returncode==0 and gd.stdout.strip()==str(gitdir),'R28_HISTORY_REVIEW_GIT_SCOPE_UNPROVEN')
head=git(['rev-parse','--verify','HEAD^{commit}']);need(head.returncode==0 and head.stdout.strip()==p['head'],'R28_HISTORY_REVIEW_HEAD_CHANGED')
ref=git(['rev-parse','--verify','e129d9c^{commit}']);present=ref.returncode==0
need((present and re.fullmatch('[a-f0-9]{40}',ref.stdout.strip())) or (ref.returncode==128 and ref.stdout.strip()=='' and ref.stderr.strip()=='fatal: Needed a single revision'),'R28_HISTORY_REVIEW_REFERENCE_UNPROVEN')
shallow=git(['rev-parse','--is-shallow-repository']);count=git(['rev-list','--count','HEAD']);need(shallow.returncode==0 and shallow.stdout.strip() in ['true','false'] and count.returncode==0 and re.fullmatch('[0-9]{1,9}',count.stdout.strip()),'R28_HISTORY_REVIEW_RECOVERY_METADATA_INVALID')
origin=git(['remote','get-url','origin']);fact={'present':origin.returncode==0,'rawURLExported':False,'fetchPerformed':False,'connectionTested':False}
if origin.returncode==0:
 value=origin.stdout.strip();need(0<len(value)<=4096 and not re.search('[\r\n\x00]',value),'R28_HISTORY_REVIEW_ORIGIN_INVALID')
 if '://' in value:
  u=urlsplit(value);transport=u.scheme if u.scheme in ['http','https','ssh','git','file'] else 'other';host=(u.hostname or '').lower();path=u.path
 else:
  m=re.fullmatch(r'(?:(?:[^/@:]+)@)?([^/:]+):(.+)',value);transport='ssh-scp' if m else 'local-or-other';host=m[1].lower() if m else '';path=m[2] if m else value
 fact.update({'transport':transport,'hostClass':host if host in ['github.com','gitlab.com','gitee.com','bitbucket.org'] else 'self-hosted-or-other' if host else 'local-or-other','pathSHA256':hashlib.sha256(path.encode()).hexdigest(),'hostSHA256':hashlib.sha256(host.encode()).hexdigest() if host else None,'rawCredentialExported':False})
else:need(origin.returncode==2 and origin.stdout.strip()=='' and origin.stderr.strip()=="error: No such remote 'origin'",'R28_HISTORY_REVIEW_ORIGIN_UNPROVEN')
after=git(['rev-parse','--verify','HEAD^{commit}']);need(after.returncode==0 and after.stdout.strip()==head.stdout.strip() and before=={str(q):key(q.lstat()) for q in [repo,gitdir,gitdir/'HEAD',gitdir/'config']},'R28_HISTORY_REVIEW_REPOSITORY_METADATA_CHANGED')
print(json.dumps({'repository':str(repo),'actualGitDirectoryConfirmed':True,'environmentGitOverridesExcluded':True,'currentHead':head.stdout.strip(),'requiredReference':'e129d9c','requiredCommitPresent':present,'resolvedCommit':ref.stdout.strip() if present else None,'failureCode':None if present else 'GIT_COMMIT_UNRESOLVED','shallow':shallow.stdout.strip()=='true','reachableHeadCommitCount':int(count.stdout.strip()),'origin':fact,'localRestoreFromRequiredCommitPossible':present,'remoteRecoveryAvailability':None,'headAndConfigMetadataUnchanged':True,'persistentGitConfigurationChanged':False,'fetchPerformed':False,'historicalBodiesRead':False,'modelsInvoked':False,'readOnly':True,'rawGitErrorExported':False}))
`;
export async function reviewHistoryGitR28(){
 const paths=['artifacts/software-factory/acceptance-r28/historical-failure-context-1791782110833-e8c36e7d-a81b-42c3-96cd-487ec3bb06d8.json','artifacts/software-factory/acceptance-r28/historical-failure-context-1791782189163-683afd1a-0867-4bb5-bad7-10dc040bcf37.json'];const reports=[];
 for(const path of paths){const raw=await readFile(path,'utf8');reports.push({path,sha256:sha(raw),report:JSON.parse(raw)});}
 const expected=reports[0].report.gitReference,latest=reports[1].report.gitReference;
 if(reports[0].sha256!=='438677c24014a860f79d6af242f716866ed4d48d0417030943da5f65834708d2'||expected.originalRepositoryConfirmed!==true||expected.failureCode!=='GIT_COMMIT_UNRESOLVED'||expected.currentHead!=='89e6af3ac64f707c3ba6fc09e9e09fe4a4174171')throw Error('R28_HISTORY_REVIEW_BASELINE_CHANGED');
 const observed=JSON.parse(remote(lanProfile,'jarvis-101',python({repo:'/home/superopen/All-Projects/msf',ref:'e129d9c',head:expected.currentHead},readHistoryGitMetadataR28Program),true,{timeoutMs:60000}));
 if(observed.currentHead!==latest.currentHead||observed.requiredCommitPresent!==latest.present||observed.shallow!==latest.recoverySource?.shallow||observed.reachableHeadCommitCount!==latest.recoverySource?.reachableHeadCommitCount||observed.origin.pathSHA256!==latest.recoverySource?.origin?.pathSHA256)throw Error('R28_HISTORY_REVIEW_INDEPENDENT_FACTS_DIFFER');
 return {schemaVersion:1,kind:'software-factory-r28-historical-reference-independent-read-only-review',at:new Date().toISOString(),reviewedReports:reports.map(({path,sha256})=>({path,sha256})),sourceSHA256:sha(await readFile('scripts/prepare-factory-history-context-r28.mjs')),observerSourceSHA256:sha(await readFile('scripts/review-factory-history-reference-r28.mjs')),staticReview:{exactSafeDirectoryCommandOnly:true,originalToplevelAndHeadValidated:true,neededSingleRevisionClosedClassification:true,oldGeneric128NotSufficient:true,syntaxFailedBeforeGitAssertion:true,originalMissingHTMLRemainsProductBlocker:true},observed,conclusion:observed.requiredCommitPresent?'Required Git commit now available; actual historical HTML restore still requires verified original bodies.':'Required commit unresolved in this exact nonshallow repository; origin exists but recovery untested. This does not prove absent in all backups or remotes.',restorationPerformed:false,productAccepted:false,readOnly:true,rawLogsExported:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const r=await reviewHistoryGitR28(),out='artifacts/software-factory/acceptance-r28/history-reference-independent-review-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(r,null,2)+'\n',f=await open(out,'wx',0o644);try{await f.writeFile(raw);await f.sync();}finally{await f.close();}console.log(JSON.stringify({output:out,sha256:sha(raw),observed:r.observed}));}catch(e){const m=String(e?.message??'');console.log(JSON.stringify({failed:true,errorCode:/^R28_HISTORY_REVIEW_[A-Z0-9_]+$/.test(m)?m:'R28_HISTORY_REVIEW_READ_FAILED',rawErrorExported:false,fetchPerformed:false}));process.exitCode=1;}}
