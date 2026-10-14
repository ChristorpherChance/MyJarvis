import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {IdentityRuntime,RuntimeAccessError} from '../src/runtime/identity.js';
import {NotificationRuntime} from '../src/runtime/notifications.js';
import {CompanionRuntime,registerCompanionRoutes,registerCompanionVoiceRoute,createCompanionTools,type CompanionSession} from '../src/runtime/companion.js';
import {VoiceRuntime} from '../src/runtime/voice.js';
import type {PiService,PiRunInput} from '../src/pi.js';
import {createApp} from '../src/app.js';
import {assertDto} from '../src/v1/contract.js';
import {companionSessionSchema} from '../src/runtime/companion.js';
const recipe={title:'测试番茄炒蛋',ingredients:[{name:'番茄',amount:'2个'},{name:'鸡蛋',amount:'3个'}],warnings:['确认食材和实际配料'],steps:[{title:'准备',instruction:'切番茄、打散鸡蛋。',timerSeconds:0},{title:'炒制',instruction:'炒熟鸡蛋并观察番茄软化。',timerSeconds:120}]};
const englishRecipe={title:'Tomato and eggs',ingredients:[{name:'Tomatoes',amount:'2'},{name:'Eggs',amount:'3'}],warnings:['Check the ingredients and package labels.'],steps:[{title:'Prepare',instruction:'Cut the tomatoes and beat the eggs.',timerSeconds:0},{title:'Cook',instruction:'Cook the eggs thoroughly and check that the tomatoes soften.',timerSeconds:120}]};
class FakePi {
 calls:PiRunInput[]=[];local=true;configured=true;result:any={question:'What did you do today?',translation:'你今天做了什么？'};hold:Promise<void>|null=null;localHold:Promise<void>|null=null;aborts=0;cleaned=0;
 health(){return {configured:this.configured};}async initialize(){}async dispose(){}async modelIsLocal(){if(this.localHold)await this.localHold;return this.local;}
 async run(input:PiRunInput){this.calls.push(input);if(this.hold)await this.hold;return {status:'complete' as const,text:typeof this.result==='string'?this.result:JSON.stringify(this.result)};}
 async abort(){this.aborts++;}async removeConversationSession(){this.cleaned++;}
}
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'jarvis-companion-')),store=new Store(dir);store.setPassword('isolated-companion-password');const login=store.createLogin();
 const profiles=new Map<string,any>([['me',{id:'me',name:'管理者',wakeWord:'贾维斯',preferences:{cloudPrivacy:'ask',timezone:'Asia/Shanghai'}}],['wife',{id:'wife',name:'家人',wakeWord:'小管家',preferences:{cloudPrivacy:'ask',timezone:'Asia/Shanghai'}}]]);
 const identity=new IdentityRuntime(store,{memberExists:id=>profiles.has(id),memberProfile:id=>profiles.get(id)});identity.setCredential('wife','123456','pin');const member=identity.login('wife','123456','test');const admin=identity.requireAdmin({cookies:{jarvis_session:login}} as any);
 const repo=new V1Repository(store.databasePath),pi=new FakePi();let clock=Date.now(),saved=0;
 const notifications=new NotificationRuntime(store.databasePath,{identity,repository:repo,now:()=>new Date(clock)}),voice=new VoiceRuntime(dir,identity,{store,defaultLocalTts:false}),runtime=new CompanionRuntime(identity,pi as unknown as PiService,notifications,{now:()=>new Date(clock),onLearning:()=>{saved++;return 'learning-'+saved;}}),app=Fastify();await app.register(cookie);registerCompanionRoutes(app,runtime,identity);registerCompanionVoiceRoute(app,runtime,identity,voice);await app.ready();
 const start=(kind:'practice'|'recipe'='practice',extra:any={})=>runtime.start(member.principal,{requestId:randomUUID(),kind,topic:'今天',...extra});
 const command=(s:CompanionSession,action:string,extra:any={})=>runtime.command(member.principal,s.id,{requestId:randomUUID(),expectedVersion:s.revision,action,confirmed:true,...extra}) as CompanionSession;
 return {dir,store,repo,profiles,identity,member,admin,pi,notifications,voice,runtime,app,start,command,saved:()=>saved,advance:(ms:number)=>{clock+=ms;},close:async()=>{await runtime.close();await notifications.close();await voice.close();await app.close();repo.close();identity.close();store.close();assert(resolve(dir).startsWith(resolve(tmpdir())+sep));await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}

test('Pi陪练根据实际答句纠错并生成下一题；实际应答时长与明确保存记录，重复提交仅一份',async()=>{const f=await fixture();try{
 const s=await f.start('practice',{rounds:2});assertDto('CompanionSession',s);assert.equal(s.status,'active');assert.equal(f.pi.calls[0].boundedJob,true);assert.equal(f.pi.calls[0].maxCostUSD,0.08);f.advance(70000);f.pi.result={feedback:'Use the past tense for yesterday.',correction:'I went to school.',modelAnswer:'I went to school yesterday.',nextQuestion:'Who did you meet?',translation:'Tell me who you met.'};
 const input={requestId:randomUUID(),expectedVersion:1,text:'I go to school yesterday.'};let next=await f.runtime.answer(f.member.principal,s.id,input);assert.equal(next.activeSeconds,70);assert.equal(next.rounds[0].answer,input.text);assert.equal(next.rounds[0].correction,'I went to school.');assert.equal(next.assessment,'text-only');assert.equal((next as any).score,undefined);assert.equal((await f.runtime.answer(f.member.principal,s.id,input)).rounds.length,1);assert.equal(f.pi.calls.length,2);
 f.pi.result={feedback:'Well done.',correction:'',modelAnswer:'I met my friend.',nextQuestion:'',translation:''};f.advance(30*60000);next=await f.runtime.answer(f.member.principal,s.id,{requestId:randomUUID(),expectedVersion:2,text:'I met Amy.'});assert.equal(next.activeSeconds,370);assert.equal(next.question,undefined);
 const finish={requestId:randomUUID(),expectedVersion:3,action:'finish',confirmed:true,saveLearning:true};const done=f.runtime.command(f.member.principal,s.id,finish) as CompanionSession;assert.equal(done.learningId,'learning-1');f.runtime.command(f.member.principal,s.id,finish);assert.equal(f.saved(),1);
 }finally{await f.close();}});

test('食谱先核对再启动；真实提醒计时可恢复，重放不重复，换步取消旧计时',async()=>{const f=await fixture();try{
 f.pi.result=recipe;let s=await f.start('recipe',{servings:3,retentionDays:7});assertDto('CompanionSession',s);assert.equal(s.status,'draft');assert.throws(()=>f.command(s,'timer-start',{seconds:120}),/先开始/);assert.throws(()=>f.runtime.command(f.member.principal,s.id,{requestId:randomUUID(),expectedVersion:1,action:'activate'}),/明确确认/);s=f.command(s,'activate');
 const timer={requestId:randomUUID(),expectedVersion:s.revision,action:'timer-start',confirmed:true,seconds:120};s=f.runtime.command(f.member.principal,s.id,timer) as CompanionSession;const due=s.timer!.dueAt;f.advance(40000);assert.equal((f.runtime.command(f.member.principal,s.id,timer) as CompanionSession).timer!.dueAt,due);assert.equal(f.notifications.reminders(f.member.principal).items.length,1);
 const restored=new CompanionRuntime(f.identity,f.pi as unknown as PiService,f.notifications);assert.equal(restored.get(f.member.principal,s.id).timer!.dueAt,due);await restored.close();s=f.command(s,'pause');assert.equal(s.timer!.state,'active');s=f.command(s,'resume');s=f.command(s,'next');assert.equal(s.timer!.state,'cancelled');assert.equal(f.notifications.reminders(f.member.principal).items[0].state,'cancelled');s=f.command(s,'finish');assert.equal(s.status,'complete');
 }finally{await f.close();}});

test('计时外部模块写入后回执故障，可用原编号恢复且不会制造第二个提醒',async()=>{const f=await fixture();try{
 f.pi.result=recipe;let s=await f.start('recipe');s=f.command(s,'activate');const original=f.notifications.createReminder.bind(f.notifications);let first=true;f.notifications.createReminder=((p:any,input:any)=>{const saved=original(p,input);if(first){first=false;throw Error('isolated crash after actual reminder commit');}return saved;}) as any;
 const input={requestId:randomUUID(),expectedVersion:s.revision,action:'timer-start',confirmed:true,seconds:60};assert.throws(()=>f.runtime.command(f.member.principal,s.id,input),/isolated crash/);assert.equal(f.notifications.reminders(f.member.principal).items.length,1);assert.equal(f.runtime.get(f.member.principal,s.id).timer!.state,'prepared');const recovered=f.runtime.command(f.member.principal,s.id,input) as CompanionSession;assert.equal(recovered.timer!.state,'active');assert.equal(recovered.pending,undefined);assert.equal(f.notifications.reminders(f.member.principal).items.length,1);
 }finally{await f.close();}});

test('当前身份隔离、版本冲突、严格输入、无模型以及无发音分数的失效输出',async()=>{const f=await fixture();try{
 const s=await f.start();assert.throws(()=>f.runtime.get(f.admin,s.id),e=>e instanceof RuntimeAccessError&&e.statusCode===404);assert.throws(()=>f.command(s,'pause',{expectedVersion:2}),/已更新/);
 for(const result of ['not json',{question:'Q',translation:'T',score:99},{title:'食谱',ingredients:[],warnings:[],steps:[]}]){f.pi.result=result;await assert.rejects(f.start());}assert.equal(f.runtime.list(f.member.principal).items.length,1);
 f.pi.configured=false;await assert.rejects(f.start(),e=>e instanceof RuntimeAccessError&&e.code==='PI_NOT_CONFIGURED');assert.equal((await f.app.inject({url:'/api/runtime/family/companion/sessions'})).statusCode,401);
 const forged=await f.app.inject({method:'POST',url:'/api/runtime/family/companion/sessions',headers:{cookie:`jarvis_member_session=${f.member.token}`},payload:{requestId:randomUUID(),kind:'practice',topic:'今天',profileId:'me'}});assert.equal(forged.statusCode,400);
 }finally{await f.close();}});

test('云授权逐轮检查；撤权、主动打断和迟到的模型结果都不写入练习',async()=>{const f=await fixture();try{
 f.pi.local=false;await assert.rejects(f.start(),e=>e instanceof RuntimeAccessError&&e.code==='CLOUD_CONSENT_REQUIRED');f.profiles.get('wife').preferences.cloudPrivacy='local';await assert.rejects(f.start('practice',{cloudConsent:true}),e=>e instanceof RuntimeAccessError&&e.code==='CLOUD_FORBIDDEN');f.pi.local=true;
 let release!:()=>void;f.pi.hold=new Promise<void>(r=>release=r);const pending=f.start();await new Promise(r=>setTimeout(r,20));f.runtime.cancel(f.member.principal);release();await assert.rejects(pending,/停止|未完成/);assert.equal(f.runtime.list(f.member.principal).items.length,0);
 f.pi.hold=new Promise<void>(r=>release=r);const revoked=f.start();await new Promise(r=>setTimeout(r,20));f.identity.logout(f.member.token);release();await assert.rejects(revoked,e=>e instanceof RuntimeAccessError&&e.statusCode===401);assert.equal(Number(f.identity.db.prepare('SELECT COUNT(*) n FROM runtime_companion_sessions').get()!.n),0);
 }finally{await f.close();}});

test('本地模型检查期间先占用本人生成锁；取消和退出不能让迟到检查启动新模型',async()=>{const f=await fixture();try{
 let release!:()=>void;f.pi.localHold=new Promise<void>(r=>release=r);const first=f.start();await new Promise(r=>setTimeout(r,20));await assert.rejects(f.start(),/已有一轮/);f.runtime.cancel(f.member.principal);release();await assert.rejects(first,/停止/);assert.equal(f.pi.calls.length,0);
 }finally{await f.close();}});

test('本人主动删除清除问答；保留最小去重编号阻止迟到重试重建；期限真实清理',async()=>{const f=await fixture();try{
 const initial={requestId:randomUUID(),kind:'practice',topic:'私人文字'};const s=await f.runtime.start(f.member.principal,initial);const forget={requestId:randomUUID(),expectedVersion:1,action:'forget',confirmed:true};assert.deepEqual(f.runtime.command(f.member.principal,s.id,forget),{forgotten:true,id:s.id});assert.deepEqual(f.runtime.command(f.member.principal,s.id,forget),{forgotten:true,id:s.id});await assert.rejects(f.runtime.start(f.member.principal,initial),/不存在/);assert.equal(f.pi.calls.length,1);
 const second=await f.start();f.advance(2*3600000+1);f.runtime.cleanup();assert.throws(()=>f.runtime.get(f.member.principal,second.id),/到期/);assert.equal(Number(f.identity.db.prepare('SELECT COUNT(*) n FROM runtime_companion_sessions').get()!.n),0);
 }finally{await f.close();}});

test('本人只读Pi进度工具查询实际流程，撤权后立即拒绝',async()=>{const f=await fixture();try{
 const s=await f.start(),tool=createCompanionTools(f.runtime,f.member.principal)[0],result=await tool.execute('progress',{},undefined,undefined,{} as any);assert.equal(JSON.parse((result.content[0] as any).text).items[0].id,s.id);f.identity.disableCredential('wife');await assert.rejects(tool.execute('old',{},undefined,undefined,{} as any),/失效/);
 }finally{await f.close();}});

test('房间只接受当前成员当前轮次真实ASR任务；明确启动、回答和重复任务仅执行一次',async()=>{const f=await fixture();try{
 const pairing=f.identity.issuePairing('study','study',['wife']),binding=f.identity.claimPairing(pairing.pairingToken,'fixture'),headers={cookie:`jarvis_member_session=${f.member.token}`,'x-jarvis-terminal':binding.terminalToken},s=f.voice.createSession(f.member.principal,'study','study');
 function asr(text:string){const id=randomUUID(),at=new Date().toISOString();f.identity.db.prepare('INSERT INTO runtime_voice_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,s.id,f.member.principal.actorId,'asr',s.turn,'complete',JSON.stringify({text}),null,null,null,at,at);return id;}
 const startJob=asr('小管家，开始英语练习，聊聊今天');const send=(body:any,h=headers)=>f.app.inject({method:'POST',url:`/api/runtime/voice/sessions/${s.id}/companion`,headers:h,payload:body});const result=await send({jobId:startJob});assert.equal(result.statusCode,200,result.body);let activity=result.json().session;assert.equal(activity.kind,'practice');assert.equal((await send({jobId:startJob})).json().session.id,activity.id);assert.equal(f.pi.calls.length,1);
 f.pi.result={feedback:'Use the past tense.',correction:'I went home.',modelAnswer:'I went home.',nextQuestion:'What did you eat?',translation:'Tell me what you ate.'};const answerJob=asr('I go home yesterday.');const answer=await send({jobId:answerJob,companionId:activity.id});assert.equal(answer.statusCode,200,answer.body);assert.equal(answer.json().session.rounds.length,1);assert.equal((await send({jobId:answerJob,companionId:activity.id})).json().session.rounds.length,1);assert.equal(f.pi.calls.length,2);
 assert.equal((await send({jobId:answerJob,text:'forged'})).statusCode,400);assert.equal((await send({jobId:answerJob},{cookie:headers.cookie} as any)).statusCode,401);await f.voice.interrupt(f.member.principal,s.id);assert.notEqual((await send({jobId:answerJob})).statusCode,200);
 }finally{await f.close();}});

test('完整应用实际接入陪练、本人学习记录和只读工具，断连不会伪造评分',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-companion-app-')),pi=new FakePi(),runtime=await createApp({dataDir:dir,pi:pi as unknown as PiService,webDir:join(dir,'no-web'),pythonExecutable:join(dir,'no-python'),whisperModelDirectory:join(dir,'no-model')});
 try{runtime.store.setPassword('isolated-integrated-companion-password');const token=runtime.store.createLogin(),p=runtime.identity.requireAdmin({cookies:{jarvis_session:token}} as any);let s=await runtime.companion.start(p,{requestId:randomUUID(),kind:'practice',topic:'今天',rounds:1});pi.result={feedback:'That is clear.',correction:'',modelAnswer:'I read today.',nextQuestion:'',translation:''};s=await runtime.companion.answer(p,s.id,{requestId:randomUUID(),expectedVersion:1,text:'I read today.'});s=runtime.companion.command(p,s.id,{requestId:randomUUID(),expectedVersion:2,action:'finish',confirmed:true,saveLearning:true}) as CompanionSession;const record=runtime.v1!.read('learning',s.learningId!,p.actorId);assert.equal(record?.source,'pi-text-companion');assert.equal(record?.assessmentStatus,'text-feedback');assert.equal(record?.score,null);assert.equal(record?.rounds[0].answer,'I read today.');assert.equal((await runtime.app.inject({url:'/api/runtime/family/companion/sessions',headers:{cookie:`jarvis_session=${token}`}})).statusCode,200);
 }finally{await runtime.app.close();assert(resolve(dir).startsWith(resolve(tmpdir())+sep));await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

test('fixed member English guides stay separate from French target practice and localized pause controls',async()=>{const f=await fixture();try{
 f.profiles.get('wife').preferences.replyLanguage='en';f.pi.result={question:'Comment allez-vous ?',translation:'Answer the question about how you feel.'};
 let s=await f.start('practice',{language:'fr',rounds:2});assert.equal(s.speechLanguage,'en');assert.equal(f.pi.calls.at(-1)?.responseLanguage,'en');assert.match(f.pi.calls.at(-1)!.text,/教师讲解只能使用英语/);assert.deepEqual(s.speechSegments!.map(x=>[x.kind,x.language]),[['guide','en'],['target','fr']]);assert(companionSessionSchema.safeParse(s).success);
 f.pi.result={feedback:'Use the present tense.',correction:'Je vais bien.',modelAnswer:'Je vais très bien.',nextQuestion:'Que faites-vous aujourd’hui ?',translation:'Tell me about your plans today.'};
 s=await f.runtime.answer(f.member.principal,s.id,{requestId:randomUUID(),expectedVersion:1,text:'Je aller bien.'},undefined,'fr');assert.equal(s.speechLanguage,'en');assert(s.speechSegments!.filter(x=>x.kind==='guide').every(x=>x.language==='en'&&!/[\u4e00-\u9fff]/.test(x.text)));assert(s.speechSegments!.filter(x=>x.kind==='target').every(x=>x.language==='fr'));s=f.command(s,'pause');assert.match(s.speech,/session is paused/);assert(s.speechSegments!.every(x=>x.language==='en'));
 }finally{await f.close();}});

test('recipe text, static steps and actual timer reminders follow the fixed reply policy',async()=>{const f=await fixture();try{
 f.profiles.get('wife').preferences.replyLanguage='en';f.pi.result=englishRecipe;let s=await f.start('recipe');assert.equal(s.speechLanguage,'en');assert.equal(f.pi.calls[0].responseLanguage,'en');assert.match(f.pi.calls[0].text,/所有title\/ingredients\/warnings\/steps文字只使用英语/);assert.match(s.speech,/Ingredients:/);s=f.command(s,'activate');assert.match(s.speech,/Step 1/);s=f.command(s,'next');s=f.command(s,'timer-start',{seconds:30});assert.match(s.speech,/30-second timer/);assert.match(f.notifications.reminders(f.member.principal).items[0].text,/Check the food/);
 }finally{await f.close();}});

test('automatic teacher output follows actual ASR language rather than the target practice plan',async()=>{const f=await fixture();try{
 f.profiles.get('wife').preferences.replyLanguage='auto';f.pi.result={question:'What did you do today?',translation:'Erzählen Sie von Ihrem Tag.'};const s=await f.runtime.start(f.member.principal,{requestId:randomUUID(),kind:'practice',language:'en',topic:'今天'},undefined,'de');assert.equal(s.speechLanguage,'de');assert.equal(f.pi.calls[0].responseLanguage,'de');assert.equal(s.speechSegments![0].language,'de');assert.equal(s.speechSegments![1].language,'en');const paused=f.command(s,'pause');assert.equal(paused.speechLanguage,'de');assert.match(paused.speech,/pausiert/);const current=f.runtime.get(f.member.principal,s.id,'fr');assert.equal(current.speechLanguage,'fr');assert.match(current.speech,/pause/);assert.equal(f.runtime.get(f.member.principal,s.id).speechLanguage,'de');assert.equal(f.pi.calls.length,1);
 }finally{await f.close();}});

test('a language change cancels a late generation and retained content is never relabelled as translated',async()=>{const f=await fixture();try{
 f.pi.result=recipe;const saved=await f.start('recipe');f.profiles.get('wife').preferences.replyLanguage='en';const visible=f.runtime.get(f.member.principal,saved.id);assert.match(visible.speech,/saved instructions use a different language/);assert(!visible.speech.includes('测试'));assert.equal(visible.recipe!.title,recipe.title);assert.equal(f.pi.calls.length,1);
 f.pi.result={question:'How are you?',translation:'Answer briefly.'};let release!:()=>void;f.pi.hold=new Promise<void>(r=>release=r);const pending=f.start();await new Promise(r=>setTimeout(r,20));f.profiles.get('wife').preferences.replyLanguage='fr';f.profiles.get('wife').preferences.replyLanguageRevision=1;release();await assert.rejects(pending,/回复语言设置已变更/);assert.equal(f.runtime.list(f.member.principal).items.length,1);
 }finally{await f.close();}});

test('unsupported Japanese targets remain explicit text and Chinese content cannot be faked as English output',async()=>{const f=await fixture();try{
 f.profiles.get('wife').preferences.replyLanguage='en';f.pi.result={question:'お元気ですか。',translation:'Answer the question in writing.'};const s=await f.start('practice',{language:'ja'});assert.match(s.speechSegments!.find(x=>x.kind==='guide'&&x.text.includes('Local voice'))!.text,/does not currently support/);assert(s.speechSegments!.some(x=>x.kind==='target'&&x.language==='ja'));
 f.pi.result=recipe;await assert.rejects(f.start('recipe'),(error:any)=>error.code==='INVALID_COMPANION_RESULT');assert.equal(f.runtime.list(f.member.principal).items.length,1);
 }finally{await f.close();}});
