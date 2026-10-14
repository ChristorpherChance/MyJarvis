/** Verify clearer supervision controls without claiming software-factory delivery. */
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const release='20261011-supervision-simple-r23-1';
const dir='artifacts/software-factory/autonomy-r22';
const label=process.env.JARVIS_SIMPLE_VERIFICATION??'r23-1';
if(!/^[a-z0-9-]{1,60}$/.test(label))throw Error('INVALID_VERIFICATION_LABEL');
const sha=value=>createHash('sha256').update(value).digest('hex');
const checks=[];
function run(command,scope){
 const startedAt=new Date().toISOString();
 const r=spawnSync('cmd.exe',['/d','/c',command],{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4000000});
 const output=(r.stdout??'')+(r.stderr??'');
 const totals=Object.fromEntries([...output.matchAll(/^(?:#|ℹ)\s+(tests|pass|fail|skipped)\s+(\d+)$/gm)].map(v=>[v[1],Number(v[2])]));
 checks.push({command,scope,startedAt,finishedAt:new Date().toISOString(),exitCode:r.status,outputSHA256:sha(output),...totals});
 console.log(JSON.stringify(checks.at(-1)));
 if(r.status!==0)throw Error('VERIFICATION_FAILED: '+scope+'\n'+output.slice(-3500));
}
let failure;
try{
 const backend=JSON.parse(await readFile('artifacts/project-autonomy-r22/start-safety-verification.json','utf8'));
 for(const file of backend.sourceFiles)if(sha(await readFile(file.path))!==file.sha256)throw Error('BACKEND_VERIFIED_SOURCE_CHANGED: '+file.path);
 const contract=JSON.parse(await readFile('docs/openapi-v1-planned.json','utf8'));
 if(!contract.paths['/api/v1/projects/{id}/autonomy/start'].post.responses['422'])throw Error('START_REJECTION_NOT_DOCUMENTED');
 run('node scripts/verify-v1-contract.cjs','Maintained concrete API contract references, including 422 recovery-required');
 run('node --test scripts/test-execution-outcome-note.mjs','Stopped execution must not claim success or product acceptance');
 run('npx tsx --test apps/web/src/features/operations/project-autonomy-view.test.ts','Simple-page controls and truthful current-stage presentation');
 run('npx tsx --test --test-force-exit apps/api/test/runtime-route-contract.test.ts','Every declared operation resolves to a concrete authenticated route');
 run('npm run build','Full web and API compilation for the changed release');
}catch(e){failure=e.message;}
const paths=['apps/api/src/runtime/project-autonomy-runtime.ts','apps/api/test/project-autonomy-start.test.ts','apps/api/src/runtime/cluster-runtime.ts','scripts/project-autonomy-contract.cjs','docs/openapi-v1-planned.json','apps/web/src/features/operations/ProjectAutonomyPanel.tsx','apps/web/src/features/operations/ProjectAutonomyPanel.css','apps/web/src/features/operations/project-autonomy-view.ts','apps/web/src/features/operations/project-autonomy-view.test.ts','apps/web/src/features/operations/ExecutionRunPanel.tsx','apps/web/src/features/operations/execution-outcome-note.ts','scripts/test-execution-outcome-note.mjs'];
const sources=await Promise.all(paths.map(async path=>{const b=await readFile(path);return {path,sha256:sha(b),bytes:b.length};}));
const report={at:new Date().toISOString(),release,scope:'Truthful project supervision page, protected ordinary start, and execution outcome notices. Existing quality gates, frozen goals and billing policy preserved.',checks,sources,backendVerificationReference:'artifacts/project-autonomy-r22/start-safety-verification.json',failure:failure??null,productAccepted:false,authenticatedBrowserAcceptance:false,remoteRecoveryPerformed:false,nodePackageChanged:false};
await writeFile(`${dir}/simple-supervision-verification-${label}${failure?'-failed':''}.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
if(failure)throw Error(failure);
