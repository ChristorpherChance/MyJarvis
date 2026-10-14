/** Local static integration evidence, not an attestation of a deployed binary. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const definitions=[
 {path:'apps/api/src/runtime/software-factory-runtime.ts',lines:[31,33,50,93,133,141],finding:'The factory business adapter is read-only: state, projects and progress summaries; it neither starts internal factory jobs nor automatically accepts them. Signed source-development CLI execution is a separate path.'},
 {path:'apps/api/src/v1/work-domains.ts',lines:[27,31,83,86,204,225,232,323,327],finding:'Task dependencies contain one dependsOn. Milestone planning can create a serial chain; acceptance stores reviewer identity and evidence. This does not implement arbitrary multi-artifact, parent-child and full factory-stage orchestration.'},
 {path:'apps/api/src/runtime/execution-runtime.ts',lines:[217,221,232,234,246,247],finding:'Managed scheduling can start ready existing tasks and configured recovery. Success enters validating; this is an execution foundation, not an autonomous semantic stage verifier or customer delivery-use pipeline.'},
 {path:'apps/api/src/runtime/execution-skills.ts',lines:[11,15,19,24,33,35,37],finding:'Jarvis already freezes verified published skill content/conditions/evidence and hashes for execution. Reuse is available as a design foundation; no automatic agent candidate evaluation and promotion is proven by this local file.'}
];
const evidence=[];
for(const d of definitions){const b=await readFile(d.path);evidence.push({...d,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length});}
const r={at:new Date().toISOString(),scope:'Local Jarvis source static inspection only; not production runtime validation',evidence,remoteAccess:false,projectModelCalls:0,testsRun:0,deployments:0,privateInputsRead:false};
await writeFile('artifacts/software-factory/goals-r21/jarvis-bridge-audit.json',JSON.stringify(r,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({recorded:true,files:evidence.length,scope:r.scope}));
