import assert from 'node:assert/strict';
import {test} from 'node:test';
import {freshDemo,reduceDemo} from '../apps/web/src/demo/model';
import type {KnowledgeBook,KnowledgeData,KnowledgeDoubt} from '../apps/web/src/features/knowledge/domain';

function world(){let state=freshDemo();return {get data(){return state},get knowledge(){return state.knowledge as KnowledgeData},act(type:string,payload:Record<string,unknown>={}){state=reduceDemo(state,{type,payload})},denied(type:string,payload:Record<string,unknown>,message:RegExp){const before=JSON.stringify(state);assert.throws(()=>reduceDemo(state,{type,payload}),message);assert.equal(JSON.stringify(state),before,'拒绝操作不能改变已有模拟记录')}}}
const sourcePayload=(source:KnowledgeData['sources'][number])=>({id:source.id,name:source.name,type:source.type,endpoint:source.endpoint,topics:source.topics,mode:source.mode,scope:source.scope,rights:source.rights,authorized:source.authorized});
function resolve(w:ReturnType<typeof world>,bookId:string){const doubts=structuredClone(w.knowledge.books.find(b=>b.id===bookId)!.doubts);for(const q of doubts)if(q.status!=='resolved')w.act('knowledge.book.verdict',{bookId,doubtId:q.id,decision:'confirm',text:q.expected||q.alternate,note:'按样例原页图人工确认',profile:'me'})}

test('发布需解析、疑点裁决、完整逐页精校与有效授权；复校不会自动通过',()=>{
 const w=world(),id='bk1';let b=w.knowledge.books.find(b=>b.id===id)!;
 w.denied('knowledge.book.publish',{id},/疑点/);w.denied('knowledge.book.reviewPage',{id,page:2},/疑点/);w.denied('knowledge.book.reviewAll',{id},/疑点/);
 const before=b.rounds,states=b.doubts.map(q=>q.status);w.act('knowledge.book.recheck',{id});b=w.knowledge.books.find(b=>b.id===id)!;assert.equal(b.rounds,before+1);assert.deepEqual(b.doubts.map(q=>q.status),states);assert.equal(b.status,'review');
 resolve(w,id);w.denied('knowledge.book.publish',{id},/全部页面/);w.act('knowledge.book.reviewAll',{id});assert.equal(w.knowledge.books.find(b=>b.id===id)!.status,'review','全卷复核不能自动发布');
 const source=w.knowledge.sources.find(s=>s.id===b.source)!;w.act('knowledge.source.toggle',{id:source.id});w.denied('knowledge.book.publish',{id},/来源/);w.act('knowledge.source.toggle',{id:source.id});w.act('knowledge.book.publish',{id});b=w.knowledge.books.find(b=>b.id===id)!;
 assert.equal(b.stage,6);assert.equal(b.status,'published');assert.ok(b.published);assert.ok(b.audit.some(row=>row.text.includes('正式发布')));assert.ok(w.knowledge.stories.filter(s=>s.book===id).every(s=>s.released&&!s.dirty&&s.version===b.version));
 w.denied('knowledge.book.verdict',{bookId:id,doubtId:b.doubts[0].id,decision:'rescan'},/修订/);w.denied('knowledge.book.reviewAll',{id},/修订/);
});

test('补扫必须回到人工裁决，不能把升级状态直接确认或跳过非关键疑点',()=>{
 const w=world(),id='bk1';let b=w.knowledge.books.find(b=>b.id===id)!;const q=b.doubts[0];
 w.act('knowledge.book.verdict',{bookId:id,doubtId:q.id,decision:'rescan',note:'页图模糊'});assert.equal(w.knowledge.books.find(b=>b.id===id)!.doubts[0].status,'escalated');
 w.denied('knowledge.book.verdict',{bookId:id,doubtId:q.id,decision:'confirm',text:q.expected},/补交/);w.act('knowledge.book.rescan',{bookId:id,doubtId:q.id});assert.equal(w.knowledge.books.find(b=>b.id===id)!.doubts[0].status,'pending');
 resolve(w,id);b=w.knowledge.books.find(b=>b.id===id)!;b.doubts.push({...structuredClone(q),id:'minor-proof',critical:false,status:'pending'});w.denied('knowledge.book.reviewAll',{id},/待审核疑点/);w.denied('knowledge.book.publish',{id},/待确认疑点/);
 b.doubts.at(-1)!.status='resolved';b.reviewed=[1,1,...Array.from({length:b.pages-2},(_,i)=>i+2)];w.denied('knowledge.book.publish',{id},/全部页面/);
 b.reviewed=Array.from({length:b.pages},(_,i)=>i===b.pages-1?999:i+1);w.denied('knowledge.book.publish',{id},/全部页面/);
});

