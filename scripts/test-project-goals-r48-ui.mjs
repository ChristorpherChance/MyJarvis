import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
import test from 'node:test';

// Real component + shared Button handler; only hooks and DOM boundary are isolated.
// This is not a browser, production, or independent acceptance test.
test('question details button keeps the project hash and opens all original content',async()=>{
 const dir=await mkdtemp(resolve('.r43-tools/r48-ui-'));
 const original={document:globalThis.document,HTMLDetailsElement:globalThis.HTMLDetailsElement,location:globalThis.location};
 try{
  const react=resolve('node_modules/react/index.js'),shim=join(dir,'hooks.mjs');
  await writeFile(shim,`export * from ${JSON.stringify(react)};import R from ${JSON.stringify(react)};export default R;export const useState=v=>[v===null?globalThis.__r48context:typeof v==='function'?v():v,()=>{}];export const useRef=v=>({current:v});export const useEffect=()=>{};`);
  const out=join(dir,'workbench.mjs');
  await build({entryPoints:['apps/web/src/features/operations/ProjectWorkbenchPage.tsx'],outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',loader:{'.css':'empty'},plugins:[{name:'state-boundary',setup(b){b.onResolve({filter:/^react$/},()=>({path:shim}));}}],logLevel:'silent'});
  const {EntityWorkbench}=await import(pathToFileURL(out).href);
  const question='本人问题完整保留'.repeat(35),options=['完整选项甲'.repeat(40),'完整选项乙'.repeat(40)],blocker='旧报告采集阻塞继续保留';
  globalThis.__r48context={project:{id:'p',goal:'fixture'},supervisor:{session:{status:'waiting_user',blocker,criteria:[]},events:[{feedback:{question,options,summary:'已保存结果'.repeat(80)}}]},choices:[],pending:[],execution:{}};
  const props={projectId:'p',projectName:'fixture',params:new URLSearchParams(),data:{projects:[{id:'p',name:'fixture'}],machines:[],tasks:[],experiences:[]},navigate:()=>assert.fail('must not navigate')};
  const tree=EntityWorkbench(props);
  function all(node,predicate,result=[]){if(Array.isArray(node)){for(const child of node)all(child,predicate,result);}else if(React.isValidElement(node)){if(predicate(node))result.push(node);all(node.props.children,predicate,result);}return result;}
  const entry=all(tree,n=>n.props.children==='查看问题全文 / 全部选项');assert.equal(entry.length,1);
  const button=entry[0].type(entry[0].props);assert.equal(button.type,'button');assert.equal(button.props.type,'button');assert.equal(button.props.href,undefined);
  const detailTree=all(tree,n=>n.props.id==='workbench-question-details')[0];assert.ok(detailTree);
  const detailHtml=renderToStaticMarkup(detailTree);assert.ok(detailHtml.includes(question));for(const option of options)assert.ok(detailHtml.includes(option));assert.ok(detailHtml.includes(blocker));
  const html=renderToStaticMarkup(tree),grid=html.slice(html.indexOf('<dl>'),html.indexOf('</dl>'));assert.ok(grid.includes(blocker));assert.ok(!grid.includes(question));assert.ok(!grid.includes('已保存结果'.repeat(80)));const resultText=grid.match(/<dt>最近结果<\/dt><dd>([^<]*)<\/dd>/)[1];assert.ok(resultText.length<=90);
  let hash='#view=projects%2Fp&theme=stark',writes=0,scrolled=0;
  globalThis.location={get hash(){return hash},set hash(v){writes++;hash=v}};
  class Details{open=false;scrollIntoView(options){assert.equal(options.block,'nearest');scrolled++;}}
  const detail=new Details();globalThis.HTMLDetailsElement=Details;globalThis.document={getElementById:id=>{assert.equal(id,'workbench-question-details');return detail;}};
  const before=location.hash;button.props.onClick();assert.equal(detail.open,true);assert.equal(scrolled,1);assert.equal(location.hash,before);assert.equal(writes,0);
  assert.equal(globalThis.__r48context.project.id,'p');assert.ok(renderToStaticMarkup(detailTree).includes(question));
  console.log(JSON.stringify({realComponent:true,realSharedButton:true,realOnClickInvoked:true,detailsOpen:true,scrolled:true,hashWrites:writes,sameProject:'p',fullQuestionAndOptions:true,oldBlockerRetained:true,scope:'isolated handler/DOM boundary, not browser or site acceptance'}));
 }finally{delete globalThis.__r48context;for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}await rm(dir,{recursive:true,force:true});}
});
