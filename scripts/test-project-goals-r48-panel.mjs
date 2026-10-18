import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
import test from 'node:test';

test('R48 real autonomy panel shows own goals and stages; old denominator exists only in replaced history',async()=>{
 const dir=await mkdtemp(resolve('.r43-tools/r48-panel-'));try{
  const react=resolve('node_modules/react/index.js'),shim=join(dir,'hooks.mjs'),out=join(dir,'panel.mjs');
  await writeFile(shim,`export * from ${JSON.stringify(react)};import R from ${JSON.stringify(react)};export default R;export const useState=v=>[globalThis.__r48states?.length?globalThis.__r48states.shift():typeof v==='function'?v():v,()=>{}];export const useRef=v=>({current:v});export const useEffect=()=>{};`);
  await build({entryPoints:['apps/web/src/features/operations/ProjectAutonomyPanel.tsx'],outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',loader:{'.css':'empty'},plugins:[{name:'hooks',setup(b){b.onResolve({filter:/^react$/},()=>({path:shim}));}}],logLevel:'silent'});
  const Panel=(await import(pathToFileURL(out).href)).default;
  const profile={projectId:'p',revision:20,status:'blocked',reason:'REPAIR_ATTEMPTS_EXHAUSTED',goalSpecHash:'a'.repeat(64),spec:{version:'history',objectives:Array.from({length:74},(_,i)=>({id:'old-'+i,title:'历史目标'+i,acceptance:[],workPackage:'old'})),workPackages:[{id:'old',title:'旧执行包'}]},stages:[],verifiedObjectiveIds:[],config:{maxAttempts:1,maxUSD:null,maxTokens:null,costPolicy:'record-only',workspace:'/fixture'},budget:{spentUSD:null,usedTokens:null,unknownCostCount:1},events:[],updatedAt:'2026-10-18'};
  const plan={projectId:'p',planId:'plan',revision:1,goalBasis:'plan',supersedesPlanId:'old-plan',supersedesRevision:108,mode:'acceptance',title:'新的现行计划',goal:'当前自有目标全文',currentStepId:'verify',nextAction:'按真实报告修复',latestResult:null,independentProgress:{available:false,totalObjectives:null,verifiedObjectiveIds:null},steps:[{id:'verify',title:'既有成果核验',goal:'本阶段核验真实成果',state:'planned',nextAction:'核对证据',activeRunIds:[],runs:[],latestResult:null},{id:'repair',title:'后续实际产品修复',goal:'依据缺陷修复',state:'planned',nextAction:null,activeRunIds:[],runs:[],latestResult:null}]};
  const props={projectId:'p',navigate:()=>{},machines:[]};
  const render=p=>{globalThis.__r48states=[profile,true,false,null,'','','','',null,null,'',null,p,''];const tree=Panel(props);delete globalThis.__r48states;return renderToStaticMarkup(tree);};
  const html=render(plan),marker=html.indexOf('已被替代 · 旧目标与开发监督历史');assert.ok(marker>0);const current=html.slice(0,marker);
  assert.ok(current.includes(plan.goal));assert.ok(current.includes('既有成果核验'));assert.ok(current.includes('后续实际产品修复'));assert.ok(current.includes('待验证'));assert.ok(!current.includes('0 / 74'));assert.ok(!current.includes('0 / 12'));assert.ok(html.slice(marker).includes('0 / 74'));assert.ok(html.slice(marker).includes('历史目标73'));
  const legacy=render(null);assert.ok(legacy.includes('0 / 74'));assert.ok(!legacy.includes('已被替代 · 旧目标'));
  const unchanged=render({...plan,goalBasis:'legacy-autonomy'});assert.ok(unchanged.includes('0 / 74'));assert.ok(!unchanged.includes('已被替代 · 旧目标'));
  console.log(JSON.stringify({productionPanel:true,ownGoalAndCurrentFutureStages:true,noCurrentLegacyDenominator:true,unknownAcceptance:'待验证',historical74Retained:true,noReplacementCompatible:true,scope:'isolated component SSR, not browser or live acceptance'}));
 }finally{delete globalThis.__r48states;await rm(dir,{recursive:true,force:true});}
});