test('撤权停用立即停止召回，编辑不会清空索引或重开来源，检索保留ID与版本',()=>{
 const w=world();const src=w.knowledge.sources.find(s=>s.id==='src-local')!;const records=JSON.stringify(src.records),version=src.version,count=src.count;
 w.act('knowledge.query',{query:'人物',mode:'all',profile:'me'});assert.ok(w.knowledge.query.results.some(r=>r.source===src.id));assert.ok(w.knowledge.query.results.every(r=>!r.book||w.knowledge.books.find(b=>b.id===r.book)?.status==='published'));
 w.act('knowledge.source.save',{...sourcePayload(src),authorized:false});let s=w.knowledge.sources.find(s=>s.id===src.id)!;assert.equal(JSON.stringify(s.records),records);assert.equal(s.version,version);assert.equal(s.count,count);assert.equal(s.active,true);
 w.act('knowledge.query',{query:'人物',mode:'all',profile:'me'});assert.ok(!w.knowledge.query.results.some(r=>r.source===src.id));w.denied('knowledge.source.sync',{id:src.id},/授权/);w.denied('knowledge.story.favorite',{id:'st3',profile:'me'},/不可学习/);
 w.act('knowledge.source.toggle',{id:src.id});w.act('knowledge.source.save',{...sourcePayload(s),authorized:true,name:'家庭经典 · 保留索引'});s=w.knowledge.sources.find(s=>s.id===src.id)!;assert.equal(s.active,false);assert.equal(JSON.stringify(s.records),records);w.act('knowledge.source.toggle',{id:src.id});w.act('knowledge.source.sync',{id:src.id});assert.notEqual(w.knowledge.sources.find(s=>s.id===src.id)!.version,version);
 w.act('knowledge.query',{query:'不会匹配的随机标记-v15-test',mode:'all',profile:'me'});assert.equal(w.knowledge.query.results.length,0,'长问题不能无条件返回全部样例');
});

test('知识检索区分实时与本地模式，故障快照与家庭权限不混淆',()=>{
 const w=world();w.act('knowledge.query',{query:'部署',mode:'all',profile:'me'});assert.ok(w.knowledge.query.results.some(r=>r.source==='src-company'));
 w.act('knowledge.query',{query:'部署',mode:'local',profile:'me'});assert.ok(!w.knowledge.query.results.some(r=>r.source==='src-company'));
 w.act('knowledge.source.failure',{id:'src-company'});w.act('knowledge.query',{query:'部署',mode:'all',profile:'me'});assert.ok(!w.knowledge.query.results.some(r=>r.source==='src-company'));
 w.act('knowledge.source.failure',{id:'src-museum'});w.act('knowledge.query',{query:'地理',mode:'live',profile:'me'});assert.ok(w.knowledge.query.results.some(r=>r.source==='src-museum'),'混合模式保留有效授权快照');
 w.act('profile.select',{id:'wife'});w.act('knowledge.query',{query:'部署',mode:'all',profile:'wife'});assert.equal(w.knowledge.query.results.length,0);w.denied('knowledge.source.save',{...sourcePayload(w.knowledge.sources[0]),name:'不能修改'},/管理员/);
});

test('上传只登记元数据，手动解析后生成待发布故事，发布后可教学与检索',()=>{
 const w=world();w.act('knowledge.book.upload',{title:'新经典 · 流程样卷',edition:'独立 A 版',author:'样例编者',source:'src-local',pages:3,layout:'竖排 / 正文 + 注释',rights:'流程演示，无真实扫描识别',filename:'metadata-only.pdf',fileSize:2048});
 const id=w.knowledge.books[0].id;let b=w.knowledge.books[0];const s=w.knowledge.stories.find(s=>s.book===id)!;assert.ok(s);assert.equal(s.released,false);assert.equal(b.text,'');assert.ok(b.scanHash.startsWith('DEMO'));assert.ok(b.bytes.includes('仅元数据'));assert.equal(b.filename,'metadata-only.pdf');
 for(let stage=1;stage<=4;stage++)w.act('knowledge.book.advance',{id});b=w.knowledge.books[0];assert.equal(b.stage,4);assert.ok(b.text);assert.ok(b.doubts.length);w.denied('knowledge.book.reviewPage',{id,page:1},/人工精校/);w.act('knowledge.book.advance',{id});resolve(w,id);w.act('knowledge.book.reviewAll',{id});w.act('knowledge.book.publish',{id});b=w.knowledge.books[0];assert.equal(b.status,'published');assert.equal(w.knowledge.stories.find(x=>x.id===s.id)!.released,true);
 w.act('knowledge.query',{query:'新经典',mode:'local',profile:'me'});assert.ok(w.knowledge.query.results.some(r=>r.book===id));w.act('knowledge.quiz',{id:s.id,profile:'me',answer:s.quiz.answer});assert.equal(w.knowledge.progress.me[s.id].complete,true);
});

