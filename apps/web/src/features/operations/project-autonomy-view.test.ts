import assert from 'node:assert/strict';
import test from 'node:test';
import {autonomyControls,currentAutonomyStage,stageDisplayStatus,stageExecution,stoppedExecutionText,type AutonomyRunView,type AutonomyStageView} from './project-autonomy-view.ts';

const pending:AutonomyStageView={id:'first',status:'pending',attempt:0};
const worker:AutonomyStageView={id:'first',status:'worker',attempt:3,taskId:'task',runId:'run'};
const run:AutonomyRunView={id:'run',taskId:'task',projectId:'project',status:'timeout',timeoutSec:1200,result:{stopReason:{code:'PROCESS_TIMEOUT'}}};
const profile=(status:string,reason:string|null=null,stages:AutonomyStageView[]=[pending])=>({status,reason,stages,config:{maxAttempts:3,maxRepeated:2}});

test('首次启动和无旧执行的暂停计划可启动，暂停仅对运行计划提供',()=>{
 for(const status of ['configured','ready','draft','paused']){const controls=autonomyControls(profile(status),null,true);assert.equal(controls.canStart,true,status);assert.equal(controls.canPause,false,status);assert.equal(controls.canCancel,true,status);}
 const controls=autonomyControls(profile('running'),null,true);assert.equal(controls.canStart,false);assert.equal(controls.canPause,true);
});
test('当前实际超时并耗尽尝试，不能继续启动或再次暂停',()=>{
 const controls=autonomyControls(profile('blocked','REPAIR_ATTEMPTS_EXHAUSTED',[worker]),run,true);
 assert.equal(controls.reason,'attempts');assert.equal(controls.canStart,false);assert.equal(controls.canPause,false);assert.equal(controls.canCancel,true);
 assert.equal(autonomyControls(profile('blocked','RESOURCE_UNAVAILABLE',[worker]),run,true).canStart,false);
});
test('待执行工作包尝试耗尽时也不能以资源重试绕过',()=>{
 assert.equal(autonomyControls(profile('blocked','COST_UNKNOWN',[{...pending,attempt:3}]),null,true).canStart,false);
});
test('需对账、停滞、旧暂停任务和取消执行均不能直接继续',()=>{
 for(const reason of ['EXECUTION_NEEDS_RECONCILIATION','REPEATED_SOURCE_AND_PROBLEMS'])assert.equal(autonomyControls(profile('blocked',reason),null,true).canStart,false,reason);
 assert.equal(autonomyControls(profile('paused',null,[{...worker,attempt:1}]),{...run,status:'queued'},true).canStart,false);
 for(const result of [{lateEvidenceOnly:true},{outcome:'cancelled'}])assert.equal(autonomyControls(profile('blocked','RESOURCE_UNAVAILABLE',[{...worker,attempt:1}]),{...run,status:'succeeded',result},true).canStart,false);
 for(const status of ['cancelled','interrupted'])assert.equal(autonomyControls(profile('waitingResource',null,[{...worker,attempt:1}]),{...run,status},true).canStart,false);
 assert.equal(autonomyControls(profile('waitingResource',null,[{...worker,attempt:1}]),{...run,status:'running',stopRequested:true},true).canStart,false);
 assert.equal(autonomyControls(profile('blocked','RESOURCE_UNAVAILABLE',[{...pending,checkpoint:{repeated:2}}]),null,true).canStart,false);
});
test('合法资源条件重试仍保留，未知阻塞不会承诺恢复',()=>{
 for(const status of ['waitingResource','waitingBudget','waitingQuota'])assert.equal(autonomyControls(profile(status),null,true).canStart,true,status);
 const controls=autonomyControls(profile('blocked','RESOURCE_UNAVAILABLE'),null,true);assert.equal(controls.canStart,true);assert.equal(controls.startLabel,'检查条件并启动');
 assert.equal(autonomyControls(profile('blocked','UNRECOGNIZED_PROTECTION'),null,true).canStart,false);
});
test('旧执行的回执缺失时不能推断可恢复；已成功执行不凭尝试数误判失败',()=>{
 assert.equal(autonomyControls(profile('blocked','RESOURCE_UNAVAILABLE',[{...worker,attempt:1}]),null,false).canStart,false);
 assert.equal(autonomyControls(profile('blocked','RESOURCE_UNAVAILABLE',[{...worker,attempt:1,runId:undefined}]),null,true).canStart,false);
 assert.equal(autonomyControls(profile('running',null,[worker]),null,false).reason,'receipt');
 const controls=autonomyControls(profile('blocked','USD_BOUNDARY',[worker]),{...run,status:'succeeded',result:{outcome:'success',validation:{exitCode:0}}},true);
 assert.equal(controls.canStart,true);assert.equal(controls.reason,null);
});
test('已结束计划不再提供任何执行操作',()=>{
 for(const status of ['completed','cancelled','stopped']){const controls=autonomyControls(profile(status),null,true);assert.equal(controls.canStart,false);assert.equal(controls.canPause,false);assert.equal(controls.canCancel,false);}
});
test('最新任务按当前阶段选择，固定复验和评阅不会指向旧开发执行',()=>{
 const stage={...worker,reviewTaskId:'review-task',reviewRunId:'review-run',validationTaskId:'validation-task',validationRunId:'validation-run'};
 assert.deepEqual(stageExecution(stage),{taskId:'task',runId:'run'});
 assert.deepEqual(stageExecution({...stage,status:'reviewing'}),{taskId:'review-task',runId:'review-run'});
 assert.deepEqual(stageExecution({...stage,status:'validating-prerequisite'}),{taskId:'validation-task',runId:'validation-run'});
 assert.deepEqual(stageExecution({...stage,status:'waiting-prerequisite'}),{taskId:'validation-task',runId:'validation-run'});
 assert.equal(currentAutonomyStage([{...pending,id:'later'},stage]),stage);
});
test('最后开发尝试的真实前置等待不把旧失败回执当成耗尽；暂停等待可启动固定复验',()=>{
 const waiting={...worker,status:'waiting-prerequisite'};
 for(const receiptReady of [true,false]){const controls=autonomyControls(profile('running',null,[waiting]),run,receiptReady);assert.equal(controls.reason,null);assert.equal(controls.canStart,false);assert.equal(controls.canPause,true);}
 const paused=autonomyControls(profile('paused',null,[waiting]),run,true);assert.equal(paused.reason,null);assert.equal(paused.canStart,true);
 const latest={...waiting,validationTaskId:'fixed-task',validationRunId:'fixed-run'};
 assert.deepEqual(stageExecution(latest),{taskId:'fixed-task',runId:'fixed-run'});
 assert.equal(autonomyControls(profile('blocked','RESOURCE_UNAVAILABLE',[latest]),{...run,id:'fixed-run',taskId:'fixed-task',status:'failed'},true).canStart,true);
 assert.equal(autonomyControls(profile('paused',null,[latest]),null,false).canStart,false);
 for(const status of ['cancelled','interrupted'])assert.equal(autonomyControls(profile('paused',null,[latest]),{...run,id:'fixed-run',taskId:'fixed-task',status},true).canStart,false);
 assert.equal(autonomyControls(profile('paused',null,[waiting]),{...run,status:'running',stopRequested:true},true).canStart,false);
});
test('整体阻塞或暂停时阶段不声称正在开发，后续包说明前置未通过',()=>{
 assert.equal(stageDisplayStatus('blocked','worker',false,true),'已停在此阶段');
 assert.equal(stageDisplayStatus('paused','worker',false,true),'已暂停');
 assert.equal(stageDisplayStatus('cancelled','reviewing',false,true),'已停止');
 assert.equal(stageDisplayStatus('blocked','pending',false,false),'前置工作包未通过');
 assert.equal(stageDisplayStatus('running','passed',false,true),'待核验证据');
 assert.equal(stageDisplayStatus('running','passed',true,true),'独立验证通过');
});
test('超时说明读取实际单轮时限，无时限时不补造分钟数或历史超时次数',()=>{
 assert.match(stoppedExecutionText(run),/20 分钟/);
 assert.match(stoppedExecutionText({...run,timeoutSec:75}),/75 秒/);
 assert.match(stoppedExecutionText({...run,timeoutSec:1800}),/30 分钟/);
 assert.equal(stoppedExecutionText({...run,timeoutSec:undefined}),'最新任务超过执行时限后结束。');
 assert.equal(stoppedExecutionText({...run,status:'cancelled',result:{stopReason:{code:'HEARTBEAT_FAILED'}}}),'最新任务因节点通信中断而结束。');
 assert.equal(stoppedExecutionText(null),'');
});
