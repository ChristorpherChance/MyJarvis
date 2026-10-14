import assert from 'node:assert/strict';
import test from 'node:test';
import {baselineSnapshot,baselineStatus,baselineTaskRoute,hasBaseline,type BaselineList,type BaselineView,type MainBaselineView} from './project-baseline-view.ts';
const main:MainBaselineView={taskId:'main-task',runId:'main-run',taskStatus:'running',runStatus:'running',status:'running',sourceRole:'current-main',workspace:'/main',sourceFingerprint:null,usage:{knownCostUSD:0,tokens:0,unknownCostCount:1},validationExitCode:null,summary:'narrow only'};
const candidate:BaselineView={id:'candidate',projectId:'project',revision:2,profileRevision:10,workPackage:'FA-01',objectiveIds:['OBJ-001'],totalObjectiveCount:74,goalSpecHash:'goal',sourceFingerprint:'source',sourceRole:'frozen-candidate',executorId:'fixed',machineId:'machine',workspace:'/candidate',taskId:'candidate-task',runId:'candidate-run',createdAt:'2026-10-11',reason:'comparison',status:'running',taskStatus:'running',runStatus:'running',reportStatus:null,reportSha256:null,checks:[],summary:'candidate only',usage:{knownCostUSD:0,tokens:0,unknownCostCount:1},projectBudget:{spentUSD:0,usedTokens:0,unknownCostCount:2,activeRuns:[]},objectivesAccepted:false,verifiedObjectiveIds:[],currentMainBaseline:main};
const list:BaselineList={items:[candidate],latest:candidate,total:1,offset:0,nextOffset:null,currentMainBaseline:main};
test('main与候选保留各自真实运行及来源，不混用任务或结果',()=>{
 const snapshot=baselineSnapshot('project',list);assert.equal(snapshot.main,main);assert.equal(snapshot.latest,candidate);assert.equal(snapshot.main?.runId,'main-run');assert.equal(snapshot.latest?.runId,'candidate-run');assert.equal(hasBaseline(snapshot,'project'),true);assert.equal(hasBaseline(snapshot,'another'),false);
});
test('无候选时主线真实窄检查可显示，无新检查保持旧监督界面',()=>{
 assert.equal(hasBaseline(baselineSnapshot('project',{...list,items:[],latest:null,total:0}),'project'),true);
 assert.equal(hasBaseline(baselineSnapshot('project',{...list,items:[],latest:null,total:0,currentMainBaseline:null}),'project'),false);
});
test('跨项目或错来源拒收，旧响应不能绑定到切换后的项目',()=>{
 assert.throws(()=>baselineSnapshot('another',list),/不匹配/);
 assert.throws(()=>baselineSnapshot('project',{...list,currentMainBaseline:{...main,projectId:'another'}}),/不匹配/);
 assert.throws(()=>baselineSnapshot('project',{...list,latest:{...candidate,sourceRole:'current-main'} as unknown as BaselineView}),/不匹配/);
});
test('运行中不能因旧pass报告呈现通过，观察终态只描述固定范围',()=>{
 assert.equal(baselineStatus({...candidate,reportStatus:'pass'},true).label,'固定检查进行中');
 assert.equal(baselineStatus({...candidate,status:'observed',runStatus:'succeeded',taskStatus:'completed',reportStatus:'pass'},true).label,'本批固定检查通过');
 assert.equal(baselineStatus({...main,status:'observed',runStatus:'succeeded',taskStatus:'completed',validationExitCode:0},false).label,'窄检查已结束，查看结果');
 assert.equal(candidate.objectivesAccepted,false);assert.deepEqual(candidate.verifiedObjectiveIds,[]);
});
test('暂停取消失败与未知真实保留，不给假恢复状态',()=>{
 for(const taskStatus of ['paused','cancelled','waitingUser'])assert.equal(baselineStatus({...candidate,status:'observed',taskStatus,runStatus:'succeeded',reportStatus:'pass'},true).label,'已暂停或停止');
 for(const runStatus of ['failed','timeout'])assert.equal(baselineStatus({...main,status:'observed',taskStatus:'failed',runStatus},false).tone,'failed');
 assert.equal(baselineStatus({...candidate,status:'blocked'},true).tone,'failed');
 assert.equal(baselineStatus({...candidate,status:'observed',taskStatus:'completed',runStatus:'succeeded',reportStatus:'unknown'},true).label,'检查已结束，结果待核对');
});
test('只导航真实既有任务，缺任务不生成执行入口',()=>{
 assert.equal(baselineTaskRoute(undefined),null);assert.equal(baselineTaskRoute('task/a?b'),'tasks/task%2Fa%3Fb');
});
