import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProjectSupervisorModel,modelFailureObservation} from '../src/runtime/project-supervisor-model.js';
import {PROJECT_SUPERVISOR_CONTRACT} from '../src/runtime/project-supervisor-contract.js';
const base={action:'stop',directive:'',reason:'fixture',selectedOption:null,criteria:[],experienceReferences:[]};
const ref=(experienceId='known',extra:any={})=>({experienceId,disposition:'not_adopted',reason:'fixture reason',...extra});
test('R49 production strict experience contract: all fixed subtypes and verified authority boundary',async()=>{
 const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
 const call=async(output:any,supplied:any=[],expected?:string)=>{let calls=0;const text=JSON.stringify(output),pi:any={health:()=>({configured:true}),run:async(i:any)=>{calls++;assert.ok(i.text.startsWith(PROJECT_SUPERVISOR_CONTRACT));assert.ok(i.text.includes('never input.experienceExclusions'));return {text,status:'complete'};}};const model=createProjectSupervisorModel(pi),input={experienceReferences:supplied,experienceExclusions:[{experienceId:'excluded'}]};if(expected){await assert.rejects(model(input),(e:any)=>{assert.equal(e.code,'MODEL_REVIEW_INVALID');assert.equal(e.diagnostics.experience.subtype,expected);assert.equal(e.diagnostics.responseSHA256,hash(text));assert.equal(e.diagnostics.UTF8bytes,Buffer.byteLength(text));const d=modelFailureObservation(e)!;assert.equal(d.experience?.subtype,expected);assert.ok(!JSON.stringify(d).includes('dynamic-secret-key'));return true;});}else assert.deepEqual(await model(input),output);assert.equal(calls,1);};
 await call(base);await call({...base,experienceReferences:[ref()]},[{experienceId:'known',verified:false}]);await call({...base,experienceReferences:[ref('known',{disposition:'adopted'})]},[{experienceId:'known',verified:true}]);
 const known=[{experienceId:'known',verified:false}];
 await call({...base,experienceReferences:undefined},[],'MISSING');await call({...base,experienceReferences:null},[],'ARRAY_TYPE');await call({...base,experienceReferences:[ref()]},[],'COUNT');await call({...base,experienceReferences:[null]},known,'ENTRY_TYPE');await call({...base,experienceReferences:[{...ref(),'dynamic-secret-key':true}]},known,'ENTRY_KEYS');await call({...base,experienceReferences:[ref(7 as any)]},known,'ID_TYPE');await call({...base,experienceReferences:[ref('excluded')]},known,'UNKNOWN_ID');await call({...base,experienceReferences:[ref(),ref()]},[...known,{experienceId:'second'}],'DUPLICATE_ID');
 for(const [field,value,kind] of [['disposition','other','DISPOSITION'],['reason',null,'REASON_TYPE'],['reason','  ','REASON_EMPTY'],['reason','x'.repeat(1001),'REASON_LENGTH'],['disposition','adopted','UNVERIFIED_ADOPTION']] as const)await call({...base,experienceReferences:[ref('known',{[field]:value})]},known,kind);
 await call(base,null,'INPUT_ARRAY');await call(base,[{experienceId:'known'},{experienceId:'known'}],'INPUT_REFERENCE');
 await assert.rejects(createProjectSupervisorModel({health:()=>({configured:true}),run:async()=>({text:JSON.stringify({...base,extra:true}),status:'complete'})} as any)({experienceReferences:[]}),/MODEL_REVIEW_INVALID/);
 console.log(JSON.stringify({scope:'controlled production adapter only; no provider',subtypes:15,noneExplicitArray:true,exclusionsNotReferences:true,strictSixKeys:true,actualPiFixed:false}));
});