test('修订保留旧原文与课程引用，先重核故事再刷新课程，旧学习不冒充新版掌握',()=>{
 const w=world();const b=w.knowledge.books.find(b=>b.id==='bk2')!,oldVersion=b.version,oldText=b.text;const story=w.knowledge.stories.find(s=>s.id==='st3')!;
 w.act('knowledge.course.save',{profile:'son',title:'史料入门',goal:'区分证据和解读',structure:'theme',pace:'normal',stories:[story.id]});const c=w.knowledge.courses.son.at(-1)!;
 w.act('knowledge.quiz',{id:story.id,profile:'me',answer:story.quiz.answer});w.act('knowledge.book.revision',{id:b.id,text:oldText+'（示例勘误）',reason:'重查第2页图定位',page:2,checked:true});
 const current=w.knowledge.books.find(x=>x.id===b.id)!;assert.notEqual(current.version,oldVersion);assert.equal(current.revisions.at(-1)!.text,oldText);assert.equal(current.revisions.at(-1)!.version,oldVersion);assert.ok(current.revisions.at(-1)!.date);assert.ok(current.audit.some(e=>e.text.includes('修订')));assert.equal(w.knowledge.courses.son.find(x=>x.id===c.id)!.versions[story.id],oldVersion);
 assert.equal(w.knowledge.stories.find(s=>s.id===story.id)!.dirty,true);w.denied('knowledge.quiz',{id:story.id,profile:'me',answer:story.quiz.answer},/不可学习/);w.denied('knowledge.course.refresh',{id:c.id,profile:'son'},/待更新/);
 w.act('knowledge.story.update',{id:story.id});w.act('knowledge.course.refresh',{id:c.id,profile:'son'});assert.equal(w.knowledge.courses.son.find(x=>x.id===c.id)!.versions[story.id],current.version);
 w.act('knowledge.story.listen',{id:story.id,profile:'me'});const p=w.knowledge.progress.me[story.id];assert.equal(p.listened,true);assert.equal(p.complete,undefined);assert.equal(p.version,current.version);assert.equal(p.history?.at(-1)?.version,oldVersion);
 w.act('knowledge.quiz',{id:story.id,profile:'me',answer:story.quiz.answer});assert.equal(w.knowledge.progress.me[story.id].complete,true);assert.equal(w.knowledge.progress.me[story.id].attempts,2);
});

test('个人收藏测验按当前身份隔离，听过不等于掌握，公共空间不保存个人进度',()=>{
 const w=world(),s=w.knowledge.stories.find(s=>s.id==='st3')!;const meBefore=JSON.stringify(w.knowledge.progress.me),meFavorites=JSON.stringify(w.knowledge.favorites.me);w.act('profile.select',{id:'wife'});
 w.denied('knowledge.quiz',{id:s.id,profile:'me',answer:s.quiz.answer},/切换/);w.act('knowledge.story.favorite',{id:s.id,profile:'wife'});w.act('knowledge.story.listen',{id:s.id,profile:'wife'});assert.equal(w.knowledge.progress.wife[s.id].listened,true);assert.notEqual(w.knowledge.progress.wife[s.id].complete,true);
 w.act('knowledge.quiz',{id:s.id,profile:'wife',answer:(s.quiz.answer+1)%s.quiz.choices.length});assert.equal(w.knowledge.progress.wife[s.id].complete,false);assert.equal(w.knowledge.progress.wife[s.id].review,'今天');w.act('knowledge.quiz',{id:s.id,profile:'wife',answer:s.quiz.answer});assert.equal(w.knowledge.progress.wife[s.id].attempts,2);assert.equal(w.knowledge.progress.wife[s.id].last,w.knowledge.progress.wife[s.id].at);assert.equal(w.knowledge.progress.wife[s.id].review,'明天');
 assert.equal(JSON.stringify(w.knowledge.progress.me),meBefore);assert.equal(JSON.stringify(w.knowledge.favorites.me),meFavorites);w.denied('knowledge.quiz',{id:s.id,profile:'wife',answer:99},/有效答案/);
 w.act('profile.select',{id:'public'});w.act('knowledge.query',{query:'人物',mode:'all',profile:'public'});for(const type of ['knowledge.story.favorite','knowledge.story.listen','knowledge.quiz'])w.denied(type,{id:s.id,profile:'public',answer:s.quiz.answer},/公共空间/);
});

