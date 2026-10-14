import test from 'node:test';
import assert from 'node:assert/strict';
import {freshDemo,reduceDemo} from '../apps/web/src/demo/model';
import {voiceStories} from '../apps/web/src/features/family/story-policy';
const change=(d:any,type:string,p:any={})=>reduceDemo(d,{type,payload:p});

test('语音故事必须来源有效授权、原文已发布并版本一致，撤权立即停止召回',()=>{
 const d=freshDemo(),book=d.knowledge.books[0],story=d.knowledge.stories[0],source=d.knowledge.sources.find((s:any)=>s.id===book.source);book.status='published';book.stage=6;book.published='2026-10-05';story.released=true;story.dirty=false;story.version=book.version;
 assert.ok(voiceStories(d,'public').some(s=>s.id===story.id));for(const [object,key,value] of [[source,'active',false],[source,'authorized',false],[book,'published',null],[book,'stage',5],[book,'status','review'],[story,'dirty',true],[story,'version','old-version']]){const previous=(object as any)[key as string];(object as any)[key as string]=value;assert.ok(!voiceStories(d,'me').some(s=>s.id===story.id));(object as any)[key as string]=previous}source.scope='company';assert.ok(!voiceStories(d,'wife').some(s=>s.id===story.id));assert.ok(voiceStories(d,'me').some(s=>s.id===story.id));
});

