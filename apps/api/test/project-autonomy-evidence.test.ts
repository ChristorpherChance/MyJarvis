import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {evaluateProjectAutonomyEvidence,evaluateAutonomyBudget,evaluateAutonomyProgress,type AutonomyEvidenceCandidate} from '../src/runtime/project-autonomy-evidence.js';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
function fixture(){
 const expected={runId:'validation-run',workspace:'/srv/candidates/factory',goalSpecHash:hash('frozen-goal'),workPackage:'WP-001',objectiveIds:['truthful-status','real-artifact'],sourceFingerprint:hash('current-source'),requiredCheckIds:['test-truthfulness','build'],reviewRunId:'review-run'};
 const validation={schemaVersion:1,kind:'project-autonomy-validation',status:'pass',simulated:false,runId:expected.runId,workspace:expected.workspace,goalSpecHash:expected.goalSpecHash,workPackage:expected.workPackage,sourceFingerprint:expected.sourceFingerprint,sourceStable:true,startedAt:'2026-10-11T01:00:00.000Z',finishedAt:'2026-10-11T01:01:00.000Z',checks:[{id:'test-truthfulness',command:'node --test test/truthfulness.test.mjs',required:true,executed:true,status:'pass',exitCode:0,evidenceSha256:hash('truthfulness-output'),tests:{total:3,passed:3,failed:0,skipped:0,unknown:0}},{id:'build',command:'pnpm build',required:true,executed:true,status:'pass',exitCode:0,evidenceSha256:hash('build-output')}],artifacts:[{path:'dist/main.js',sha256:hash('real-content'),bytes:100}]};
 const candidate=(report:unknown,producer:AutonomyEvidenceCandidate['producer'],runId:string):AutonomyEvidenceCandidate=>{const json=JSON.stringify(report);return {json,sha256:hash(json),producer,run:{id:runId,status:'succeeded',outcome:'success',exitCode:0,lateEvidenceOnly:false,cancelled:false}}};
 const v=candidate(validation,'fixed-validation',expected.runId);
 const review={schemaVersion:1,kind:'project-autonomy-review',status:'pass',simulated:false,runId:expected.reviewRunId,validationRunId:expected.runId,validationReportSha256:v.sha256,workspace:expected.workspace,goalSpecHash:expected.goalSpecHash,workPackage:expected.workPackage,sourceFingerprint:expected.sourceFingerprint,sourceStable:true,startedAt:'2026-10-11T01:01:01.000Z',finishedAt:'2026-10-11T01:02:00.000Z',criteria:[{objectiveId:'truthful-status',outcome:'pass',evidenceRefs:['check:test-truthfulness'],reason:'真实反例测试确认不再放行模拟状态。'},{objectiveId:'real-artifact',outcome:'pass',evidenceRefs:['check:build','artifact:dist/main.js'],reason:'独立固定构建及产物哈希已绑定。'}]};
 const r=candidate(review,'independent-review',expected.reviewRunId);
 return {expected,validation,review,candidate,candidates:{validation:v,review:r},context:{now:'2026-10-11T01:03:00.000Z',maxAgeMs:3600000}};
}
test('同源固定验证和独立review完整覆盖目标才能通过，顺序和hash固定',()=>{
 const f=fixture(),decision=evaluateProjectAutonomyEvidence(f.expected,f.candidates,f.context);assert.equal(decision.outcome,'pass');assert.match(decision.evidenceHash!,/^[a-f0-9]{64}$/);
 assert.deepEqual(evaluateProjectAutonomyEvidence(f.expected,f.candidates,f.context),decision);
 const reordered={...f.expected,objectiveIds:[...f.expected.objectiveIds].reverse()};assert.equal(evaluateProjectAutonomyEvidence(reordered,f.candidates,f.context).evidenceHash,decision.evidenceHash);
});
test('缺固定报告、仅exit0、模型自报完成及单review均不能通过',()=>{
 const f=fixture();assert.equal(evaluateProjectAutonomyEvidence(f.expected,{review:f.candidates.review},f.context).outcome,'unknown');
 f.candidates.validation=f.candidate({summary:'全部已完成',exitCode:0},'fixed-validation',f.expected.runId);assert.equal(evaluateProjectAutonomyEvidence(f.expected,f.candidates,f.context).outcome,'unknown');
});
test('原JSON hash必须匹配，内容修改或重新排版必须重新绑定独立review',()=>{
 const f=fixture();f.candidates.validation.json+=' ';assert.deepEqual(evaluateProjectAutonomyEvidence(f.expected,f.candidates,f.context).reasons,['REPORT_HASH_MISMATCH']);
 f.candidates.validation.sha256=hash(f.candidates.validation.json);assert.deepEqual(evaluateProjectAutonomyEvidence(f.expected,f.candidates,f.context).reasons,['REVIEW_VALIDATION_BINDING_MISMATCH']);
});
test('空分母、重复目标、缺目标、额外目标及未知引用不能放行',()=>{
 for(const change of ['empty','duplicate','missing','extra','unbound','duplicate-ref']){const f=fixture();if(change==='empty')f.expected.objectiveIds=[];if(change==='duplicate')f.expected.objectiveIds.push(f.expected.objectiveIds[0]);if(change==='missing')f.review.criteria.pop();if(change==='extra')f.review.criteria.push({...f.review.criteria[0],objectiveId:'out-of-scope'});if(change==='unbound')f.review.criteria[0].evidenceRefs=['model-said-pass'];if(change==='duplicate-ref')f.review.criteria[0].evidenceRefs.push(f.review.criteria[0].evidenceRefs[0]);f.candidates.review=f.candidate(f.review,'independent-review',f.expected.reviewRunId);assert.equal(evaluateProjectAutonomyEvidence(f.expected,f.candidates,f.context).outcome,'unknown',change);}
});
test('模拟、缺命令、跳过、未执行、未知及测试计数不一致不能通过',()=>{
 for(const change of ['simulated','no-command','skip','unexecuted','unknown','skipped-tests','unknown-tests','inconsistent-tests','no-required','missing-required']){const f=fixture(),v=f.validation as any;if(change==='simulated')v.simulated=true;if(change==='no-command')delete v.checks[0].command;if(change==='skip')v.checks[0].status='skip';if(change==='unexecuted')v.checks[0].executed=false;if(change==='unknown')v.checks[0].status='unknown';if(change==='skipped-tests')v.checks[0].tests={total:3,passed:2,failed:0,skipped:1,unknown:0};if(change==='unknown-tests')v.checks[0].tests={total:3,passed:2,failed:0,skipped:0,unknown:1};if(change==='inconsistent-tests')v.checks[0].tests.total=4;if(change==='no-required')for(const check of v.checks)check.required=false;if(change==='missing-required')v.checks.pop();f.candidates.validation=f.candidate(v,'fixed-validation',f.expected.runId);assert.equal(evaluateProjectAutonomyEvidence(f.expected,f.candidates,f.context).outcome,'unknown',change);}
});
test('失败固定测试即fail；独立review失败即fail且绝不自动accepted',()=>{
 const f=fixture();f.validation.checks[0].status='fail';f.validation.checks[0].exitCode=1;f.candidates.validation=f.candidate(f.validation,'fixed-validation',f.expected.runId);assert.equal(evaluateProjectAutonomyEvidence(f.expected,f.candidates,f.context).outcome,'fail');
 const g=fixture();g.review.criteria[0].outcome='fail';g.candidates.review=g.candidate(g.review,'independent-review',g.expected.reviewRunId);assert.equal(evaluateProjectAutonomyEvidence(g.expected,g.candidates,g.context).outcome,'fail');
});
test('晚到、取消、非终态或退出失败的可信run回执不能复活任务',()=>{
 for(const target of ['validation','review'] as const)for(const change of ['late','cancelled','stop','running','failed','exit']){const f=fixture(),run=f.candidates[target].run;if(change==='late')run.lateEvidenceOnly=true;if(change==='cancelled')run.cancelled=true;if(change==='stop')run.stopRequested=true;if(change==='running')run.status='running';if(change==='failed')run.outcome='failed';if(change==='exit')run.exitCode=1;assert.equal(evaluateProjectAutonomyEvidence(f.expected,f.candidates,f.context).outcome,'unknown',target+change);}
 const f=fixture();assert.deepEqual(evaluateProjectAutonomyEvidence(f.expected,f.candidates,{...f.context,cancelled:true}).reasons,['PROJECT_CANCELLED']);
});
test('run、目录、目标、阶段与当前源码任一变更使旧报告失效',()=>{
 for(const field of ['runId','workspace','goalSpecHash','workPackage','sourceFingerprint'] as const){const f=fixture(),expected={...f.expected};expected[field]=field==='workspace'?'/srv/other':field.endsWith('Hash')||field==='sourceFingerprint'?hash('different'):'different';assert.equal(evaluateProjectAutonomyEvidence(expected,f.candidates,f.context).outcome,'unknown',field);}
 const f=fixture();assert.deepEqual(evaluateProjectAutonomyEvidence(f.expected,f.candidates,{...f.context,currentSourceFingerprint:hash('new-source')}).reasons,['CURRENT_SOURCE_CHANGED']);
 const {sourceFingerprint,...unsealed}=f.expected;assert.equal(evaluateProjectAutonomyEvidence(unsealed,f.candidates,f.context).outcome,'unknown');assert.equal(evaluateProjectAutonomyEvidence(unsealed,f.candidates,{...f.context,currentSourceFingerprint:sourceFingerprint}).outcome,'pass');
});
test('报告过期、未来、倒序或review先于验证都不能通过',()=>{
 const f=fixture();assert.equal(evaluateProjectAutonomyEvidence(f.expected,f.candidates,{...f.context,now:'2026-10-11T03:03:00.000Z'}).outcome,'unknown');
 assert.equal(evaluateProjectAutonomyEvidence(f.expected,f.candidates,{...f.context,now:'2026-10-11T01:01:00.000Z'}).outcome,'unknown');
 const g=fixture();g.review.startedAt='2026-10-11T01:00:59.000Z';g.candidates.review=g.candidate(g.review,'independent-review',g.expected.reviewRunId);assert.deepEqual(evaluateProjectAutonomyEvidence(g.expected,g.candidates,g.context).reasons,['REVIEW_PRECEDES_VALIDATION']);
 const h=fixture();h.review.startedAt='2026-10-11T01:04:00.000Z';h.candidates.review=h.candidate(h.review,'independent-review',h.expected.reviewRunId);assert.equal(evaluateProjectAutonomyEvidence(h.expected,h.candidates,h.context).outcome,'unknown');
});
test('独立review不得是同run；review hash及所有工件路径严格限制',()=>{
 const f=fixture();f.review.runId=f.expected.runId;f.candidates.review=f.candidate(f.review,'independent-review',f.expected.runId);assert.deepEqual(evaluateProjectAutonomyEvidence(f.expected,f.candidates,f.context).reasons,['REVIEW_NOT_INDEPENDENT']);
 for(const path of ['../secret','.secrets/../../secret','/etc/passwd','C:\\secret','a//b','a/./b','a\u0000b']){const g=fixture();g.validation.artifacts[0].path=path;g.candidates.validation=g.candidate(g.validation,'fixed-validation',g.expected.runId);assert.equal(evaluateProjectAutonomyEvidence(g.expected,g.candidates,g.context).outcome,'unknown',path);}
});
test('错误仅包含固定reason codes，不回显凭据或报告解析内容',()=>{
 const f=fixture();f.candidates.validation.json='{"password":"do-not-return-me"';f.candidates.validation.sha256=hash(f.candidates.validation.json);assert.ok(!JSON.stringify(evaluateProjectAutonomyEvidence(f.expected,f.candidates,f.context)).includes('do-not-return-me'));
});
test('费用未知、Token未知、非有限上限、余额不足停止自动派发',()=>{
 const input={spentUSD:3,unknownCostCount:0,usedTokens:3000,maxUSD:10,maxTokens:10000,nextBudgetUSD:2,nextTokenLimit:2000};assert.equal(evaluateAutonomyBudget(input).outcome,'allow');
 for(const patch of [{unknownCostCount:1},{spentUSD:null},{spentUSD:NaN},{usedTokens:null},{usedTokens:1.5},{maxUSD:Infinity},{maxTokens:Infinity},{nextBudgetUSD:8},{nextTokenLimit:8000},{spentUSD:10},{usedTokens:10000}])assert.equal(evaluateAutonomyBudget({...input,...patch}).outcome,'stop');
 assert.equal(evaluateAutonomyBudget({...input,nextBudgetUSD:7,nextTokenLimit:7000}).outcome,'allow');
});
test('稳定源码及相同问题有界停滞；问题修复或源码变化重置重复计数',()=>{
 const current={sourceFingerprint:hash('source'),problemFingerprint:hash('structured-objective-failures')};let result=evaluateAutonomyProgress({current,maxRepeated:3});assert.equal(result.outcome,'progress');result=evaluateAutonomyProgress({previous:result.checkpoint,current,maxRepeated:3});assert.equal(result.outcome,'unchanged');result=evaluateAutonomyProgress({previous:result.checkpoint,current,maxRepeated:3});assert.equal(result.outcome,'stalled');assert.equal(result.checkpoint?.repeated,3);
 assert.equal(evaluateAutonomyProgress({previous:result.checkpoint,current:{...current,problemFingerprint:hash('fewer-failures')},maxRepeated:3}).outcome,'progress');assert.equal(evaluateAutonomyProgress({previous:result.checkpoint,current:{...current,sourceFingerprint:hash('changed-source')},maxRepeated:3}).checkpoint?.repeated,1);
 assert.equal(evaluateAutonomyProgress({current,maxRepeated:Infinity}).outcome,'unknown');
});
