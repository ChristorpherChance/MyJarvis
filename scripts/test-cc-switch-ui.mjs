import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const machines=[{id:'m101',host:'101',name:'开发节点',address:'192.168.10.101'},{id:'m112',host:'112',name:'贾维斯',address:'192.168.10.112'},{id:'m116',host:'116',name:'标书开发',address:'192.168.10.116'}];
const models={opus:'main-1m',sonnet:'lite-1m',haiku:'lite',fable:'main-1m',subagent:'lite-1m'};
const provider={id:'current',name:'当前配置',baseUrl:'https://provider.example.com',model:'main-1m',models,authType:'auth-token',credentialConfigured:true,isCurrent:true,revision:'a'.repeat(64)};
const alternate={...provider,id:'alternative',name:'备用配置',isCurrent:false,revision:'b'.repeat(64)};
const snapshot={machineId:'m112',host:'112',application:'claude',observedAt:'2026-10-20T04:00:00.000Z',currentProviderId:'current',providers:[provider,alternate]};
const nodes=(tree)=>{if(Array.isArray(tree))return tree.flatMap(nodes);if(!React.isValidElement(tree))return [];return [tree,...nodes(tree.props.children)];};
const text=(tree)=>Array.isArray(tree)?tree.map(text).join(''):React.isValidElement(tree)?text(tree.props.children):String(tree??'');
const named=(tree,name)=>nodes(tree).filter(node=>typeof node.type==='function'&&node.type.name===name);
const buttons=(tree,label)=>named(tree,'Button').filter(node=>text(node)===label);

