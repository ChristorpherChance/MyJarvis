import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
const dir=await mkdtemp(resolve('.r43-tools/render-r44-'));
try{
 const reactPath=resolve('node_modules/react/index.js');
 const state={tasks:[{taskId:'positive',title:'known-positive',tokensUsed:12345},{taskId:'zero',title:'known-zero',tokensUsed:0},{taskId:'omitted',title:'unknown-omitted'},{taskId:'null',title:'unknown-null',tokensUsed:null},{taskId:'nan',title:'unknown-nan',tokensUsed:NaN},{taskId:'infinity',title:'unknown-infinity',tokensUsed:Infinity}].map(t=>({...t,machineId:'m',executorId:'cc',status:'paused',lastActivityAt:'2026-10-17T00:00:00Z',tokenLimit:1000000,billing:'record-only'}))};
 const shim=join(dir,'react-state.mjs');await writeFile(shim,`export * from ${JSON.stringify(reactPath)};import React from ${JSON.stringify(reactPath)};export default React;let calls=0;export const useState=(initial)=>{const stack=new Error().stack||'';if(stack.includes('DevelopmentSupervisionPanel')){const n=calls++;return [n===0?globalThis.__r44state:n===1?{templates:[]}:typeof initial==='function'?initial():initial,()=>{}];}return React.useState(initial);};export const useEffect=()=>{};`);
 const out=join(dir,'panel.mjs');await build({entryPoints:['apps/web/src/features/operations/DevelopmentSupervisionPanel.tsx'],outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',plugins:[{name:'preloaded-state',setup(b){b.onResolve({filter:/^react$/},()=>({path:shim}));}}],logLevel:'silent'});
 globalThis.__r44state=state;const {DevelopmentSupervisionPanel}=await import(pathToFileURL(out).href);const html=renderToStaticMarkup(React.createElement(DevelopmentSupervisionPanel,{data:{machines:[{id:'m',name:'fixture'}]},navigate:()=>{}}));
 for(const t of state.tasks)assert.ok(html.includes(t.title),'all known/unknown rows remain rendered');
 assert.match(html,/12,345/);assert.match(html,/>0 \/ /);assert.equal((html.match(/<td>未知 \/ /g)||[]).length,4);console.log(JSON.stringify({status:'passed',productionComponent:'DevelopmentSupervisionPanel',renderer:'react-dom/server',environment:'preloaded HTTP state via hook boundary; no online browser',rows:6,unknownRows:4,knownZero:true,knownPositive:true}));
}finally{delete globalThis.__r44state;await rm(dir,{recursive:true,force:true});}
