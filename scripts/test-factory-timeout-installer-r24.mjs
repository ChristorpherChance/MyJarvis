/** Actual installer syntax and short-write fixtures; never remote/install. */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const source=await readFile(new URL('./install-factory-timeout-collector-r24.mjs',import.meta.url),'utf8');
const start=source.indexOf('const program=String.raw`')+'const program=String.raw`'.length,end=source.indexOf('\n`;\nlet result,prepared;',start),program=source.slice(start,end);
test('two-phase embedded program parses with actual Python',()=>{assert.ok(start>23&&end>start);const r=spawnSync('python',['-c','import ast,sys;ast.parse(sys.stdin.read())'],{input:program,encoding:'utf8'});assert.equal(r.status,0,r.stderr);});
const create=program.slice(program.indexOf('def create('),program.indexOf('def syncdir('));
test('actual create body loops short writes and fsyncs all bytes',()=>{
 const code=`import sys\nbody=sys.stdin.read()\nclass DummyOS:\n O_WRONLY=1;O_CREAT=2;O_EXCL=4;O_NOFOLLOW=8\n def __init__(self):self.written=bytearray();self.closed=False;self.synced=False\n def open(self,*args):return 73\n def write(self,fd,data):n=min(3,len(data));self.written.extend(data[:n]);return n\n def fchown(self,*args):pass\n def fchmod(self,*args):pass\n def fsync(self,*args):self.synced=True\n def close(self,*args):self.closed=True\ndef need(v,c):\n if not v:raise RuntimeError(c)\nos=DummyOS();exec(body);create('controlled-dummy',b'abcdefghij',0o600);assert os.written==b'abcdefghij' and os.closed and os.synced\nprint('short-write-loop-real-body-pass')\n`;
 const r=spawnSync('python',['-c',code],{input:create,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/real-body-pass/);
});
test('zero-byte write closes descriptor and refuses success',()=>{
 const code=`import sys\nbody=sys.stdin.read()\nclass DummyOS:\n O_WRONLY=1;O_CREAT=2;O_EXCL=4;O_NOFOLLOW=8\n def __init__(self):self.closed=False\n def open(self,*args):return 73\n def write(self,*args):return 0\n def close(self,*args):self.closed=True\ndef need(v,c):\n if not v:raise RuntimeError(c)\nos=DummyOS();exec(body)\ntry:create('controlled-dummy',b'x',0o600)\nexcept RuntimeError as e:assert str(e)=='TIMEOUT_INSTALL_SHORT_WRITE' and os.closed\nelse:raise AssertionError('false success')\n`;
 const r=spawnSync('python',['-c',code],{input:create,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});
test('combined preserved actual proof and cleanup readback validate without remote access',()=>{const r=spawnSync(process.execPath,['scripts/install-factory-timeout-collector-r24.mjs','--proof=artifacts/software-factory/acceptance-r24/timeout-linux-proof-435dafbe-77ad-4e2f-a5de-43f318f96f48.json'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);assert.equal(result.ready,true);assert.equal(result.installs,false);assert.equal(result.newSHA256,'a6cc30f63134fdc6d5be4aaba6049b99c0920c0db3e89b612d607b7991e647b7');});
