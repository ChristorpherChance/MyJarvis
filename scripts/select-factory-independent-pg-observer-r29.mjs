/** Append one selected decision only. No notes, plans, model or execution writes. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';

const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',constructionId='25dcc5cf-bdfe-43f8-bbff-e79e7190161f';
const goal='23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42',source='4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493';
const runId='d9f1095aae0edc1b848487b1b567f3be29f25f3b',taskId='c45462b0-6a28-433c-af8c-d656bd1d2ad3';
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const need=(value,code)=>{if(!value)throw Error(code);};
const referencePaths=[
 ['artifacts/software-factory/autonomy-r22/objectives.json','requirement','f12400050a791b2765951e501142f1f4aa1aac19a388d9564fd651cde6e90158'],
 ['artifacts/software-factory/goals-r29/frozen-source-export-1791820634349-291ed43f-893c-4f9d-b45c-53f055b5af3d.json','source','ece7a3064b6d90d62bef7439012043fea8ca289cd308a07100d562ad11110028'],
 ['artifacts/software-factory/goals-r29/test-dependency-observation-1791821654161-158a84d5-5f79-47fc-9355-ff60427a803c.json','observation',null],
 ['artifacts/software-factory/goals-r29/truth-gate-validation-environment-contract-1791816977968-f9f5bf56-518b-470e-960a-8b60326c60e8.json','observation','e41260449f89f4cc533de79f79b6e6bbcd42f03e2648971932989690785a983d'],
 ['artifacts/software-factory/goals-r29/truth-gate-probe-coordinator-contract-1791822696925-7b55bc83-0a0e-40c3-9ecd-644bd7d5e154.json','observation','5393c0f6f7a6ca0cffb814c462a8a9cf31772f5c67de5f85458973c0a2e213f2'],
 ['artifacts/software-factory/goals-r29/truth-gate-33case-probe-independent-review-1791822790123-36b4d14b-b1f4-4cc2-84e3-90a34e0f3b15.json','observation','5693aa46d97bde0776c4bba3229acacfb1012c2030304d2fc6c4d32ceb392652'],
];
const objectives=['MSF-OBJ-033','MSF-OBJ-040','MSF-OBJ-041','MSF-OBJ-043','MSF-OBJ-074'];
async function intent(){
 const basisRefs=[];for(const [reference,kind,expected] of referencePaths){const raw=await readFile(reference),hash=sha(raw);need(!expected||hash===expected,'R29_PG_CHOICE_SOURCE_CHANGED');basisRefs.push({reference,sha256:hash,kind});}
 const at=new Date().toISOString();return {commandId:randomUUID(),expectedVersion:0,changeOf:null,questionSummary:'真实HTTP/SQL证据门复验的数据库观察器应复用候选依赖，还是独立冻结只读客户端？',
 context:{observedAt:at,goalSpecHash:goal,sourceFingerprint:source,sourceVersion:'R29已冻结621文件候选；本决策仅选择后续独立验证方法',runId,taskId,machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',objectives,
  constraints:['原74目标编号及历史失败/决策/费用保持；费用和Token只记录，无消费上限','API和probe的全部候选/依赖代码均UID1000/GID1000，禁止root执行','现有只读缓存目录与锁定pg8.23.0提供准备可行性依据，不等于闭包完整、QA-runtime已建立或产品通过','未知来源、hash或额外文件不完整则停止独立DB验证；不得退回候选SQL客户端制造通过','本次只写selected决策，不改变计划/备注/profile20/globalfalse、不派发、安装或部署'],
  situation:'621源码已冻结并恢复原执行配置；独立33项HTTP/SQL工具只有本机边界及静态准备审查。当前工具SQL客户端仍从候选安装目录加载，候选构建可能改写该目录。原source锁定pg8.23.0，既有离线缓存目录实际可读但完整包闭包尚未验证；需在候选API执行前另建受控只读观察器。'},
 options:[
  {id:'candidate-pg',title:'复用候选node_modules中的pg',advantages:['安装和加载路径简单','沿用候选已有依赖'],disadvantages:['可能随候选安装或构建改写','观察器与被测代码共用可变依赖，独立性不足'],impact:'无需另建运行时，但不能作为独立SQL真实性验收依据。',compliesWithGoals:'unknown',withinAuthority:'yes',environmentEvidence:'available',missingEvidence:['候选依赖构建前后不可改写及观察器独立性的证据'],reversibility:'reversible',coveredObjectives:objectives,operationalImpact:0},
  {id:'independent-readonly-pg',title:'独立离线构建并冻结只读pg8.23.0观察器',advantages:['SQL观察器闭包与候选安装/构建分离','精确版本、完整字节及内部链接可由根控制校验'],disadvantages:['需要额外离线安装、闭包冻结和只读挂载','缓存不完整或校验失败时须停止复验'],impact:'使用独立package.json exact pg8.23.0，offline/ignore-scripts/package-import-method=copy准备QA-runtime；root控制冻结和只读挂载，probe使用固定/qa-runtime/package.json加载。候选API继续使用自身依赖。',compliesWithGoals:'yes',withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'reversible',coveredObjectives:objectives,operationalImpact:1},
 ],chosenId:'independent-readonly-pg',decisionRationale:'按用户要求的严格可追溯验收选择与候选分离的观察器。现有锁文件及缓存可达性足以选择准备方法；完整runtime尚未准备，只有其后真实闭包/hash/只读实证全部通过才能实施独立DB复验。未知或漂移时保留失败并停下，不回退候选客户端假通过。',basisRefs,risk:'medium',affectedObjectives:objectives,
 rollbackPlan:{plan:'尚未实施；若独立缓存/版本/闭包/hash/内部链接/额外文件校验失败，停止新的DB/API验收，保留旧53d工具及全部失败历史，补齐来源或追加新工具/环境决策后再验证。不得将候选pg作为替代观察器记通过。',triggers:['离线pg8.23.0闭包不完整','任何来源或完整字节hash漂移','目录链接逃出固定QA-runtime或出现额外/未知文件','候选获得观察器或其证据输出控制'],impact:'只影响新独立QA准备/验收，不回退产品源码、恢复/派发执行模板或删除旧证据。',requiresNewExecutionPlan:true},
 actions:[{summary:'已选择独立只读PG准备方法；QA-runtime安装/冻结/挂载及33项真实DB/API复验尚未执行，后续实施与验收分别追加证据。',at,state:'planned',evidenceRefs:basisRefs}],status:'selected',origin:'ai'};
}
async function snapshots(api){
 const get=async p=>(await api(p)).data;
 const [profile,global,plan,project,construction]=await Promise.all([get('/api/v1/projects/'+projectId+'/autonomy'),get('/api/v1/execution/supervision'),get('/api/v1/projects/'+projectId+'/supervision-plans/40066986-8253-4cc4-9876-ae6eaede9e0b'),get('/api/v1/projects/'+projectId),get('/api/v1/projects/'+constructionId)]);
 need(profile.revision===20&&profile.goalSpecHash===goal&&profile.config?.costPolicy==='record-only'&&global.supervised===false&&global.stopped===false,'R29_PG_CHOICE_PROFILE_GLOBAL_CHANGED');
 const decisions=[];let offset=0;for(;;){const page=await get('/api/v1/projects/'+projectId+'/decisions?limit=100&offset='+offset);decisions.push(...page.items);if(page.nextOffset===null)break;offset=page.nextOffset;need(offset<10000,'R29_PG_CHOICE_DECISION_RANGE');}
 return {profile,global,plan,project,construction,decisions};
}
const args=process.argv.slice(2);need(args.length<=1&&['--inspect','--execute'].includes(args[0]??'--inspect'),'R29_PG_CHOICE_ARGUMENTS_INVALID');
const directory='artifacts/software-factory/goals-r29';await mkdir(directory,{recursive:true});const payload=await intent();
const intentPath=directory+'/independent-pg-observer-choice-intent-'+Date.now()+'-'+randomUUID()+'.json',intentRaw=JSON.stringify(payload,null,2)+'\n';await writeFile(intentPath,intentRaw,{flag:'wx'});
let receipt={schemaVersion:1,kind:'software-factory-r29-independent-pg-observer-selection',at:payload.context.observedAt,intent:{reference:intentPath,sha256:sha(intentRaw)},projectId,goalSpecHash:goal,sourceFingerprint:source,sourceFiles:621,taskId,runId,chosenId:payload.chosenId,status:'not-submitted',implementation:false,independentAcceptance:false,runtimePrepared:false,productChecksExecuted:0,modelsInvoked:false,productAccepted:false,notesChanged:false,sourceCodeChanged:false,automaticDispatch:false};
if(args[0]==='--execute')try{
 receipt=await withPlatform(async({api})=>{const before=await snapshots(api),value=(await api('/api/v1/projects/'+projectId+'/decisions',payload)).data;
  need(value.revision===1&&value.status==='selected'&&value.chosenId===payload.chosenId&&value.independentAcceptance===false&&value.actions.every(x=>x.state==='planned'),'R29_PG_CHOICE_WRITE_RESPONSE_CHANGED');
  const stored=(await api('/api/v1/projects/'+projectId+'/decisions/'+value.id)).data,after=await snapshots(api);
  need(stored.revision===1&&stored.hash===value.hash&&stored.revisions?.length===1,'R29_PG_CHOICE_READBACK_CHANGED');
  for(const key of ['profile','global','plan','project','construction'])need(sha(before[key])===sha(after[key]),'R29_PG_CHOICE_OTHER_METADATA_CHANGED');
  need(after.decisions.length===before.decisions.length+1&&before.decisions.every(x=>after.decisions.some(y=>x.id===y.id&&sha(x)===sha(y))),'R29_PG_CHOICE_OLD_DECISIONS_CHANGED');
  return {...receipt,at:new Date().toISOString(),status:'selected',decisionId:value.id,decisionRevision:1,decisionSHA256:value.hash,basisRefs:payload.basisRefs,oldDecisionsPreserved:true,oldNotesPlansProfileAndGlobalPreserved:true,profileRevision:after.profile.revision,planRevision:after.plan.revision,projectRevisions:[after.project.revision,after.construction.revision],globalSupervised:after.global.supervised,globalStopped:after.global.stopped};
 });
}catch(e){receipt={...receipt,failed:true,errorCode:/^R29_PG_CHOICE_[A-Z_]+$/.test(e.message)?e.message:'R29_PG_CHOICE_OPERATION_FAILED',reconciliationRequired:true,automaticRetry:false,rawErrorExported:false};process.exitCode=1;}
const out=directory+'/independent-pg-observer-choice-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(receipt,null,2)+'\n';await writeFile(out,raw,{flag:'wx'});console.log(JSON.stringify({output:out,sha256:sha(raw),status:receipt.status,decisionId:receipt.decisionId??null,failed:receipt.failed??false,implementation:false,productChecksExecuted:0}));
