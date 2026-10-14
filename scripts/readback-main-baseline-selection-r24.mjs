/** Read selection identities only; no task, model or product execution. */
import { readFile, writeFile } from 'node:fs/promises';
import { withPlatform } from './managed-server-client.mjs';
const batchKey=process.argv.find(v=>v.startsWith('--batch-key='))?.slice('--batch-key='.length)??'source-update-r24';
if(!/^[a-z][a-z0-9-]{0,63}$/.test(batchKey))throw Error('MAIN_SELECTION_BATCH_KEY_INVALID');
const expected=JSON.parse(await readFile('artifacts/software-factory/acceptance-r24/main-baseline-independent-review-'+batchKey+'.json','utf8'));
if(expected.batchKey!==batchKey||expected.restored!==true||expected.terminalIndependentReadback!==true)throw Error('MAIN_SELECTION_BASELINE_NOT_INDEPENDENTLY_READ_BACK');
const result=await withPlatform(async({api})=>{
 const value=(await api('/api/v1/projects/'+expected.projectId+'/autonomy/baselines')).data;
 const current=value.currentMainBaseline;
 const taskId=current?.taskId??current?.task?.id??null,runId=current?.runId??current?.run?.id??null;
 const batches=value.batches??value.items??[];
 return {at:new Date().toISOString(),batchKey,projectId:expected.projectId,expectedTaskId:expected.taskId,expectedRunId:expected.runId,
  topLevelCurrentMainBaseline:{taskId,runId,sourceFingerprint:current?.sourceFingerprint??null,status:current?.status??null},
  topLevelMatches:taskId===expected.taskId&&runId===expected.runId,
  historicalBatchBindings:batches.map(v=>({id:v.id??v.batchId??null,mainBaselineTaskId:v.mainBaselineTaskId??v.currentMainBaseline?.taskId??null,mainBaselineRunId:v.currentMainBaseline?.runId??null})),
  readOnly:true,profilesChanged:false,modelInvoked:false};
});
const output='artifacts/software-factory/acceptance-r24/main-baseline-selection-readback-'+batchKey+'.json';
await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,...result}));
