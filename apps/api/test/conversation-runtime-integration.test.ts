import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/app.js';
import type {PiService,PiRunInput} from '../src/pi.js';

test('完整应用将冻结提醒接入实际调度，并仅向当前认证对话提供只读Pi工具',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-conversation-integration-')),calls:PiRunInput[]=[];
 const dueAt=new Date(Date.now()+3600_000).toISOString();
 const pi={initialize:async()=>{},dispose:async()=>{},abort:async()=>{},removeConversationSession:async()=>{},modelIsLocal:async()=>true,health:()=>({configured:true}),run:async(input:PiRunInput)=>{calls.push(input);return {status:'complete',text:input.boundedJob?JSON.stringify({mode:'proposal',alternatives:[{action:'reminder.create',title:'英语练习',content:'练习英语',dueAt}]}):'已查询当前成员的真实事项。'};}} as unknown as PiService;
 const runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'absent')});
 try{
  const setup=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'Conversation-integration-passphrase'}});assert.equal(setup.statusCode,200,setup.body);
  const headers={cookie:String(setup.headers['set-cookie']).split(';')[0]};
  const send=async(url:string,payload?:unknown)=>runtime.app.inject({method:payload===undefined?'GET':'POST',url,headers,...(payload===undefined?{}:{payload})});
  for(const url of ['/api/runtime/notifications','/api/runtime/family/weather/preferences'])assert.equal((await runtime.app.inject({url})).statusCode,401);
  const session=await send('/api/runtime/voice/sessions',{terminalId:'local',roomId:'study'});assert.equal(session.statusCode,200,session.body);
  const proposalResponse=await send(`/api/runtime/voice/sessions/${session.json().id}/intent`,{text:'一小时后提醒我练习英语'});assert.equal(proposalResponse.statusCode,200,proposalResponse.body);const proposal=proposalResponse.json().proposal;
  assert.equal((await send('/api/runtime/notifications/reminders')).json().items.length,0);
  const selection={alternativeId:proposal.alternatives[0].id,expectedVersion:1,confirmed:true};
  const confirmed=await send(`/api/runtime/voice/intents/${proposal.id}/confirm`,selection);assert.equal(confirmed.statusCode,200,confirmed.body);
  const replay=await send(`/api/runtime/voice/intents/${proposal.id}/confirm`,selection);assert.equal(replay.statusCode,200,replay.body);assert.deepEqual(replay.json().receipt,confirmed.json().receipt);
  const reminders=(await send('/api/runtime/notifications/reminders')).json().items;assert.equal(reminders.length,1);assert.equal(reminders[0].id,confirmed.json().receipt.targetId);assert.equal(reminders[0].text,'练习英语');assert.equal(reminders[0].timezone,'Asia/Shanghai');
  const conversation=await send('/api/runtime/family/conversations',{title:'当前身份的工具'});assert.equal(conversation.statusCode,200,conversation.body);
  const answer=await send(`/api/runtime/family/conversations/${conversation.json().id}/messages`,{text:'有哪些提醒，天气用什么城市？'});assert.equal(answer.statusCode,200,answer.body);
  const tools=calls.at(-1)!.businessCallbacks!.readOnlyTools!();assert.deepEqual(tools.map(tool=>tool.name).sort(),['get_weather','jarvis_billing_summary','jarvis_companion_progress','jarvis_monitor_history','jarvis_news','jarvis_notifications','jarvis_platform_nodes','jarvis_power','jarvis_read_page','jarvis_remote_operations','jarvis_running_projects','jarvis_software_factory','jarvis_web_search','search_weather_locations']);assert(tools.every(tool=>tool.annotations?.readOnlyHint));
  const notifications=tools.find(tool=>tool.name==='jarvis_notifications')!;const result=await notifications.execute('test',{},new AbortController().signal,undefined,{} as never);assert.equal((result.details as any).identity,'current-member');
  const nodes=tools.find(tool=>tool.name==='jarvis_platform_nodes')!;const nodeResult=await nodes.execute('nodes',{},new AbortController().signal,undefined,{} as never);assert.equal((nodeResult.details as any).automaticFailover,false);
  runtime.store.deleteLogin(headers.cookie.split('=')[1]);
  await assert.rejects(notifications.execute('revoked',{},new AbortController().signal,undefined,{} as never),/身份|验证|登录|失效/);
  await assert.rejects(nodes.execute('revoked-nodes',{},new AbortController().signal,undefined,{} as never),/管理者/);
 }finally{await runtime.app.close();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