test('CC Switch target selection, secret form, mutation scope and concurrency boundaries',async()=>{
 const dir=await mkdtemp(resolve('.cc-switch-ui-'));
 try{
  const shim=join(dir,'hooks.mjs'),runtime=join(dir,'runtime.mjs'),output=join(dir,'panel.mjs');
  await writeFile(shim,`export * from ${JSON.stringify(resolve('node_modules/react/index.js'))}; export const useEffect=()=>{}; export const useRef=v=>({current:v}); export const useState=v=>{const index=globalThis.__ui.index++;return [globalThis.__ui.states.length?globalThis.__ui.states.shift():typeof v==='function'?v():v,next=>globalThis.__ui.changes.push({index,next})]};`);
  await writeFile(runtime,`export const usePrivateRuntime=reset=>{globalThis.__ui.resets.push(reset);return (...args)=>globalThis.__ui.request(...args)};`);
  await build({entryPoints:['apps/web/src/features/operations/CcSwitchPanel.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',loader:{'.css':'empty'},plugins:[{name:'hook-boundary',setup(b){b.onResolve({filter:/^react$/},()=>({path:shim}));b.onResolve({filter:/usePrivateRuntime$/},()=>({path:runtime}));}}],logLevel:'silent'});
  const Panel=(await import(pathToFileURL(output).href)).default;
  const state=(states,request=async()=>snapshot)=>globalThis.__ui={states:[...states],index:0,changes:[],resets:[],request};
  state([machines,true,'m112',false,'',false,false]);const root=Panel({}),machineNode=named(root,'MachineProviders')[0];assert.equal(machineNode.props.machine.id,'m112');
  const picker=named(root,'MachinePicker')[0];const pickerHtml=renderToStaticMarkup(picker);assert.equal((pickerHtml.match(/aria-pressed=/g)||[]).length,3);assert.ok(pickerHtml.includes('aria-pressed="true"'));assert.ok(pickerHtml.includes('192.168.10.101'));
  const render=(extra={},request)=>{state([snapshot,false,false,'','',null,null,false].map((value,index)=>Object.hasOwn(extra,index)?extra[index]:value),request);return machineNode.type(machineNode.props)};
  let tree=render(),html=renderToStaticMarkup(tree);assert.ok(html.includes('正在管理：112'));assert.ok(html.includes('API Key 已配置'));assert.ok(html.includes('https://provider.example.com'));assert.equal(buttons(tree,'删除')[0].props.disabled,true);assert.equal(buttons(tree,'删除')[1].props.disabled,false);assert.equal(buttons(tree,'已启用')[0].props.disabled,true);assert.ok(html.includes('删除此项前，请先切换到其他配置'));
  const form={id:alternate.id,revision:alternate.revision,name:alternate.name,baseUrl:alternate.baseUrl,model:alternate.model,models:alternate.models,authType:alternate.authType,apiKey:'',commandId:'11111111-1111-4111-8111-111111111111'};
  tree=render({5:form});html=renderToStaticMarkup(tree);assert.match(html,/<input[^>]*aria-label="API Key"[^>]*type="password"[^>]*autoComplete="off"[^>]*value=""/i);assert.ok(html.includes('留空保留已有密钥'));assert.ok(html.includes('保存到 112'));
  let captured;tree=render({5:form},async(...args)=>{captured=args;return snapshot});await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(captured[0],'/api/runtime/cc-switch/machines/m112/providers/alternative');assert.equal(captured[1],'PATCH');assert.equal(captured[2].expectedRevision,alternate.revision);assert.equal(Object.hasOwn(captured[2].provider,'apiKey'),false);
  tree=render({5:{...form,apiKey:'synthetic-only-value'}},async(...args)=>{captured=args;return snapshot});await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(captured[2].provider.apiKey,'synthetic-only-value');assert.ok(globalThis.__ui.changes.some(change=>change.index===5&&change.next===null));
  const newForm={...form,id:undefined,revision:undefined,name:'新增最简配置',model:' main-default ',apiKey:'synthetic-create-value',models:{opus:'',sonnet:'',haiku:'',fable:'',subagent:''}};
  tree=render({5:newForm},async(...args)=>{captured=args;return snapshot});await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(captured[0],'/api/runtime/cc-switch/machines/m112/providers');assert.equal(captured[1],'POST');assert.equal(captured[2].provider.model,'main-default');assert.deepEqual(captured[2].provider.models,{opus:'main-default',sonnet:'main-default',haiku:'main-default',fable:'main-default',subagent:'main-default'},'new providers with optional role fields empty follow the main model');assert.equal(captured[2].provider.apiKey,'synthetic-create-value');
  tree=render({5:{...newForm,models:{...newForm.models,sonnet:' explicit-lite '}}},async(...args)=>{captured=args;return snapshot});await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(captured[2].provider.models.sonnet,'explicit-lite');assert.equal(captured[2].provider.models.opus,'main-default');
  let resolveRequest,calls=0;tree=render({},()=>{calls++;return new Promise(resolve=>resolveRequest=resolve)});const switchButton=buttons(tree,'切换到此配置')[0];switchButton.props.onClick();switchButton.props.onClick();assert.equal(calls,1);resolveRequest(snapshot);await new Promise(resolve=>setImmediate(resolve));
  tree=render({2:true});for(const button of named(tree,'Button'))assert.equal(button.props.disabled,true,'all machine mutation controls disabled in flight');
  tree=render({5:form},async()=>{const error=new Error('outdated');error.status=409;throw error});await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.ok(globalThis.__ui.changes.some(change=>change.index===3&&String(change.next).includes('请刷新')));assert.ok(!globalThis.__ui.changes.some(change=>change.index===5&&change.next===null),'conflict retains form without silently rebasing');
  tree=render({5:form});globalThis.__ui.resets[0]();assert.ok(globalThis.__ui.changes.some(change=>change.index===0&&change.next===null));assert.ok(globalThis.__ui.changes.some(change=>change.index===5&&change.next===null));assert.ok(globalThis.__ui.changes.some(change=>change.index===7&&change.next===true));
  tree=render({},async()=>({...snapshot,machineId:'m116'}));await buttons(tree,'切换到此配置')[0].props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.ok(globalThis.__ui.changes.some(change=>change.index===3&&String(change.next).includes('目标机器回执不匹配')));assert.ok(!globalThis.__ui.changes.some(change=>change.index===0&&change.next?.machineId==='m116'));
  const route=await readFile('apps/web/src/features/operations/ActualOperationsControl.tsx','utf8'),embedded=await readFile('apps/web/src/features/operations/AiDevelopmentPanel.tsx','utf8');assert.ok(route.includes("if(id==='cc-switch')setTab('cc-switch')"));assert.ok(route.includes("['cc-switch','终端模型']"));assert.ok(embedded.includes('<CcSwitchPanel machineId={machineId}/>'));
  console.log(JSON.stringify({scope:'production UI with synthetic hook/API boundary; not browser or supplier-call acceptance',targetSelection:true,credentialNonEcho:true,blankCredentialPreserved:true,optionalRolesFollowMain:true,explicitRolesPreserved:true,concurrentMutationGuard:true,currentDeleteBlocked:true,conflictKept:true,authReset:true,wrongMachineRejected:true,routedAndEmbedded:true}));
 }finally{delete globalThis.__ui;await rm(dir,{recursive:true,force:true})}
});
