import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {PiService,type PiUsageRecord} from '../src/pi.js';
import {conversationRoutingSchema,conversationComplexity,responseLanguageInstruction,inferredResponseLanguage,transitionPhrases,defaultConversationRouting} from '../src/pi-routing.js';

test('conversation routing defaults are compatible; local complexity and language rules do not make external calls',()=>{
 assert.deepEqual(conversationRoutingSchema.parse({}),defaultConversationRouting());assert.equal(conversationComplexity('Hello, how are you?').advanced,false);assert.equal(conversationComplexity('比较两种方案的成本和维护方式').reason,'comparison');assert.equal(conversationComplexity('Please research this in depth').reason,'research');assert.equal(conversationComplexity('Was muss ich bei einer medizinischen Diagnose beachten?').reason,'high-stakes');assert.equal(conversationComplexity('x'.repeat(400)).reason,'multi-condition');
 assert.equal(inferredResponseLanguage('bonjour, comment allez-vous?'),'fr');assert.equal(inferredResponseLanguage('Hallo, kannst du helfen?'),'de');assert.equal(inferredResponseLanguage('hello'),'en');assert.equal(inferredResponseLanguage('你好'),'zh');assert.equal(inferredResponseLanguage('你好','en'),'en');assert.match(responseLanguageInstruction('fr'),/français/);assert.match(responseLanguageInstruction(),/本轮原话/);
 assert.equal(conversationComplexity('Comparez les deux architectures et leurs coûts').advanced,true);assert.equal(conversationComplexity('Analysez cette question en détail').reason,'research');assert.equal(conversationComplexity('Vergleiche bitte die zwei Optionen').advanced,true);assert.equal(conversationComplexity('Bitte untersuche die Ursache ausführlich').reason,'research');assert.equal(conversationComplexity('Bonjour').advanced,false);assert.equal(conversationComplexity('Hallo').advanced,false);
 for(const language of ['zh','en','fr','de']as const){assert.equal(transitionPhrases(language).length,3);for(const sentence of transitionPhrases(language))assert(sentence.length<200);}
 assert.throws(()=>conversationRoutingSchema.parse({transitionTimeoutMs:999}));assert.throws(()=>conversationRoutingSchema.parse({fast:{provider:'p',model:'m',apiKey:'forged'}}));
});

