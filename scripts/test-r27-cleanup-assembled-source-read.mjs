/** Execute the assembled observer's real key/private_read/receipt loop in local fixtures. */
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {r27EvidenceHostProgram} from './factory-evidence-read-r27.mjs';
const python=String.raw`
import ast,json,os as native_os,stat,tempfile,hashlib
from pathlib import Path
from types import SimpleNamespace
payload=json.loads(__import__('sys').stdin.read());source=payload['source']
tree=ast.parse(source)
definitions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['key','private_read','optional_json']]
assert len(definitions)==3
loop=next(n for n in tree.body if isinstance(n,ast.For) and isinstance(n.target,ast.Name) and n.target.id==('key' if payload['oldLoop'] else 'source_key'))
module=ast.Module(body=definitions+[loop],type_ignores=[])
def adapted(s):return SimpleNamespace(**{k:getattr(s,k) for k in ['st_dev','st_ino','st_gid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns']},st_uid=0)
class FixturePath:
 def __init__(self,path):self.path=Path(path)
 def __fspath__(self):return str(self.path)
 def lstat(self):return adapted(self.path.lstat())
def trusted(q):
 q=Path(q)
 assert q.parent==scope_root and q.name in ['source-before.json','source-after.json']
 return FixturePath(q)
def need(v,c):
 if not v:raise RuntimeError(c)
# Windows has no Linux root/no-follow flags, and descriptor/name stat precision
# differs. A controlled fixture adapter supplies Linux-equivalent owner/metadata
# for the same fixture file. Production key/private_read bodies remain exact AST
# nodes; this test does not claim to test Linux permissions or replacement races.
opened={}
def fixture_open(q,flags):
 fd=native_os.open(q,flags);opened[fd]=Path(q);return fd
def fixture_close(fd):
 opened.pop(fd,None);native_os.close(fd)
os=SimpleNamespace(path=native_os.path,O_RDONLY=native_os.O_RDONLY,O_NOFOLLOW=getattr(native_os,'O_NOFOLLOW',0),O_NONBLOCK=getattr(native_os,'O_NONBLOCK',0),open=fixture_open,fstat=lambda fd:adapted(opened[fd].lstat()),read=native_os.read,close=fixture_close)
with tempfile.TemporaryDirectory(prefix='jarvis-r27-cleanup-regression-') as folder:
 scope_root=Path(folder);p={'candidateFingerprint':'b'*64,'candidateFiles':608};private_sources={}
 for name in ['before','after']:(scope_root/('source-'+name+'.json')).write_text(json.dumps({'sha256':'b'*64,'files':607 if payload['badAfter'] and name=='after' else 608}),encoding='utf8')
 namespace=dict(globals())
 try:
  exec(compile(module,'<actual-assembled-cleanup>', 'exec'),namespace)
  result={'ok':True,'keyCallable':callable(namespace['key']),'before':namespace['private_sources']['before'],'after':namespace['private_sources']['after']}
 except Exception as e:result={'ok':False,'class':type(e).__name__,'message':str(e)}
 print(json.dumps(result))
`;
function run({oldLoop=false,badAfter=false}={}){let source=r27EvidenceHostProgram({cleanup:true});if(oldLoop)source=source.replace("for source_key in ['before','after']:","for key in ['before','after']:").replace("scope_root/('source-'+source_key+'.json')","scope_root/('source-'+key+'.json')").replace('private_sources[source_key]','private_sources[key]');const r=spawnSync('python',['-c',python],{input:JSON.stringify({source,oldLoop,badAfter}),encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
test('actual assembled source-before/after reads preserve callable metadata key and dynamic608 binding',()=>{const r=run();assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.keyCallable,true);for(const name of ['before','after']){assert.equal(r[name].present,true);assert.equal(r[name].sourceFingerprint,'b'.repeat(64));assert.equal(r[name].files,608);assert.match(r[name].sha256,/^[a-f0-9]{64}$/);}});
test('exact old loop reintroduced only in fixture reproduces the observed str-not-callable error',()=>{const r=run({oldLoop:true});assert.equal(r.ok,false);assert.equal(r.class,'TypeError');assert.equal(r.message,"'str' object is not callable");});
test('metadata guard repair still rejects a source-after file-count mismatch',()=>{const r=run({badAfter:true});assert.equal(r.ok,false);assert.equal(r.class,'RuntimeError');assert.equal(r.message,'REPAIR_EVIDENCE_PRIVATE_SOURCE_BINDING_CHANGED');});
