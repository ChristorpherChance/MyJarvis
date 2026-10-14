/** Final changed-scope verification; reports describe platform mechanics, not product acceptance. */
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='artifacts/software-factory/autonomy-r22';
const sha=b=>createHash('sha256').update(b).digest('hex');
const checks=[];
function run(command,scope){
 const startedAt=new Date().toISOString();
 const r=spawnSync('cmd.exe',['/d','/c',command],{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4000000});
 const output=(r.stdout??'')+(r.stderr??'');
 const totals=Object.fromEntries([...output.matchAll(/^# (tests|pass|fail|skipped) (\d+)$/gm)].map(v=>[v[1],Number(v[2])]));
 checks.push({command,scope,startedAt,finishedAt:new Date().toISOString(),exitCode:r.status,outputSHA256:sha(output),...totals});
 if(r.status!==0)throw Error(`VERIFICATION_FAILED: ${scope}\n${output.slice(-4000)}`);
 console.log(JSON.stringify(checks.at(-1)));
}
let failure;
try{
 run('node scripts/update-runtime-contract.cjs','Regenerate current runtime API contract');
 run('node scripts/verify-v1-contract.cjs','Verify references and all current operations');
 run('npx tsx --test --test-force-exit apps/api/test/project-autonomy-recovery.test.ts apps/api/test/project-autonomy-runtime.test.ts apps/api/test/runtime-route-contract.test.ts','New worker recovery, supervision and concrete runtime routes');
 run('npm run build','Full web and API compilation');
 run('node scripts/build-development-node-package.mjs','Build separate credential-free development-node bundle');
}catch(e){failure=e.message;}
const paths=['apps/api/src/app.ts','apps/api/src/runtime/agent-heartbeat-lease.ts','apps/api/src/runtime/agent-runner.ts','apps/api/src/runtime/execution-runtime.ts','apps/api/src/runtime/project-autonomy-runtime.ts','apps/api/src/runtime/project-autonomy-routes.ts','apps/api/src/runtime/cluster-runtime.ts','scripts/execution-runtime-contract.cjs','scripts/project-autonomy-contract.cjs','apps/web/src/features/operations/ProjectAutonomyPanel.tsx','docs/openapi-v1-planned.json'];
const sources=await Promise.all(paths.map(async path=>{const b=await readFile(path);return {path,sha256:sha(b),bytes:b.length};}));
const heartbeatRef='artifacts/project-autonomy-r22/heartbeat-lease-source-freeze-r22-7-clock-safe.json';
const heartbeatReport=JSON.parse(await readFile(heartbeatRef,'utf8'));
for(const frozen of heartbeatReport.files){if(sha(await readFile(frozen.path))!==frozen.sha256)throw Error('HEARTBEAT_FROZEN_SOURCE_CHANGED: '+frozen.path);}
const contract=JSON.parse(await readFile('docs/openapi-v1-planned.json','utf8'));
const operations=Object.values(contract.paths).flatMap(p=>Object.entries(p).filter(([k])=>['get','post','put','patch','delete','head','options'].includes(k)).map(([,v])=>v));
const report={at:new Date().toISOString(),release:'20261011-project-autonomy-r22-7',scope:'Decision-integrated platform, bounded heartbeat lease and restricted new-worker recovery. No factory product or native resume acceptance.',checks,sources,heartbeatVerificationReference:heartbeatRef,heartbeatVerificationSHA256:sha(await readFile(heartbeatRef)),heartbeatReportRecorded:true,contract:{operations:operations.length,schemas:Object.keys(contract.components.schemas).length},nodeBundle:JSON.parse(await readFile('artifacts/development-node/package/SHA256.json','utf8')),failure:failure??null,productAccepted:false,authenticatedBrowserAcceptance:false,remoteRecoveryPerformed:false};
await writeFile(`${dir}/runtime-verification-r22-7${failure?'-failed':''}.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
if(failure)throw Error(failure);