function stream(model:string,text:string){const events=[{type:'message_start',message:{id:'fixture-'+Math.random(),type:'message',role:'assistant',model,content:[],stop_reason:null,usage:{input_tokens:10,output_tokens:0}}},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:5}},{type:'message_stop'}];return new Response(events.map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});}
const timeoutWait=(ms:number,signal?:AbortSignal|null)=>new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms),abort=()=>{clearTimeout(timer);reject(new Error('fixture request cancelled'));};if(signal?.aborted)return abort();signal?.addEventListener('abort',abort,{once:true});});
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-conversation-routing-')),original=globalThis.fetch,requests:{model:string;body:any;transition:boolean;aborted:boolean}[]=[],usage:PiUsageRecord[]=[],before:string[]=[],after:string[]=[];let finalDelay=0,transitionDelay=0,malformed=false,finalAnswer:((body:any)=>string)|undefined;
 globalThis.fetch=async(input,options)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);assert.equal(url.hostname,'routing.example.test');if(url.pathname.endsWith('/models'))return new Response(JSON.stringify({data:[{id:'fast-chat'},{id:'advanced-chat'}]}));assert.equal(url.pathname,'/v1/messages');const body=JSON.parse(String(options?.body)),transition=String(JSON.stringify(body.system)).includes('neutral waiting acknowledgement'),entry={model:body.model,body,transition,aborted:false};requests.push(entry);try{await timeoutWait(transition?transitionDelay:finalDelay,options?.signal);return stream(body.model,transition?(malformed?'{"variant":9,"text":"unsafe claim"}':'{"variant":1}'):(finalAnswer?.(body)??'最终回答 · '+body.model));}catch(error){entry.aborted=true;throw error;}};
 const service=new PiService(directory,{listProjects:()=>[{id:'private-business-record',name:'must never enter transition'}],listDevices:()=>[],listTasks:()=>[],listExperiences:()=>[]});await service.initialize();await service.configureGateway({id:'gateway-routing',name:'Isolated fixture',baseUrl:'https://routing.example.test',api:'anthropic-messages'},'nonproduction-fixture-key');await service.configure({provider:'gateway-routing',model:'advanced-chat'});const current=await service.getSettings();const fast={provider:'gateway-routing',model:'fast-chat'},advanced={provider:'gateway-routing',model:'advanced-chat'};await service.updateConversationRouting(current.routing.revision,{...defaultConversationRouting(),fast,advanced,transitionAfterMs:0,transitionTimeoutMs:2000});service.setLifecycleHooks({beforeRun:m=>{before.push(m.runId);},onUsage:u=>{usage.push(u);},afterRun:m=>{after.push(m.runId);}});
 const base={actorId:'server-admin',member:{name:'本人',preferences:'private profile preference must not enter transition'},sessionPath:null,onSessionPath:()=>{}};
 return {directory,service,requests,usage,before,after,base,fast,advanced,setDelays(final:number,transition:number){finalDelay=final;transitionDelay=transition;},malformed(value:boolean){malformed=value;},answer(value:(body:any)=>string){finalAnswer=value;},async close(){await service.dispose();globalThis.fetch=original;const path=resolve(directory);assert(path.startsWith(resolve(tmpdir())+sep)&&path.includes('jarvis-conversation-routing-'));await rm(path,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}

test('native Pi SDK sends simple chat to fast and complex to advanced, with independent waiting usage and frozen safe phrases',async()=>{const f=await fixture();try{
 const simpleEvents:{event:string;data:any}[]=[];const simple=await f.service.run({...f.base,conversationId:'simple',text:'Hello',onEvent:(event,data)=>simpleEvents.push({event,data})});assert.equal(simple.status,'complete');assert.equal(f.requests[0].model,'fast-chat');assert.equal(f.requests[0].transition,false);assert.equal(simpleEvents.some(e=>e.event==='transition'),false);assert.equal(simpleEvents.find(e=>e.event==='route')?.data.tier,'fast');
 // Hold the final provider response until the tiny SDK session has time to settle.
 f.setDelays(1000,0);const events:{event:string;data:any}[]=[];const result=await f.service.run({...f.base,conversationId:'complex',scenario:'family-chat',responseLanguage:'fr',text:'Please compare two architecture options in depth',onEvent:(event,data)=>events.push({event,data})});assert.equal(result.status,'complete');assert.equal(result.text,'最终回答 · advanced-chat');assert.equal(events.find(e=>e.event==='route')?.data.tier,'advanced');const transitions=events.filter(e=>e.event==='transition');assert.equal(transitions.length,1);assert(transitionPhrases('fr').includes(transitions[0].data.text));assert(events.findIndex(e=>e.event==='transition')<events.findIndex(e=>e.event==='delta'));
 const request=f.requests.find(r=>r.transition)!;assert.equal(request.model,'fast-chat');assert.equal(request.body.max_tokens,96);assert(!JSON.stringify(request.body).includes('private profile'));assert(!JSON.stringify(request.body).includes('private-business'));assert(!JSON.stringify(request.body).includes('compare two architecture'));assert(!request.body.tools?.length);assert.match(JSON.stringify(f.requests.find(r=>r.model==='advanced-chat'&&!r.transition)!.body.system),/français/);
 assert.equal(f.usage.length,3);assert.equal(new Set(f.usage.map(u=>u.runId)).size,3);assert(f.usage.every(u=>u.inputTokens===10&&u.outputTokens===5&&u.costUSD===null));assert.deepEqual([...f.before].sort(),[...f.after].sort());
 const settings=await f.service.getSettings();assert.equal(settings.model,'advanced-chat','global Pi default remains unchanged');assert.equal(settings.routing.conversation.fast?.model,'fast-chat');const stored=JSON.parse(await readFile(join(f.directory,'pi/agent/routing.json'),'utf8'));assert.equal(stored.conversation.advanced.model,'advanced-chat');const files=await readdir(join(f.directory,'pi/sessions/server-admin/complex'));const history=await Promise.all(files.map(file=>readFile(join(f.directory,'pi/sessions/server-admin/complex',file),'utf8')));assert(!history.join('').includes('variant'));assert(!history.join('').includes(transitions[0].data.text),'waiting acknowledgement never enters the final canonical transcript');
 }finally{await f.close();}});

test('visible final text cancels slow acknowledgement; malformed tiny output does not fabricate a transition',async()=>{const f=await fixture();try{
 f.setDelays(100,1000);const events:string[]=[];const result=await f.service.run({...f.base,conversationId:'race',text:'研究两个方案',onEvent:event=>events.push(event)});assert.equal(result.status,'complete');assert(!events.includes('transition'));assert.equal(f.requests.find(r=>r.transition)?.aborted,true);assert.deepEqual([...f.before].sort(),[...f.after].sort());
 f.setDelays(800,0);f.malformed(true);const unsafeEvents:string[]=[];await f.service.run({...f.base,conversationId:'malformed',text:'分析并对比架构方案',onEvent:event=>unsafeEvents.push(event)});assert(!unsafeEvents.includes('transition'));
}finally{await f.close();}});

test('native Pi cross-language turns freeze member output policy for both final prompts and waiting speech without changing model routes',async()=>{
 const f=await fixture();try{
  f.setDelays(1000,0);
  const cases=[
   {id:'fixed-en',preferences:{replyLanguage:'en',language:'中文'},text:'请深入比较两个架构方案',detected:'zh',expected:'en',instruction:/Respond in natural English/},
   {id:'fixed-zh',preferences:{replyLanguage:'zh',language:'英语'},text:'Please compare two architecture options in depth',detected:'en',expected:'zh',instruction:/本轮用自然中文回应/},
   {id:'auto-asr-fr',preferences:{replyLanguage:'auto',language:'中文'},text:'请深入比较两个方案',detected:'fr',expected:'fr',instruction:/Répondez en français/},
   {id:'auto-text-de',preferences:{replyLanguage:'auto',language:'中文'},text:'Vergleiche bitte die zwei Optionen',detected:undefined,expected:'de',instruction:/natürlichem Deutsch/},
   {id:'legacy-auto',preferences:{language:'英语'},text:'请深入研究并比较方案',detected:undefined,expected:'zh',instruction:/本轮用自然中文回应/},
  ]as const;
  for(const item of cases){
   const start=f.requests.length,events:{event:string;data:any}[]=[];
   const result=await f.service.run({...f.base,member:{name:item.id,preferences:JSON.stringify(item.preferences)},conversationId:item.id,scenario:'family-chat',voiceMode:true,responseLanguage:item.detected,text:item.text,onEvent:(event,data)=>events.push({event,data})});
   assert.equal(result.status,'complete');const requests=f.requests.slice(start),final=requests.find(r=>!r.transition)!;
   assert.equal(final.model,'advanced-chat');assert.match(JSON.stringify(final.body.system),item.instruction);
   const transition=events.filter(e=>e.event==='transition');assert.equal(transition.length,1,item.id);assert(transitionPhrases(item.expected).includes(transition[0].data.text));
   assert.equal(events.find(e=>e.event==='route')?.data.tier,'advanced');
  }
  const settings=await f.service.getSettings();assert.equal(settings.model,'advanced-chat');assert.equal(settings.routing.conversation.fast?.model,'fast-chat');
 }finally{await f.close();}
});

test('privacy applies to actual selected endpoint; cancel stops both SDK sessions and never leaks transition after abort',async()=>{const f=await fixture();try{
 const count=f.requests.length;await assert.rejects(f.service.run({...f.base,conversationId:'local',text:'深入比较方案',requireLocalModel:true,onEvent:()=>{}}),/PI_PRIVACY_FORBIDDEN/);assert.equal(f.requests.length,count);
 f.setDelays(2000,2000);const events:string[]=[];const pending=f.service.run({...f.base,conversationId:'cancel-both',text:'深入比较两种规划方案',onEvent:event=>events.push(event)});const deadline=Date.now()+10_000;while(f.requests.filter(r=>r.transition||r.model==='advanced-chat').length<2&&Date.now()<deadline)await timeoutWait(20);assert.equal(f.requests.length,2);await f.service.abort('cancel-both','server-admin');const cancelled=await pending;assert.equal(cancelled.status,'cancelled');assert(!events.includes('transition'));assert(f.requests.every(r=>r.aborted));assert.deepEqual([...f.before].sort(),[...f.after].sort());assert.equal(f.service.health().activeRuns,0);
 }finally{await f.close();}});

test('model routing stores exact valid selections and optimistic version, with explicitly reported no-advanced fallback',async()=>{const f=await fixture();try{
 const settings=await f.service.getSettings();await assert.rejects(f.service.updateConversationRouting(settings.routing.revision,{...defaultConversationRouting(),fast:{provider:'gateway-routing',model:'invented'}}),/PI_NOT_CONFIGURED/);await assert.rejects(f.service.updateConversationRouting(0,defaultConversationRouting()),/PI_SETTINGS_CONFLICT/);
 await f.service.updateConversationRouting(settings.routing.revision,{...defaultConversationRouting(),fast:f.fast,advanced:null});const events:{event:string;data:any}[]=[];const result=await f.service.run({...f.base,conversationId:'fallback',text:'深入研究并对比',onEvent:(event,data)=>events.push({event,data})});assert.equal(result.text,'最终回答 · fast-chat');assert.equal(events.find(e=>e.event==='route')?.data.fallback,'advanced-not-configured');assert(!f.requests.some(r=>r.transition));
 }finally{await f.close();}});

test('an explicit dollar budget never starts an unpriced waiting model, while lifecycle budget refusal cannot manufacture an acknowledgement',async()=>{const f=await fixture();try{
 const current=await f.service.getSettings();await f.service.updatePrice(current.routing.revision,'gateway-routing','advanced-chat',{input:1,output:1,cacheRead:0,cacheWrite:0});f.setDelays(400,0);const events:string[]=[];const result=await f.service.run({...f.base,conversationId:'bounded-chat',text:'深入对比规划方案',maxCostUSD:.1,onEvent:event=>events.push(event)});assert.equal(result.status,'complete');assert.equal(f.requests.length,1);assert.equal(f.requests[0].model,'advanced-chat');assert(!events.includes('transition'));assert(Math.abs(f.usage[0].costUSD!-.000015)<1e-12);
 let approvals=0;f.service.setLifecycleHooks({beforeRun:()=>{if(++approvals>1)throw Error('fixture concurrency/budget gate');}});const gateEvents:string[]=[];await f.service.run({...f.base,conversationId:'aux-budget-refused',text:'深入研究方案',onEvent:event=>gateEvents.push(event)});assert(!gateEvents.includes('transition'));assert.equal(f.requests.length,2,'refused auxiliary reservation must not invoke its provider');
 }finally{await f.close();}});

test('native skill-expanded French practice cannot replace fixed English teacher language, including reopened French history',async()=>{
 const f=await fixture();try{
  const original='Bonjour. Je voudrais pratiquer le français avec vous.';let sessionPath:string|null=null;
  f.answer(()=>"Bonjour. Nous allons pratiquer le français ensemble.");
  const previous=await f.service.run({...f.base,conversationId:'learning-history',scenario:'family-chat',voiceMode:true,member:{name:'Teacher fixture',preferences:JSON.stringify({replyLanguage:'auto',language:'法语'})},responseLanguage:'fr',text:original,onSessionPath:path=>{sessionPath=path;},onEvent:()=>{}});assert.equal(previous.status,'complete');assert(sessionPath);
  const answer='Hello! We can practice French together. I will explain in English. French example: Bonjour.';
  f.answer(body=>{
   const system=JSON.stringify(body.system),last=body.messages.at(-1),prompt=typeof last.content==='string'?last.content:last.content.filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n');
   assert.match(system,/SERVER_FROZEN_REPLY_LANGUAGE=en/);assert.match(system,/every greeting, teacher explanation/);assert.match(system,/legacy profile language field/);assert.match(system,/does not switch the teacher/);assert.match(system,/clearly labelled short exercise examples/);
   assert.match(prompt,/<skill[^>]*name="jarvis-companion"/);assert(prompt.includes(JSON.stringify(original)),'the original request remains quoted without translation');assert(prompt.lastIndexOf('[SERVER_FROZEN_REPLY_LANGUAGE=en]')>prompt.indexOf(original),'frozen language is reiterated after the actual request');assert.match(prompt,/服务端本轮冻结的回复语种具有优先级/);assert.match(prompt,/目标语言不得成为整段回复的主文/);
   assert(JSON.stringify(body.messages.slice(0,-1)).includes('Nous allons pratiquer'),'real native session still contains the earlier French history');return answer;
  });
  for(let i=0;i<3;i++){
   const result=await f.service.run({...f.base,conversationId:'learning-history',sessionPath,scenario:'family-chat',voiceMode:true,member:{name:'Teacher fixture',preferences:JSON.stringify({replyLanguage:'en',language:'法语',goal:'pratiquer le français'})},responseLanguage:'fr',text:original,onSessionPath:path=>{sessionPath=path;},onEvent:()=>{}});
   assert.equal(result.status,'complete');assert.equal(result.text,answer);assert.match(result.text,/French example: Bonjour/,'short target-language examples remain intact');
  }
  assert.equal(f.requests.filter(r=>!r.transition).length,4);assert(f.requests.every(r=>r.model==='fast-chat'));assert.equal(f.usage.length,4);assert.deepEqual([...f.before].sort(),[...f.after].sort());
 }finally{await f.close();}
});

test('advanced target-language learning keeps the English waiting sentence and freezes the same language in the final native prompt',async()=>{
 const f=await fixture();try{
  f.setDelays(1000,0);const events:{event:string;data:any}[]=[],text='Bonjour. Je voudrais pratiquer le français avec vous. Comparez deux méthodes de cours.';
  f.answer(body=>{const system=JSON.stringify(body.system),last=JSON.stringify(body.messages.at(-1));assert.match(system,/SERVER_FROZEN_REPLY_LANGUAGE=en/);assert.match(last,/SERVER_FROZEN_REPLY_LANGUAGE=en/);return 'Hello! Here are two ways to practice French. French example: Bonjour.';});
  const result=await f.service.run({...f.base,conversationId:'practice-waiting',scenario:'family-chat',voiceMode:true,member:{name:'Teacher fixture',preferences:JSON.stringify({replyLanguage:'en',language:'法语'})},responseLanguage:'fr',text,onEvent:(event,data)=>events.push({event,data})});
  assert.equal(result.status,'complete');assert.match(result.text,/^Hello!/);const transitions=events.filter(e=>e.event==='transition');assert.equal(transitions.length,1);assert(transitionPhrases('en').includes(transitions[0].data.text));
  const waiting=f.requests.find(r=>r.transition)!;assert(waiting);assert(!JSON.stringify(waiting.body).includes(text));assert(!JSON.stringify(waiting.body).includes('pratiquer'));assert(!JSON.stringify(waiting.body).includes('法语'));assert(!waiting.body.tools?.length);assert.equal(events.find(e=>e.event==='route')?.data.tier,'advanced');assert.equal(f.usage.length,2);
 }finally{await f.close();}
});

test('native structured practice keeps target exercise fields while freezing teacher translation and feedback in English',async()=>{
 const f=await fixture();try{
  const reply={question:'Comment allez-vous ?',correction:'Je voudrais pratiquer le français.',modelAnswer:'Je vais bien, merci.',nextQuestion:'Que voulez-vous apprendre ?',translation:'How are you?',feedback:'This is a clear answer.',guide:'Answer the next French practice question.'};
  f.answer(body=>{const system=JSON.stringify(body.system),prompt=JSON.stringify(body.messages.at(-1));assert.match(system,/SERVER_FROZEN_REPLY_LANGUAGE=en/);assert.match(system,/question, correction, modelAnswer and nextQuestion fields/);assert.match(system,/remain in the practice target language/);assert.match(system,/translation, feedback and guide explanations follow this reply language/);assert.match(prompt,/question、correction、modelAnswer和nextQuestion/);return JSON.stringify(reply);});
  const settings=await f.service.getSettings();await f.service.updatePrice(settings.routing.revision,'gateway-routing','advanced-chat',{input:1,output:1,cacheRead:0,cacheWrite:0});
  const result=await f.service.run({...f.base,conversationId:'structured-practice',scenario:'companion',boundedJob:true,maxCostUSD:.05,member:{name:'Teacher fixture',preferences:JSON.stringify({replyLanguage:'en',language:'法语'})},responseLanguage:'fr',text:'Return a structured French practice question with English teacher guidance.',onEvent:()=>{}});
  assert.equal(result.status,'complete');assert.deepEqual(JSON.parse(result.text),reply);assert.equal(f.requests.length,1);assert.equal(f.requests[0].model,'advanced-chat');assert.equal(f.requests[0].transition,false);assert.equal(f.usage.length,1);assert(f.usage[0].costUSD!==null);assert.deepEqual([...f.before].sort(),[...f.after].sort());
 }finally{await f.close();}
});