test('管理员给家人规划课程仍按目标成员范围过滤，不能分配公司或私有原文',()=>{
 const w=world();const b=w.knowledge.books.find(b=>b.id==='bk2')!;b.scope='company';b.owner='me';w.denied('knowledge.course.save',{profile:'son',title:'不可分配',goal:'测试',structure:'theme',pace:'normal',stories:['st3']},/学习者/);
 w.act('knowledge.course.save',{profile:'me',title:'本人路线',goal:'测试',structure:'theme',pace:'short',stories:['st3']});assert.ok(w.knowledge.courses.me.length);w.denied('knowledge.course.save',{profile:'public',title:'不可存公共',goal:'测试',structure:'theme',pace:'normal',stories:['st3']},/公共空间/);
});

test('资料转换保留原话与私有范围，附件说明不能变成OCR原文，私有收件不能越权',()=>{
 const w=world();w.knowledge.materials.push({id:'private-note',title:'本人经验笔记',text:'这就是原始提交文字。',owner:'me',terminal:'联想开发机',scope:'private',at:'2026-10-05 08:00',status:'pending'});
 w.act('knowledge.material.convert',{id:'private-note',target:'book'});let b=w.knowledge.books[0];assert.equal(b.text,'这就是原始提交文字。');assert.equal(b.scope,'private');assert.equal(b.owner,'me');assert.equal(b.status,'review');assert.ok(b.rights.includes('联想开发机'));assert.equal(w.knowledge.materials[0].target,b.id);w.denied('knowledge.material.convert',{id:'private-note',target:'source'},/已经处理/);
 w.knowledge.materials.push({id:'scan-description',title:'待处理扫描件',text:'只有附件说明，没有读取原文。',owner:'me',terminal:'书房',scope:'private',at:'2026-10-05 08:10',status:'pending',metadata:{kind:'scan-description'}});w.denied('knowledge.material.convert',{id:'scan-description',target:'book'},/不是识别原文/);
 w.act('knowledge.book.upload',{materialId:'scan-description',title:'待处理扫描件',edition:'样卷 A',source:'src-local',pages:3,rights:'模拟原件登记',filename:'scan-metadata.pdf',fileSize:4096});b=w.knowledge.books[0];assert.equal(b.scope,'private');assert.equal(b.owner,'me');assert.equal(b.text,'');assert.equal(w.knowledge.materials.find(m=>m.id==='scan-description')!.status,'book');
 w.knowledge.materials.push({id:'other-private',title:'其他成员私有文字',text:'不准代取。',owner:'wife',terminal:'家庭终端',scope:'private',at:'2026-10-05 08:20',status:'pending'});w.denied('knowledge.material.convert',{id:'other-private',target:'book'},/其他成员/);
 w.knowledge.materials.push({id:'source-note',title:'来源候选',text:'本人授权之前不检索。',owner:'me',terminal:'书房',scope:'private',at:'2026-10-05 08:30',status:'pending'});w.act('knowledge.material.convert',{id:'source-note',target:'source'});const id=w.knowledge.materials.find(m=>m.id==='source-note')!.target!;const src=w.knowledge.sources.find(s=>s.id===id)!;assert.equal(src.authorized,false);assert.equal(src.active,false);assert.equal(src.owner,'me');assert.equal(src.originalScope,'private');
});

test('缺口建议保留管理员决策，不捏造下载资料或原文；无效选择不改变状态',()=>{
 const w=world(),g=w.knowledge.gaps[0],before=w.knowledge.materials.length;w.denied('knowledge.gap.accept',{id:g.id,next:'purchase'},/补充方式/);w.act('knowledge.gap.accept',{id:g.id,next:'collect',note:'先找到带版本与页码的地图'});assert.equal(w.knowledge.gaps[0].state,'accepted');assert.equal(w.knowledge.gaps[0].next,'collect');assert.equal(w.knowledge.materials.length,before);assert.ok(w.knowledge.gaps[0].acceptedAt);w.act('knowledge.gap.state',{id:g.id,state:'deferred'});assert.equal(w.knowledge.gaps[0].state,'deferred');
});