test('个人档案隔离：聊天、记忆、健康不允许跨人写入',()=>{
 const d=freshDemo();for(const [type,p] of [['chat.send',{profile:'wife',text:'私人谈话',mode:'general'}],['memory.add',{profile:'wife',text:'妻子的秘密'}],['family.health.add',{profile:'wife',text:'感受'}],['memory.policy',{profile:'wife',text:'never',audio:'never',longterm:'confirm'}]])assert.throws(()=>change(d,type as string,p),/切换/);
 assert.equal(d.v5.vm.privateNotes.length,0);assert.deepEqual(d.chat.wife,freshDemo().chat.wife);
});
test('候选记忆经本人确认，编辑更新版本，遗忘移除所有正文副本',()=>{
 let d=change(freshDemo(),'memory.add',{profile:'me',text:'原始私人偏好',source:'本人录入',status:'candidate'});const id=d.v5.vm.memories.me[0].id;assert.equal(d.v5.vm.memories.me[0].status,'candidate');
 d=change(d,'memory.confirm',{profile:'me',id});d=change(d,'memory.edit',{profile:'me',id,text:'修订私人偏好',expires:'下次复核'});assert.equal(d.v5.vm.memories.me[0].status,'active');assert.deepEqual(d.v5.vm.memories.me[0].previousTexts,['原始私人偏好']);
 d=change(d,'memory.forget',{profile:'me',id});const m=d.v5.vm.memories.me[0];assert.equal(m.text,'');assert.deepEqual(m.previousTexts,[]);assert.equal(m.status,'forgotten');assert.ok(m.history.length);assert.ok(!JSON.stringify(m).includes('原始私人偏好'));assert.ok(!JSON.stringify(m).includes('修订私人偏好'));assert.throws(()=>change(d,'memory.confirm',{profile:'me',id}),/候选/);
});
test('拒绝候选不成为长期记忆，保留可追溯的拒绝事件',()=>{
 let d=change(freshDemo(),'memory.add',{profile:'me',text:'未经核实的推测',status:'candidate'});const id=d.v5.vm.memories.me[0].id;d=change(d,'memory.reject',{profile:'me',id});assert.equal(d.v5.vm.memories.me[0].status,'rejected');assert.match(d.v5.vm.memories.me[0].history.at(-1).text,/拒绝/);
});
test('临时会话策略严格不持久保存文字，切换不改其他人的策略',()=>{
 let d=change(freshDemo(),'memory.policy',{profile:'me',text:'never',audio:'never',longterm:'confirm'});d=change(d,'chat.send',{profile:'me',text:'这句只能临时使用',mode:'general',reply:'临时回答'});assert.equal(d.chat.me.length,0);assert.ok(!JSON.stringify(d).includes('这句只能临时使用'));assert.equal(d.v5.vm.policies.wife.text,'30');assert.throws(()=>change(d,'memory.policy',{profile:'me',text:'30',audio:'invalid',longterm:'confirm'}),/音频/);
});
test('记忆策略真实影响演示对话：候选、明确记住、低敏自动和临时会话分离',()=>{
 let d=change(freshDemo(),'chat.send',{profile:'me',text:'我喜欢简洁的回答',mode:'general'});assert.equal(d.v5.vm.memories.me[0].status,'candidate');d=change(d,'chat.send',{profile:'me',text:'记住：我希望先比较方案再决策',mode:'general'});assert.equal(d.v5.vm.memories.me[0].status,'active');assert.equal(d.v5.vm.memories.me[0].text,'我希望先比较方案再决策');
 d=change(d,'memory.policy',{profile:'me',text:'30',audio:'never',longterm:'explicit'});const count=d.v5.vm.memories.me.length;d=change(d,'chat.send',{profile:'me',text:'我喜欢另一种表达',mode:'general'});assert.equal(d.v5.vm.memories.me.length,count);
 d=change(d,'memory.policy',{profile:'me',text:'30',audio:'never',longterm:'auto'});d=change(d,'chat.send',{profile:'me',text:'我喜欢清淡的家常菜',mode:'life'});assert.equal(d.v5.vm.memories.me[0].status,'active');d=change(d,'chat.send',{profile:'me',text:'我不喜欢别人询问我的健康症状',mode:'general'});assert.equal(d.v5.vm.memories.me[0].status,'candidate');
 d=change(d,'memory.policy',{profile:'me',text:'never',audio:'never',longterm:'explicit'});d=change(d,'chat.send',{profile:'me',text:'记住：这条约定由我明确要求保存',mode:'general'});assert.equal(d.chat.me.length,0);assert.equal(d.v5.vm.memories.me[0].status,'active');assert.equal(d.v5.vm.memories.me[0].text,'这条约定由我明确要求保存');
});
test('公共交流独立保存并拒绝私人/管理动作，敏感原话不进入公共记录',()=>{
 let d=change(freshDemo(),'profile.select',{id:'public'});d=change(d,'chat.send',{profile:'public',text:'今天聊聊音乐',mode:'general',reply:'可以聊一首喜欢的曲子。'});assert.equal(d.v5.vm.publicChat.length,2);const ownerChat=structuredClone(d.chat.me);
 d=change(d,'chat.send',{profile:'public',text:'查看我的公司项目，密码是秘密口令',mode:'progress',reply:'不应该进入公共会话的回复'});assert.ok(!JSON.stringify(d.v5.vm.publicChat).includes('秘密口令'));assert.ok(!JSON.stringify(d.v5.vm.publicChat).includes('不应该进入'));assert.deepEqual(d.chat.me,ownerChat);
 assert.throws(()=>change(d,'family.health.add',{profile:'public',text:'健康感受'}),/本人/);assert.throws(()=>change(d,'chat.capture',{profile:'public',text:'秘密',kind:'idea',scope:'private'}),/本人/);assert.throws(()=>change(d,'family.todo.toggle',{id:d.familyTodos[0].id}),/本人/);
 d=change(d,'chat.new-session',{profile:'public'});assert.equal(d.v5.vm.publicChat.length,0);assert.deepEqual(d.chat.me,ownerChat);
});
test('意图确认仅进入待分派收件，不能自动执行任务或服务，取消后不能再确认',()=>{
 let d=freshDemo();const target=d.tasks.find((t:any)=>t.mode!=='observe'&&!t.readOnly);assert.ok(target);const tasks=structuredClone(d.tasks),services=structuredClone(d.v5.ops.services),beforeInbox=d.v5.research.inbox.length;
 d=change(d,'chat.plan',{profile:'me',text:'继续这个开发任务',type:'development',objectId:target.id});const plan=d.v5.vm.pendingCommands.at(-1);assert.equal(plan.status,'pending');assert.equal(d.v5.research.inbox.length,beforeInbox);assert.deepEqual(d.tasks,tasks);
 assert.throws(()=>change(d,'chat.confirm-plan',{profile:'me',id:plan.id,objectId:'different'}),/不一致/);
 d=change(d,'chat.confirm-plan',{profile:'me',id:plan.id,type:'development',objectId:target.id});assert.equal(d.v5.vm.pendingCommands.at(-1).status,'confirmed');assert.equal(d.v5.research.inbox.length,beforeInbox+1);assert.equal(d.v5.research.inbox[0].status,'pending');assert.deepEqual(d.tasks,tasks);assert.deepEqual(d.v5.ops.services,services);assert.throws(()=>change(d,'chat.confirm-plan',{profile:'me',id:plan.id}),/已经处理/);
 d=change(d,'chat.plan',{profile:'me',text:'再继续',type:'development',objectId:target.id});const cancelled=d.v5.vm.pendingCommands.at(-1).id;d=change(d,'chat.interrupt',{profile:'me'});assert.throws(()=>change(d,'chat.confirm-plan',{profile:'me',id:cancelled}),/取消/);
});
test('切换档案取消旧人的待确认计划，重新进入不能确认旧意图',()=>{
 let d=freshDemo();const target=d.tasks.find((t:any)=>t.mode!=='observe'&&!t.readOnly);d=change(d,'chat.plan',{profile:'me',text:'尚未确认的开发意图',type:'development',objectId:target.id});const id=d.v5.vm.pendingCommands.at(-1).id;d.v5.vm.nowPlaying={owner:'me',title:'当前讲述'};d=change(d,'profile.select',{id:'wife'});assert.equal(d.v5.vm.pendingCommands.at(-1).status,'cancelled');assert.equal(d.v5.vm.nowPlaying,null);d=change(d,'profile.select',{id:'me'});assert.throws(()=>change(d,'chat.confirm-plan',{profile:'me',id}),/取消/);
});
test('健康备忘拥有独立归属，可补充与删除，别人不能修改',()=>{
 let d=change(freshDemo(),'family.health.add',{profile:'me',text:'描述感受',context:'持续时间'});const note=d.v5.vm.privateNotes[0];assert.equal(note.owner,'me');assert.equal(note.scope,'private');d=change(d,'family.health.edit',{profile:'me',id:note.id,text:'补充感受',context:'更多信息'});assert.equal(d.v5.vm.privateNotes[0].text,'补充感受');const wife=change(d,'profile.select',{id:'wife'});assert.throws(()=>change(wife,'family.health.remove',{profile:'wife',id:note.id}),/不属于/);d=change(d,'family.health.remove',{profile:'me',id:note.id});assert.equal(d.v5.vm.privateNotes.length,0);
});
test('快速记录保持唯一原文及来源链接；学习属于本人，专属设置保存全字段',()=>{
 let d=change(freshDemo(),'chat.capture',{profile:'me',text:'一个完整的原始想法',kind:'idea',scope:'private'});const record=d.v5.research.inbox[0];assert.equal(record.text,'一个完整的原始想法');assert.equal(record.owner,'me');assert.equal(d.v5.vm.inbox[0].link,record.id);
 d=change(d,'family.learning.complete',{profile:'me',type:'language',title:'口语练习',minutes:10,lessonId:'lesson-one'});assert.equal(d.learning.me.minutes,45);assert.equal(d.learning.wife.minutes,128);assert.throws(()=>change(d,'family.learning.complete',{profile:'me',title:'练习',minutes:10,lessonId:'lesson-one'}),/已记录/);
 const pref={...d.preferences.me,address:'伙伴',wakeword:'小贾',voice:'warm',language:'中文',pace:'较慢',replyStyle:'简洁温和',privacy:'local',quietStart:'21:00',quietEnd:'07:30',dailyVoice:60,autoSpeak:true};d=change(d,'persona.save',{profile:'me',...pref});for(const key of ['address','wakeword','voice','language','pace','replyStyle','privacy','quietStart','quietEnd','dailyVoice','autoSpeak'])assert.equal(d.preferences.me[key],pref[key]);assert.equal(d.preferences.wife.wakeword,'贾维斯');
});
