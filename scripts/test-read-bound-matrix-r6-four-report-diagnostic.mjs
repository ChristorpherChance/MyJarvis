import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fourDiagnosticProgram as p,readFourDiagnosticOnce as read,fourDiagnosticScope as S} from '../.jarvis-dev/maintenance/read-bound-matrix-r6-four-report-diagnostic-once.mjs';
test('missing or wrong exact ID never reads or writes',async()=>{let n=0;const no=()=>{n++;throw Error('NO_IO')};assert.equal((await read({}, {readLocal:no,readRoot:no,wx:no})).ready,false);await assert.rejects(read({attempt:'0'.repeat(32),runID:S.runID},{readLocal:no,readRoot:no,wx:no}),/EXACT_IDS/);assert.equal(n,0)});
test('actual Python has one fixed file,1000 evidence,root ancestors,nofollow,bounds and raw double read with no mutation/package entry',()=>{const r=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-c',String.raw`import ast,sys
s=sys.stdin.read();t=ast.parse(s);assert "uid=1000 if part=='evidence' else 0" in s and "s.st_size==6670" in s and "s.st_nlink==1" in s and "not s.st_mode&0o022" in s and 'O_NOFOLLOW' in s and 'a==b and m==n and d==e' in s
for n in ast.walk(t):
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute):assert n.func.attr not in ['write','remove','unlink','mkdir','chown','chmod','exec','system','kill','truncate']
assert s.count("os.stat('pg-four-result.json'")==2 and 'signal.alarm(20)' in s
print('fixed one-file parser guard passed')`],{input:p,encoding:'utf8',timeout:3000});assert.equal(r.status,0,r.stderr)});
