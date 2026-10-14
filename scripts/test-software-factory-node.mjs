/** Real POSIX fixture checks for the root-owned validator, never the running MSF DB. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {factoryTemplate,FACTORY_NODE} from './install-software-factory-node.mjs';
import {remote,lanProfile,python} from './managed-server-client.mjs';

const template=factoryTemplate();
assert.equal(template.engine,'claude');assert.equal(template.id,'msf-101-claude');
assert.equal(template.validation.program,'/usr/bin/sudo');
assert.deepEqual(template.validation.args,['-n','/usr/local/libexec/jarvis-msf-validation','{workspace}','{runId}']);
assert.equal(template.args[template.args.indexOf('--max-budget-usd')+1],'{maxBudgetUSD}');
assert.equal(template.supervision.fallbackExecutorIds.length,0);
assert.equal(template.workspaceRoot,'/home/superopen/All-Projects');
const fixture=String.raw`import runpy,tempfile,os,hashlib,json
from pathlib import Path
scope=runpy.run_path('/usr/local/libexec/jarvis-msf-validation')
copy=scope['secure_copy'];results=[]
def rejectFixture(name,setup):
 with tempfile.TemporaryDirectory(prefix='jarvis-msf-test-') as root:
  src=Path(root)/'source';dst=Path(root)/'dest';src.mkdir();dst.mkdir();setup(src)
  fd=os.open(src,os.O_RDONLY|os.O_DIRECTORY)
  try:
   try:copy(fd,dst,[0,0],hashlib.sha256())
   except SystemExit as error:assert error.code==2;results.append(name);return
   raise AssertionError('EXPECTED_REJECTION')
  finally:os.close(fd)
with tempfile.TemporaryDirectory(prefix='jarvis-msf-test-') as root:
 src=Path(root)/'source';dst=Path(root)/'dest';src.mkdir();dst.mkdir()
 (src/'source.ts').write_text('export const fixture = 1;')
 (src/'.env').write_text('private-fixture')
 (src/'deploy').mkdir();(src/'deploy'/'private.env').write_text('private-fixture')
 (src/'node_modules').mkdir();(src/'node_modules'/'hidden.txt').write_text('cache-fixture')
 fd=os.open(src,os.O_RDONLY|os.O_DIRECTORY);counts=[0,0];h=hashlib.sha256()
 try:copy(fd,dst,counts,h)
 finally:os.close(fd)
 assert (dst/'source.ts').read_text()=='export const fixture = 1;'
 assert not (dst/'.env').exists() and not (dst/'deploy'/'private.env').exists() and not (dst/'node_modules').exists()
 assert counts[0]==1 and len(h.hexdigest())==64;results.append('private-env-and-cache-excluded')
 fd=os.open(src,os.O_RDONLY|os.O_DIRECTORY);verify=hashlib.sha256();checked=[0,0]
 try:copy(fd,None,checked,verify)
 finally:os.close(fd)
 assert checked==counts and verify.digest()==h.digest();results.append('second-hash-without-copy')
 (src/'source.ts').write_text('changed public fixture')
 fd=os.open(src,os.O_RDONLY|os.O_DIRECTORY);changed=hashlib.sha256()
 try:copy(fd,None,[0,0],changed)
 finally:os.close(fd)
 assert changed.digest()!=h.digest();results.append('source-change-detected')
with tempfile.TemporaryDirectory(prefix='jarvis-msf-ref-test-') as root:
 src=Path(root);git=src/'.git';git.mkdir();(git/'refs').mkdir();(git/'refs'/'heads').mkdir()
 marker=src/'unsafe-program-ran'
 (git/'config').write_text('[core]\nfsmonitor = touch '+str(marker)+'\n[filter "private"]\nclean = touch '+str(marker)+'\nprocess = touch '+str(marker)+'\n')
 (git/'HEAD').write_text('ref: refs/heads/main\n');(git/'refs'/'heads'/'main').write_text('a'*40+'\n')
 fd=os.open(src,os.O_RDONLY|os.O_DIRECTORY)
 try:
  metadata=scope['raw_git_metadata'](fd);assert metadata['head']=='a'*40 and metadata['trackedDirtyCount'] is None and metadata['metadataMethod']=='bounded-raw-ref-no-git-process'
  assert not marker.exists();results.append('raw-ref-no-config-process')
  (git/'refs'/'heads'/'main').unlink();(git/'packed-refs').write_text('# pack-refs with: peeled\n'+'b'*40+' refs/heads/main\n')
  assert scope['raw_git_metadata'](fd)['head']=='b'*40;results.append('bounded-packed-ref')
  (git/'HEAD').write_text('ref: refs/heads/../../private\n')
  try:scope['raw_git_metadata'](fd)
  except SystemExit as error:assert error.code==2;results.append('ref-path-escape-denied')
  else:raise AssertionError('EXPECTED_REF_REJECTION')
 finally:os.close(fd)
rejectFixture('symlink-denied',lambda src:(src/'link').symlink_to('/etc/hostname'))
rejectFixture('special-file-denied',lambda src:os.mkfifo(src/'pipe'))
copy.__globals__['MAX_FILE']=8
rejectFixture('bounded-source-file',lambda src:(src/'large').write_text('123456789'))
print(json.dumps({'fixtureTests':results,'passed':len(results),'modelCalled':False,'productionRead':False}))
`;
const report=JSON.parse(remote(lanProfile,'jarvis-101',python({fixture,source:FACTORY_NODE.source},`import subprocess,json
out=[]
for args in [[p['source'],'not-a-uuid'],['/home/superopen/All-Projects/other','11111111-1111-4111-8111-111111111111'],[p['source'],'11111111-1111-4111-8111-111111111111','--arbitrary']]:
 r=subprocess.run(['/usr/local/libexec/jarvis-msf-validation',*args],capture_output=True,text=True,timeout=10)
 if r.returncode!=2 or json.loads(r.stdout).get('error')!='FIXED_VALIDATION_ARGUMENTS_REQUIRED':raise RuntimeError('FIXED_ARGUMENT_GATE_FAILED')
 out.append('fixed-argument-denied')
r=subprocess.run(['/usr/sbin/runuser','-u','superopen','--','/usr/bin/python3','-'],input=p['fixture'],capture_output=True,text=True,timeout=20)
if r.returncode:raise RuntimeError('VALIDATOR_FIXTURE_FAILED')
lines=r.stdout.splitlines();fixtures=json.loads(lines[-1])
print(json.dumps({'passed':len(out)+fixtures['passed'],'fixedArgumentCases':len(out),'fixture':fixtures,'modelCalled':False}))
`),true));
assert.equal(report.passed,12);assert.equal(report.fixture.passed,9);
await mkdir('artifacts/software-factory/node',{recursive:true});await writeFile('artifacts/software-factory/node/validator-regression.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
