import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
import {buildCleanupR29HostProgram} from './verify-factory-truth-gate-build-cleanup-r29.mjs';
import {boundProcessCensusR32NativeProgram,boundProcessCensusR32BuildProgram,boundProcessCensusR32Preparation as P} from './factory-bound-process-census-r32.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const python='C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe';
const original=[targetCleanupR29HostProgram(),buildCleanupR29HostProgram()];
const generated=[boundProcessCensusR32NativeProgram(),boundProcessCensusR32BuildProgram()];
function section(s,start,end){const a=s.indexOf(start),b=s.indexOf(end,a);assert.ok(a>=0&&b>a);return s.slice(a,b)}
for(let i=0;i<2;i++){
 test(`${i?'build':'native'} generated Python parses and immutable exit proof remains`,()=>{
  const r=spawnSync(python,['-c','import ast,sys; ast.parse(sys.stdin.read())'],{input:generated[i],encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.equal(section(generated[i],'def pidfd_exit_proof(','def census():'),section(original[i],'def pidfd_exit_proof(','def census():'));
 });
 test(`${i?'build':'native'} only census acquisition and record diagnostics sections change`,()=>{
  const strip=s=>s.replace(/^CLOSED_READ_SUBPHASES=set\([^\n]+\)\n/m,'').replace(/def process_record\([\s\S]*?(?=def pidfd_poll\()/,'RECORD_BODY\n').replace(/def census\(\):[\s\S]*?(?=def workspace_sockets\(\):)/,'CENSUS_BODY\n');
  assert.equal(strip(generated[i]),strip(original[i]));
 });
 test(`${i?'build':'native'} all prior need predicates and exit proof AST remain`,()=>{
  const r=spawnSync(python,['-c',String.raw`import ast,json,sys
value=json.loads(sys.stdin.read())
def functions(source):
 return {n.name:n for n in ast.parse(source).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
old=functions(value['old']);new=functions(value['new'])
class WithoutDiagnosticCalls(ast.NodeTransformer):
 def visit_Call(self,node):
  node=self.generic_visit(node)
  if isinstance(node.func,ast.Name) and node.func.id in ['marked','closed'] and len(node.args)==2 and isinstance(node.args[1],ast.Lambda):return node.args[1].body
  return node
for name in ['process_record','census']:
 def guards(node):
  return sorted(ast.dump(WithoutDiagnosticCalls().visit(n),include_attributes=False) for n in ast.walk(node) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='need' and len(n.args)>=2 and isinstance(n.args[1],ast.Constant) and n.args[1].value not in ['R29_CLEANUP_READ_SUBPHASE_INVALID','R29_CLEANUP_PIDFD_CLOSE_INCOMPLETE'])
 assert guards(old[name])==guards(new[name]),name
for name in old:
 if name not in ['process_record','census']:
  assert ast.dump(old[name],include_attributes=False)==ast.dump(new[name],include_attributes=False),name
`],{input:JSON.stringify({old:original[i],new:generated[i]}),encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
 });
}
test('actual original generated inputs are pinned and no operational activation is defined',()=>{
 assert.equal(sha(original[0]),P.originalNativeSHA256);assert.equal(sha(original[1]),P.originalBuildSHA256);
 assert.equal(P.defaultOperationalPins,null);assert.equal(P.operationalQualified,false);assert.equal(P.remoteOperations,false);
});
