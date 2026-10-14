/** Two new related groups. No execution entry, nonce, Root or package code is called. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {buildPG4QAStartupR33LateAdmissionDocuments as build,pg4QAStartupR33Protocol as protocol,pg4QAStartupR33Scope} from './factory-pg4-qa-startup-r33.mjs';
test('pure five-input late data builder changes only exact null A/entry slots and preserves every other value',()=>{
 const ref={path:'artifacts/software-factory/goals-r29/controlled-a.json',sha256:'a'.repeat(64)},entry={path:'artifacts/software-factory/goals-r29/controlled-entry.json',sha256:'b'.repeat(64)},contract='c'.repeat(64);
 const driver={schemaVersion:1,kind:'r33-pg4-qa-startup-driver-input',protocol,attempt:null,sourceContractHash:contract,fixedRuntime:{runtimeWitness:null,mountWitness:null},source:{fixtureSHA256:pg4QAStartupR33Scope.source.fixtureSHA256},images:{imageWitness:null},essentialManifestExpectations:{node:{path:'/usr/local/bin/node',sha256:null,bytes:null}},config:{watch:false,retry:0},preAdmission:{runtimeQualification:{path:'/tools/admission/runtimeQualification.json',sha256:null}},sqlBaseline:null};
 const sql=phase=>({schemaVersion:1,kind:'r33-pg4-independent-sql-request',protocol,attempt:null,phase,sourceContractSHA256:contract,driverSHA256:'d'.repeat(64),sqlSourceSHA256:'e'.repeat(64),runtimeWitness:{sourceAdmissionRef:{path:'/tools/meta/sourceAdmission.json',sha256:null},entryReviewRef:{path:'/tools/meta/entryReview.json',sha256:null},sourceFamilyReviewRef:{path:'/tools/meta/sourceFamilyReview.json',sha256:'f'.repeat(64)}},migrationWitness:{unchanged:'real source belongs to existing qualification'},databaseIdentity:{urlSHA256:null},selectedFixtureSHA256:pg4QAStartupR33Scope.source.fixtureSHA256});
 const input={driverInputTemplate:driver,sqlBootstrapRequest:sql('bootstrap'),sqlAfterRequest:sql('after-hooks'),sourceAdmissionRef:ref,entryReviewRef:entry},before=structuredClone(input),out=build(input);
 assert.deepEqual(input,before);assert.deepEqual(Object.keys(out).sort(),['driverInputTemplate','providedRefPatch','sqlAfterRequest','sqlBootstrapRequest'].sort());
 const reverted=structuredClone(out);reverted.driverInputTemplate.preAdmission.runtimeQualification.sha256=null;for(const k of ['sqlBootstrapRequest','sqlAfterRequest']){reverted[k].runtimeWitness.sourceAdmissionRef.sha256=null;reverted[k].runtimeWitness.entryReviewRef.sha256=null}
 for(const k of ['driverInputTemplate','sqlBootstrapRequest','sqlAfterRequest'])assert.deepEqual(reverted[k],input[k]);
 assert.deepEqual(out.providedRefPatch,{sourceAdmission:ref,admissionFiles:{sourceAdmission:ref,runtimeQualification:ref,entryReview:entry}});assert.ok(Object.isFrozen(out.driverInputTemplate.essentialManifestExpectations.node));
 assert.throws(()=>build(null),/INPUT_REQUIRED/);const changed=structuredClone(input);changed.sqlAfterRequest.runtimeWitness.sourceAdmissionRef.path='/tools/elsewhere.json';assert.throws(()=>build(changed),/SQL_REF_SLOT_CHANGED/);
 const stale=structuredClone(input);stale.driverInputTemplate.preAdmission.runtimeQualification.sha256='0'.repeat(64);assert.throws(()=>build(stale),/RUNTIME_SLOT_CHANGED/);
 let calls=0;const getter={...input};Object.defineProperty(getter,'entryReviewRef',{enumerable:true,get(){calls++;return entry}});assert.throws(()=>build(getter),/ACCESSOR_REFUSED/);assert.equal(calls,0);
});
test('optional exact leaf present/absent/untrusted/changed/ancestor-missing use original byte reader and do not create placeholders',()=>{
 const r=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-c',String.raw`
import pathlib,types,ast,stat,errno
t=ast.parse(pathlib.Path('scripts/factory-pg4-qa-startup-worker-r33.py').read_bytes());t.body=[n for n in t.body if not isinstance(n,ast.If)]
def setup(present=True,mode=0o600,changed=False):
 m=types.ModuleType('controlled_optional');exec(compile(t,'controlled-optional','exec'),m.__dict__);m.Path=pathlib.PurePosixPath;m.ROOT=m.Path('/controlled/root');m.STATE={};saved=[]
 class OS:
  O_RDONLY=0;O_NOFOLLOW=1;O_NONBLOCK=2;O_CLOEXEC=4;O_DIRECTORY=8;SEEK_SET=0
  def __init__(self):self.next=0;self.fds={};self.second=False;self.body=b'original opaque failure bytes, not JSON'
  def s(self,p):
   kind=stat.S_IFDIR if p in ['/controlled/root','/controlled/root/evidence'] else stat.S_IFREG
   owner=0 if p=='/controlled/root' else 1000
   return types.SimpleNamespace(st_dev=7,st_ino=81 if kind==stat.S_IFDIR else 82,st_uid=owner,st_gid=owner,st_mode=kind|(0o700 if kind==stat.S_IFDIR else mode),st_nlink=2 if kind==stat.S_IFDIR else 1,st_size=4096 if kind==stat.S_IFDIR else len(self.body),st_mtime_ns=1791916234428123456,st_ctime_ns=1791916234428123457)
  def full(self,p,d=None):return str(p) if str(p).startswith('/') else self.fds[d][0]+'/'+str(p)
  def stat(self,p,dir_fd=None,follow_symlinks=False):
   p=self.full(p,dir_fd)
   if p.endswith('/pg4-physical-admission-error.json') and not present:raise FileNotFoundError(errno.ENOENT,'controlled leaf')
   return self.s(p)
  def fstat(self,fd):return self.s(self.fds[fd][0])
  def open(self,p,flags,dir_fd=None):
   fd=self.next;self.next+=1;self.fds[fd]=[self.full(p,dir_fd),0];return fd
  def read(self,fd,n):
   p,offset=self.fds[fd];body=self.body
   if changed and self.second:body=b'X'+body[1:]
   block=body[offset:offset+n];self.fds[fd][1]+=len(block);return block
  def lseek(self,fd,off,whence):self.fds[fd][1]=off;self.second=True
  def close(self,fd):self.fds.pop(fd)
 f=OS();m.os=f;m.held_dir=lambda p:f.open(p,0);m.store=lambda p,b,mode:saved.append((str(p),b,mode)) or {'path':str(p),'sha256':m.sha(b),'bytes':len(b)};m.save_state=lambda:None
 return m,f,saved
m,f,saved=setup(False);v=m.retain_optional_physical_error();assert v['status']=='absent' and v['presenceObservationComplete'] is True and v['retainedOriginal'] is None and saved==[] and f.fds=={}
m,f,saved=setup();v=m.retain_optional_physical_error();assert v['status']=='retained' and v['sourceWasReadTwice'] is True and len(v['sourceMetadata'])==9 and saved[0][1]==f.body and saved[0][2]==0o444 and v['originalBytes']==len(f.body) and f.fds=={}
m,f,saved=setup(mode=0o620)
try:m.retain_optional_physical_error()
except RuntimeError as e:assert str(e)=='PG4_R33_OPTIONAL_ERROR_UNTRUSTED'
else:raise AssertionError('untrusted leaf accepted')
assert m.STATE['optionalPhysicalError']['status']=='unknown' and saved==[] and f.fds=={}
m,f,saved=setup(changed=True)
try:m.retain_optional_physical_error()
except RuntimeError as e:assert str(e)=='PG4_R33_REPORT_SECOND_READ_CHANGED'
else:raise AssertionError('changed bytes accepted')
assert m.STATE['optionalPhysicalError']['status']=='unknown' and saved==[] and f.fds=={}
m,f,saved=setup(False)
def missing_root(p):raise FileNotFoundError(errno.ENOENT,'controlled ancestor')
m.held_dir=missing_root
try:m.retain_optional_physical_error()
except FileNotFoundError as e:assert e.errno==errno.ENOENT
else:raise AssertionError('ancestor missing treated as leaf absence')
assert m.STATE['optionalPhysicalError']['status']=='unknown' and saved==[]
print('opaque original bytes only; optional presence/absence/unknown; original five untouched; controlled no Root')
`],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/controlled no Root/);
});
