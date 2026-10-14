/** Read-only identity comparison; no model, validation/test run, config or source writes. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { remote, lanProfile, python } from './managed-server-client.mjs';
const directory = 'artifacts/software-factory/acceptance-r24';
const options = Object.fromEntries(process.argv.slice(2).map(value => {
  const match = /^--(baseline-key|identity-key|installation-report)=(.+)$/.exec(value);
  if (!match) throw Error('MAIN_IDENTITY_OPTION_INVALID');
  return [match[1], match[2]];
}));
for (const field of ['baseline-key', 'identity-key']) {
  if (options[field] && !/^[a-z][a-z0-9-]{0,63}$/.test(options[field])) throw Error('MAIN_IDENTITY_KEY_INVALID');
}
const installationFile = options['installation-report'] ?? 'validator-copy-permissions-installed-851d171f-55b4-4ca1-936e-aea9644211e7.json';
if (!/^[a-z0-9-]+\.json$/.test(installationFile)) throw Error('MAIN_IDENTITY_INSTALLATION_PATH_INVALID');
const baselineFile = 'main-baseline-independent-review' + (options['baseline-key'] ? '-' + options['baseline-key'] : '') + '.json';
const oldBytes = await readFile(directory + '/' + baselineFile);
const prior = JSON.parse(oldBytes);
const installation = JSON.parse(await readFile(directory + '/' + installationFile, 'utf8'));
const source = '/home/superopen/All-Projects/msf';
if (!/^[a-f0-9]{40}$/.test(prior.runId) || prior.report.runId !== prior.runId || prior.report.source !== source || !/^attempt-[a-f0-9]{32}$/.test(prior.report.attemptId) || !/^[a-f0-9]{64}$/.test(prior.copySHA256) || !/^[a-f0-9]{64}$/.test(prior.sourceFingerprint)) throw Error('MAIN_IDENTITY_PRIOR_BINDING_INVALID');
const response = JSON.parse(remote(lanProfile, 'jarvis-101', python({ source, runId: prior.runId, attempt: prior.report.attemptId,
 expectedCopySHA256: prior.copySHA256, expectedNarrowFingerprint: prior.sourceFingerprint }, String.raw`
import datetime,hashlib,importlib.util,importlib.machinery,json,os,re,stat,subprocess,sys
sys.dont_write_bytecode=True
from pathlib import Path
def need(value,code):
 if not value:raise RuntimeError(code)
def digest(body):return hashlib.sha256(body).hexdigest()
def trusted(path):
 for item in [path,*path.parents]:
  value=item.lstat();need(not stat.S_ISLNK(value.st_mode) and value.st_uid==0 and not value.st_mode&0o022,'MAIN_IDENTITY_TOOL_UNTRUSTED')
 need(stat.S_ISREG(path.lstat().st_mode) and path.lstat().st_nlink==1,'MAIN_IDENTITY_TOOL_NOT_REGULAR')
def module(path,name):
 trusted(path);loader=importlib.machinery.SourceFileLoader(name,str(path));spec=importlib.util.spec_from_loader(name,loader);value=importlib.util.module_from_spec(spec);loader.exec_module(value);return value
helper_path=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py')
wrapper_path=Path('/usr/local/libexec/jarvis-msf-validation')
helper=module(helper_path,'identity_strict_helper')
wrapper=module(wrapper_path,'identity_narrow_wrapper')
need(wrapper.SOURCE==p['source'],'MAIN_IDENTITY_SOURCE_MISMATCH')
copy_path=Path('/var/lib/jarvis-development/101/validation')/p['runId']/p['attempt']/'copy.json'
info=copy_path.lstat();need(stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode) and info.st_nlink==1 and info.st_uid==1000 and info.st_size<=2000000,'MAIN_IDENTITY_HISTORICAL_COPY_UNSAFE')
copy_raw=copy_path.read_bytes();need(digest(copy_raw)==p['expectedCopySHA256'],'MAIN_IDENTITY_HISTORICAL_COPY_CHANGED')
copy=json.loads(copy_raw);need(copy['source']==p['source'] and copy['sha256']==p['expectedNarrowFingerprint'] and copy['verificationSha256']==p['expectedNarrowFingerprint'],'MAIN_IDENTITY_HISTORICAL_COPY_BINDING_CHANGED')
def hash_manifest(items):return digest(''.join(row['path']+'\0'+row['sha256']+'\n' for row in items).encode())
historical=copy['manifest'];need(len(historical)==copy['files'] and hash_manifest(historical)==copy['sha256'],'MAIN_IDENTITY_HISTORICAL_MANIFEST_MISMATCH')
def narrow():
 fd=wrapper.open_source()
 try:
  before=wrapper.raw_git_metadata(fd);counts=[0,0];h=hashlib.sha256();manifest=[]
  wrapper.secure_copy(fd,None,counts,h,manifest=manifest)
  after=wrapper.raw_git_metadata(fd)
 finally:os.close(fd)
 return {'sha256':h.hexdigest(),'files':counts[0],'bytes':counts[1],'manifest':manifest,'gitBefore':before,'gitAfter':after}
first=narrow();strict_first=helper.fingerprint(p['source'])
git=subprocess.run(['/usr/bin/git','--no-optional-locks','-c','core.fsmonitor=false','-c','core.untrackedCache=false','-c','safe.directory='+p['source'],'-C',p['source'],'status','--porcelain=v1','-z','--untracked-files=all'],capture_output=True,timeout=30,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','GIT_OPTIONAL_LOCKS':'0'})
need(git.returncode==0 and len(git.stdout)<=2000000,'MAIN_IDENTITY_GIT_STATUS_FAILED')
parts=git.stdout.decode('utf-8').split('\0');tracked=untracked=private_count=0;i=0
while i<len(parts):
 item=parts[i];i+=1
 if not item:continue
 code=item[:2];name=item[3:]
 if code=='??':untracked+=1
 else:tracked+=1
 if any(helper.private_name(part) or part in ('.secrets','.claude','.codex','.cc-switch') for part in Path(name).parts):private_count+=1
 if 'R' in code or 'C' in code:i+=1
strict_second=helper.fingerprint(p['source']);second=narrow()
old={v['path']:v for v in historical};current={v['path']:v for v in second['manifest']};strict={v['path']:v for v in strict_second['manifest']}
def different(left,right):
 return {'added':[right[k] for k in sorted(right.keys()-left.keys())],
         'removed':[left[k] for k in sorted(left.keys()-right.keys())],
         'changed':[{'path':k,'beforeSHA256':left[k]['sha256'],'afterSHA256':right[k]['sha256'],'beforeBytes':left[k]['bytes'],'afterBytes':right[k]['bytes']} for k in sorted(left.keys()&right.keys()) if left[k]['sha256']!=right[k]['sha256'] or left[k]['bytes']!=right[k]['bytes']]}
history_delta=different(old,current);scope_delta=different(current,strict)
def public(row):
 name=row['path'];return len(name)<=1000 and not re.search(r'[\x00-\x1f\x7f]',name) and not any(helper.private_name(part) or part in ('.secrets','.claude','.codex','.cc-switch') for part in Path(name).parts)
def category(name):
 parts=Path(name).parts
 if 'artifacts' in parts or 'reports' in parts or 'coverage' in parts:return 'generated-artifact-or-report'
 if any(part in ('test','tests','__tests__') for part in parts) or re.search(r'(^|[./_-])(test|spec|selftest)([./_-]|$)',name):return 'public-test-code'
 if 'src' in parts or name.endswith(('.ts','.tsx','.js','.mjs','.cjs','.py')):return 'public-code'
 if name.endswith(('.md','.html','.txt')):return 'public-document'
 if name.endswith(('.json','.yaml','.yml','.toml','.lock')) or Path(name).name in ('Dockerfile','Makefile'):return 'public-configuration'
 return 'other-public-file'
def safe_delta(value):
 result={}
 for kind,rows in value.items():
  good=[dict(row,category=category(row['path'])) for row in rows if public(row)];categories={}
  for row in good:categories[row['category']]=categories.get(row['category'],0)+1
  result[kind]={'total':len(rows),'privateMetadataOmitted':len(rows)-len(good),'categories':categories,'items':good[:100],'truncated':len(good)>100}
 return result
stable=first['sha256']==second['sha256'] and strict_first['sha256']==strict_second['sha256'] and first['gitBefore']==first['gitAfter']==second['gitBefore']==second['gitAfter']
all_same=all(not rows for rows in history_delta.values())
scope_only=all_same and bool(scope_delta['added'] or scope_delta['removed']) and not scope_delta['changed']
print(json.dumps({'schemaVersion':1,'kind':'software-factory-main-source-identity-readback','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'source':p['source'],'sourceRole':'current-main','readOnly':True,'modelsInvoked':False,'testsRun':False,'rawLogsExported':False,'privateConfigurationExported':False,
 'historical':{'runId':p['runId'],'attemptId':p['attempt'],'copySHA256':digest(copy_raw),'sourceFingerprint':copy['sha256'],'files':copy['files'],'bytes':copy['bytes'],'head':copy['gitBefore']['head']},
 'current':{'narrowFingerprint':second['sha256'],'narrowFiles':second['files'],'narrowBytes':second['bytes'],'strictFingerprint':strict_second['sha256'],'strictFiles':strict_second['files'],'strictBytes':strict_second['bytes'],'git':second['gitAfter'],'trackedDirtyCount':tracked,'untrackedCount':untracked,'privateStatusPathsOmitted':private_count,'stableDuringReadback':stable},
 'historicalToCurrentNarrowDelta':safe_delta(history_delta),'currentNarrowToStrictScopeDelta':safe_delta(scope_delta),
 'hashMethod':{'both':'SHA256(DFS sorted relative path + NUL + SHA256(file bytes) + LF)','differentNamespace':False,
 'narrowIgnoreDirs':sorted(wrapper.IGNORE_DIRS),'strictIgnoreDirs':sorted(helper.IGNORE_DIRS),
 'narrowIgnoreFiles':sorted(wrapper.IGNORE_FILES),'strictGeneratedFiles':sorted(helper.GENERATED_FILES)},
 'tools':[{'path':str(path),'sha256':digest(path.read_bytes())} for path in [helper_path,wrapper_path]],
 'conclusion':{'sameHistoricalNarrowFiles':all_same,'differenceExplainedOnlyByCurrentScope':scope_only,'currentNarrowMatchesHistorical':second['sha256']==copy['sha256'],'currentMainChangesSinceHistoricalNarrowDetected':not all_same,
 'remainingUnknown':'historical narrow scope excluded artifacts and other ignored content; changes in excluded paths between historical run and this readback cannot be inferred from that baseline alone'},
 'productAcceptance':False}))
`), true, { timeoutMs: 150000 }));
response.references = { independentBaselineSHA256: createHash('sha256').update(oldBytes).digest('hex'),
 independentBaseline: baselineFile, installationReport: installationFile,
 installedStrictFingerprintBefore: installation.sourceFingerprintsBefore?.[source] ?? null,
 installedStrictFingerprintAfter: installation.sourceFingerprintsAfter?.[source] ?? null };
const output = directory + '/main-source-identity-readback-' + (options['identity-key'] ?? 'r24') + '.json';
await writeFile(output, JSON.stringify(response, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, current: response.current, conclusion: response.conclusion,
 scopeDelta: Object.fromEntries(Object.entries(response.currentNarrowToStrictScopeDelta).map(([name, value]) => [name, { total: value.total, privateMetadataOmitted: value.privateMetadataOmitted }])) }));
