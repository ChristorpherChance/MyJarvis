(function(){
 'use strict';
 const scopeNames={family:'家庭共享',personal:'本人私有',company:'公司项目'};
 const modeNames={local:'本地索引',live:'实时查询',hybrid:'混合检索'};
 const stages=['原件登记','版面预处理','版式解析','OCR 初稿','交叉校对','人工精校','正式发布'];
 const stageDescriptions=['核对文件、页数和页序，保留不可变原件。','模拟完成倾斜、重页、模糊与漏页检查。','模拟识别正文、注释、标题及竖排阅读顺序。','模拟第一轮文字识别，保留区块与页图位置。','模拟第二条识别路径比对，疑点进入人工队列。','所有关键疑点须明确裁决，并完成逐页人工精校。','正式原文版本已发布，可进入知识检索与故事教学。'];
 const sampleQuotes=[
  '子曰：「學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？人不知而不慍，不亦君子乎？」',
  '有朋自遠方來，不亦樂乎？',
  '人不知而不慍，不亦君子乎？'
 ];
 function seedDoubts(){return [
  {id:'dq1',page:2,type:'字形分歧',critical:true,status:'pending',ocr:'了曰：「學而時習之」',alternate:'子曰：「學而時習之」',expected:'子曰：「學而時習之」',focus:'子',before:'',after:'曰：「學而時習之」',reason:'子 / 了字形相近，主识别与交叉校对结果不一致。',confidence:72,decision:'',note:''},
  {id:'dq2',page:6,type:'原字与释义',critical:true,status:'pending',ocr:'不亦悦乎？',alternate:'不亦說乎？',expected:'不亦說乎？',focus:'說',before:'不亦',after:'乎？',reason:'释义可以用“悦”，忠实原文层需保留页图上的“說”，不能被现代写法覆盖。',confidence:66,decision:'',note:''},
  {id:'dq3',page:11,type:'生僻字误识别',critical:true,status:'pending',ocr:'人不知而不温',alternate:'人不知而不慍',expected:'人不知而不慍',focus:'慍',before:'人不知而不',after:'，不亦君子乎？',reason:'慍被识别为温；此字关系句意，属于关键疑点。',confidence:58,decision:'',note:''}
 ];}
 function initialState(){return {
  sources:[
   {id:'src-local',name:'家庭经典 · 校勘基库',type:'本地文档库',mode:'local',scope:'family',endpoint:'qnap://jarvis/classics',topics:'经典 / 历史 / 人物',active:true,authorized:true,rights:'家庭内部学习；原件与衍生解读分层管理',sync:'10月03日 16:50',count:54,health:'可用',version:'index-12',records:[{title:'学而：学习与复习',text:'学而时习之的原文、释义与学习应用；正式原文检索只召回已发布版本。',book:'bk1'},{title:'史料与故事的区别',text:'同一人物可以有不同来源的记载，阅读时区分史料、解释和文学改编。',book:'bk2'}]},
   {id:'src-museum',name:'博物馆资料 · 示例连接',type:'公开 API',mode:'hybrid',scope:'family',endpoint:'https://museum.example.invalid/api',topics:'器物 / 地理 / 朝代',active:true,authorized:true,rights:'演示授权；图像与文本保留出处',sync:'10月03日 16:30',count:128,health:'可用',version:'snapshot-8',records:[{title:'器物与日常生活',text:'通过器物理解古人的生活方式，结合年代、用途与出处共同阅读。'},{title:'交通地图与历史事件',text:'示例地图资料帮助连接地理背景、人物和事件。'}]},
   {id:'src-company',name:'公司技术资料 · 受限示例',type:'知识服务 API',mode:'live',scope:'company',endpoint:'https://company.example.invalid/kb',topics:'项目 / 运维 / 开发',active:true,authorized:true,rights:'仅本人公司项目范围；不得进入家庭课程',sync:'按查询更新',count:76,health:'可用',version:'remote-3',records:[{title:'服务部署排查方法',text:'公司项目样例，面向授权账号的运行日志与部署经验。'}]},
   {id:'src-disabled',name:'旧版行业资料 · 已停用',type:'网页集合',mode:'local',scope:'personal',endpoint:'archive://industry-2020',topics:'行业 / 商业',active:false,authorized:false,rights:'授权已到期；索引与缓存停止召回',sync:'9月25日 20:10',count:43,health:'已停用',version:'archive-2',records:[{title:'旧版行业分析',text:'此记录用于演示停用和撤权后不进入检索结果。'}]}
  ],
  books:[
   {id:'bk1',title:'论语 · 学而样卷',cover:'论语',edition:'繁体竖排 · 模拟扫描 A 版',author:'孔子弟子及再传弟子',source:'src-local',rights:'本原型生成的示例页图；非真实扫描件',filename:'论语_学而_样卷_30页.pdf',pages:30,bytes:'18.4 MB · 示例',stage:5,status:'review',version:'1.0',rounds:2,reviewed:[],doubts:seedDoubts(),text:sampleQuotes[0],normalized:'学习并经常温习；与朋友交流；不因别人不了解自己而恼怒。',scanHash:'SHA256 · DEMO-7A3F-91C8',created:'10月03日 15:20',published:null,revisions:[],layout:'竖排 / 正文 + 注释',audit:[{time:'15:24',text:'初稿完成；30 页页序和版式检查通过。'},{time:'15:32',text:'完成两轮交叉校对，3 个关键疑点待人工审核。'}]},
   {id:'bk2',title:'史记 · 人物阅读样卷',cover:'史记',edition:'教学演示 B 版 · 原文与解读分层',author:'司马迁',source:'src-local',rights:'模拟书目和页图；课程文字为示例解读',filename:'史记_人物样卷_24页.pdf',pages:24,bytes:'14.1 MB · 示例',stage:6,status:'published',version:'1.2',rounds:3,reviewed:Array.from({length:24},(_,i)=>i+1),doubts:[],text:'史料阅读应辨明时代、作者、材料来源与不同记载。此段为教学样例，不冒充《史记》原文。',normalized:'把每条知识的出处与解释分开，避免把生动叙事当作原始证据。',scanHash:'SHA256 · DEMO-C4B8-31D9',created:'10月01日 09:40',published:'10月02日 19:20',revisions:[{version:'1.1',date:'10月02日 17:00',text:'模拟页码定位勘误，重新校核并发布。',reason:'页码映射校正'}],layout:'横排 / 正文 + 插图',audit:[{time:'19:20',text:'24 页人工精校完成，发布原文版本 1.2。'}]}
  ],
  stories:[
   {id:'st1',title:'把“学而时习之”变成生活习惯',book:'bk1',page:2,chapter:'学而 · 第1章',version:'1.0',released:false,dirty:false,topic:'学习方法',duration:6,level:'入门',summary:'从一个小问题开始：听懂之后，为什么还需要复习？把经典中的学习观念连到今天的练习。',quote:sampleQuotes[0],sections:['先听一句原文，再观察三个词：学、时、习。这里的教学解读是一种学习应用，并不等同于原文唯一的解释。','可以把新学的东西说给家人听，过一段时间再回忆。一次短练习，往往能发现“我以为会了”和“我真的会了”的差别。','今天选一个你刚学会的小知识，先不看资料，用自己的话解释。下一次我们再回访它。'],quiz:{question:'这则故事建议怎样检验自己是否掌握？',choices:['只看一遍就算学会','隔一段时间，用自己的话回忆和解释','一直听讲，不尝试表达'],answer:1,explanation:'回忆与解释能帮助发现理解中的缺口；故事中的建议属于教学应用。'},connections:['复习','表达','学习方法']},
   {id:'st2',title:'别人不理解我时，怎么回应？',book:'bk1',page:11,chapter:'学而 · 第1章',version:'1.0',released:false,dirty:false,topic:'人物与生活',duration:5,level:'入门',summary:'从“不慍”引出情绪与沟通：保持冷静，再把自己的想法表达清楚。',quote:sampleQuotes[2],sections:['“慍”与情绪有关。在这个示例讲解中，我们把它与家庭生活里的误解联系起来。','别人不知道你的努力，不一定是有意否定你。先确认对方是否听懂，再说明事实与感受。','这是一种现代应用的解读。我们不把所有情境都简化为一句经典，也可以讨论你自己的不同看法。'],quiz:{question:'这则故事把原文和哪种生活情境联系起来？',choices:['遇到误解时的沟通','制作菜谱','远程部署服务器'],answer:0,explanation:'它用经典引出冷静表达与确认理解，并保留“教学解读”的标记。'},connections:['情绪','沟通','经典应用']},
   {id:'st3',title:'同一个人物，为什么会有不同故事？',book:'bk2',page:8,chapter:'史料阅读 · 示例单元',version:'1.2',released:true,dirty:false,topic:'历史与证据',duration:8,level:'入门',summary:'比较故事的出处、作者与目的，学习把史料记载、作者解释和文学创作分开。',quote:'此单元为教学示例，不冒充书籍原文引句。',sections:['同一个人物可以在不同材料中出现。先问：谁记录的？距离事件多久？作者想说明什么？','把“材料写了什么”和“我怎样理解它”分开。不同材料的差异可以保留下来，不能只选择最顺耳的版本。','故事可以独立听，也能接到时间线、人物关系和地理背景。今天我们先练习给每条说法标一个出处。'],quiz:{question:'面对两条不同记载，先做什么更合适？',choices:['选择更有趣的一条','检查来源、时代与表达目的','把它们合成一个没有分歧的故事'],answer:1,explanation:'先看证据和来源，保留分歧，才能做有根据的比较。'},connections:['人物','证据','争议']},
   {id:'st4',title:'把人物放回他的时代',book:'bk2',page:12,chapter:'时间线 · 示例单元',version:'1.2',released:true,dirty:false,topic:'历史与地理',duration:7,level:'进阶',summary:'用时间线、地理与制度作为背景，让独立的小故事连接成有来处的知识脉络。',quote:'此单元为教学示例；具体事实必须回到正式来源核对。',sections:['一则人物故事容易记住。但只记人物，可能看不到他面对的条件。','把人物放到时间线里，再观察地点、交通、制度和周围的人。关系图是引导阅读的地图，图上的关系仍然需要证据。','下一次听到一个判断，试着问“在什么时期、什么地点、什么材料里”。这些问题能帮你建立知识脉络。'],quiz:{question:'知识关系图主要帮助我们做什么？',choices:['代替所有原始证据','组织背景与阅读路径，并回到出处核对','把不同版本自动变成同一版本'],answer:1,explanation:'图谱组织路径，来源提供证据；两者各有职责。'},connections:['时间线','地理','制度']}
  ],
  gaps:[
   {id:'gp1',title:'补齐历史路线中的地理背景',type:'呈现缺口',score:88,state:'pending',reason:'已有人物与时间线故事，但对应地图资料不足，下一课的地理背景难以讲清楚。',need:'有出处的地图，或可确认时期与地点的书籍章节',impact:'历史与证据 · 第2讲',action:'先检索已接入的博物馆资料，再决定是否补充新来源。'},
   {id:'gp2',title:'给“說 / 悦”增加字义与异文说明',type:'证据缺口',score:82,state:'pending',reason:'识别疑点暴露了原字与现代释义的差别，适合补充一则“原文为何不能随意改写”的知识单元。',need:'正式注本的相关说明，以及版本与页码',impact:'学而 · 原文释义与学习方法',action:'校对完成后，整理已有注释为独立教学单元。'},
   {id:'gp3',title:'新增人物故事的另一种史料视角',type:'争议缺口',score:73,state:'deferred',reason:'当前示例路线只有一类人物材料，需要另一条独立来源来练习比较记载。',need:'同一人物的另一类可信资料，保留作者、时期和版本',impact:'史料阅读 · 对照练习',action:'用户选择相关人物后，列出可补齐的来源类型。'},
   {id:'gp4',title:'把理解困难变成 3 分钟先修故事',type:'学习缺口',score:69,state:'pending',reason:'模拟学习记录中，“证据”和“解释”的差别容易混淆，可先讲一个更短的例子。',need:'一个适合当前学习基础的对照例子',impact:'历史与证据 · 入门路线',action:'先生成候选单元，由管理员核对出处后发布。'}
  ],
  materials:[],favorites:{me:[],wife:[],son:[],dad:[],mom:[]},courses:{me:[],wife:[],son:[],dad:[],mom:[]},progress:{me:{},wife:{},son:{},dad:{},mom:{}},query:{text:'',results:[],at:''},events:[{time:'16:50',text:'本地基库完成索引同步；校对草稿未进入正式检索。'},{time:'16:30',text:'博物馆示例连接可用，启用混合检索。'}]
 };}
 J5.initializers.push(v=>{if(!v.knowledgeCenter)v.knowledgeCenter=initialState();const k=v.knowledgeCenter;k.materials||=[];for(const p of ['me','wife','son','dad','mom']){k.favorites[p]||=[];k.courses[p]||=[];k.progress[p]||={};}});
 const K=()=>J5.state().knowledgeCenter;
 const book=id=>K().books.find(x=>x.id===id);
 const story=id=>K().stories.find(x=>x.id===id);
 const source=id=>K().sources.find(x=>x.id===id);
 const allowed=s=>!!s&&s.active&&s.authorized&&(s.scope==='family'||admin());
 const accessibleBook=b=>!!b&&allowed(source(b.source))&&(!b.scope||b.scope==='family'||admin()||(b.scope==='personal'&&b.owner===S.profile));
 const ready=s=>!!s&&s.released&&!s.dirty&&book(s.book)?.status==='published'&&accessibleBook(book(s.book));
 const visibleStories=()=>K().stories.filter(s=>admin()||ready(s));
 const critical=b=>b.doubts.filter(q=>q.critical&&q.status!=='resolved');
 const done=b=>b.doubts.filter(q=>q.status==='resolved').length;
 const currentBook=()=>book(U.kv5Book)||K().books.find(b=>b.status!=='published')||K().books[0];
 const profileName=()=>P().name;
 const uid=p=>p+'-'+Date.now().toString(36);
 function event(text){K().events.unshift({time:now(),text});K().events=K().events.slice(0,30);record(text,'知识神殿');}
 function commit(text){J5.commit(text);}
 function button(label,action,id='',cls='',icon=''){return B(label,'v5-k-'+action,id,cls,icon);}
 function stat(label,value,icon){return '<div class="card kv5-stat"><span class="kv5-stat-icon">'+I(icon,21)+'</span><div><b>'+E(value)+'</b><small>'+E(label)+'</small></div></div>';}
 function tabs(list,current,action){return '<div class="kv5-tabs">'+list.map(([id,label])=>'<button data-act="v5-k-'+action+'" data-id="'+E(id)+'" class="'+(current===id?'active':'')+'">'+E(label)+'</button>').join('')+'</div>';}
 function callout(text,actions=''){return '<div class="kv5-callout">'+I('info',22)+'<div class="grow">'+text+'</div>'+ (actions?'<div class="head-actions">'+actions+'</div>':'')+'</div>';}
 function citation(s){const b=book(s.book);return E(b?.title||'未关联书目')+' · '+E(b?.edition||'')+' · 原文 v'+E(s.version)+' · 第 '+E(s.page)+' 页 · '+E(s.chapter);}
 function bookState(b){return b.status==='published'?badge('已发布 v'+b.version,'green'):b.stage<5?badge(stages[b.stage],'blue'):badge(critical(b).length+' 个关键疑点待处理','amber');}
 function scopeOptions(){return [['family','家庭共享'],['personal','本人私有'],['company','公司项目']];}
 function modeOptions(){return [['local','本地索引'],['live','实时查询'],['hybrid','混合检索']];}
 function storyState(s){if(s.dirty)return badge('原文已修订 · 待更新','amber');return ready(s)?badge('可学习','green'):badge('等待原文发布','amber');}
 function emptyState(text){return '<div class="card kv5-empty">'+I('book',31)+E(text)+'</div>';}
 function sourcesView(){
  const k=K(),tab=U.kv5SourceTab||'registry',enabled=k.sources.filter(s=>s.active&&s.authorized);
  let body='';
  if(tab==='registry')body='<div class="kv5-source-list">'+k.sources.map(s=>'<article class="card kv5-source"><div class="kv5-source-icon">'+I(s.type.includes('API')?'link':'book',23)+'</div><div><div class="row wrap between"><h3>'+E(s.name)+'</h3>'+badge(s.active&&s.authorized?'已启用':s.authorized?'已停用':'授权已撤销',s.active&&s.authorized?'green':'')+'</div><p>'+E(s.topics)+' · '+E(s.rights)+'</p><div class="kv5-source-meta"><span>'+E(s.type)+'</span><span>'+E(modeNames[s.mode])+'</span><span>'+E(scopeNames[s.scope])+'</span><span>'+s.count+' 条示例资料</span><span>同步 '+E(s.sync)+'</span></div></div><div class="kv5-source-actions">'+button('配置','source',s.id,'compact','settings')+button('同步','sync',s.id,'compact','refresh')+button(s.active?'停用':'启用','toggle-source',s.id,s.active?'compact':'compact green-btn',s.active?'pause':'play')+'</div></article>').join('')+'</div>';
  if(tab==='query')body='<div class="card card-pad"><div class="row wrap between mb20"><div><h2>授权知识联合检索</h2><p class="subtitle">关键词 + 语义示例结果；停用、撤权、未发布原文不会召回</p></div>'+badge('离线模拟','blue')+'</div>'+formStart('v5-k-query')+field('提问或关键词','query',k.query.text,'text','placeholder="例如：人物、学习方法、器物、地理" required')+selectField('检索方式','mode',[['all','联合所有有效授权源'],['local','只查本地索引'],['live','只查实时 / 混合源']],'all')+formEnd()+'<div class="head-actions mt16">'+formFooter('开始模拟检索','v5-k-query')+'</div><div class="divider"></div>'+(k.query.at?'<div class="small muted mb20">检索时间 '+E(k.query.at)+' · 当前身份 '+E(profileName())+' · '+k.query.results.filter(r=>allowed(source(r.source))).length+' 个匹配结果</div>':'<div class="small muted mb20">可以先查询“人物”，再停用本地基库并重新检索，观察授权与发布状态的影响。</div>')+'<div class="kv5-stack">'+k.query.results.filter(r=>allowed(source(r.source))&&(!r.book||book(r.book)?.status==='published')).map(r=>'<div class="kv5-source-result">'+I('file',22)+'<div class="grow"><h3>'+E(r.title)+'</h3><p>'+E(r.text)+'</p><div class="kv5-cite">'+E(source(r.source)?.name)+' · '+E(modeNames[source(r.source)?.mode])+' · '+E(r.book?'原文 v'+book(r.book).version:'来源版本 '+source(r.source)?.version)+'</div></div>'+button('来源','source',r.source,'compact','eye')+'</div>').join('')+(!k.query.results.length?'<div class="kv5-empty">检索结果将在这里显示。结果与实时网络无关。</div>':'')+'</div></div>';
  if(tab==='health')body='<div class="kv5-two"><div class="card card-pad"><h2>连接器与同步策略</h2><div class="setting-row"><div><h3>可动态扩展连接器</h3><p>新增知识源立即登记；索引、实时、混合三模式可独立切换。</p></div>'+badge('按需扩展','blue')+'</div><div class="setting-row"><div><h3>来源权限先于检索</h3><p>家庭身份只能召回共享且有效授权的正式内容。</p></div>'+badge('已开启','green')+'</div><div class="setting-row"><div><h3>失败与部分结果可见</h3><p>停用来源保留登记；撤权后不进入检索和教学。</p></div>'+button('模拟故障','source-failure','src-museum','compact','bolt')+'</div><div class="setting-row"><div><h3>容量与并发有界</h3><p>连接器数量可扩展；示例并发 3 路，超时来源不伪装成完整搜索。</p></div>'+badge('模拟配额','')+'</div></div><div class="card"><div class="card-header"><h2>最近知识事件</h2></div><div class="timeline">'+k.events.slice(0,8).map(x=>'<div class="timeline-item">'+E(x.text)+'<time>'+E(x.time)+'</time></div>').join('')+'</div></div></div>';
  return '<section class="kv5-workspace">'+pageHead('知识接入中心','知识储备随时扩展，每个来源都有范围、模式与更新记录',button('登记知识源','new-source','','primary','plus'))+'<div class="kv5-summary">'+stat('有效授权源',enabled.length,'link')+stat('已登记来源',k.sources.length,'grid')+stat('示例资料',enabled.reduce((n,s)=>n+s.count,0),'file')+stat('共享来源',enabled.filter(s=>s.scope==='family').length,'family')+'</div>'+callout('<b>来源可以不断接入。</b> 知识储备采用连接器扩展，按身份与问题选择来源；所有外部连接均为模拟。')+tabs([['registry','知识源登记'],['query','联合检索'],['health','同步与健康']],tab,'source-tab')+body+'</section>';
 }
 function bookCard(b){return '<article class="card kv5-book"><div class="kv5-cover '+(b.id==='bk2'?'sand':'')+'"><b>'+E(b.cover)+'</b><small>示例书目</small></div><div class="grow"><div class="row wrap between"><h3>'+E(b.title)+'</h3>'+bookState(b)+'</div><p class="kv5-description">'+E(b.edition)+'<br>'+E(b.layout)+' · '+b.pages+' 页 · 校对 '+b.rounds+' 轮</p><div class="kv5-pill-row"><span class="kv5-tag">原件保留</span><span class="kv5-tag">原文 v'+E(b.version)+'</span><span class="kv5-tag">'+E(b.status==='published'?'人工精校版':'待审核')+'</span></div><div class="head-actions">'+button('书目与版本','book',b.id,'compact','book')+(admin()?button(b.status==='published'?'原文与修订':'进入校对台','collate',b.id,'compact '+(b.status==='published'?'':'primary'),'edit'):'')+'</div></div></article>';}
 function storyCard(s){return '<article class="card kv5-story"><div class="row between"><span class="kv5-story-number">STORY / '+E(s.id.toUpperCase())+'</span>'+storyState(s)+'</div><h3>'+E(s.title)+'</h3><p>'+E(s.summary)+'</p><div class="kv5-pill-row"><span class="kv5-tag">'+E(s.topic)+'</span><span class="kv5-tag">'+s.duration+' 分钟</span><span class="kv5-tag">'+E(s.level)+'</span></div><div class="kv5-cite">'+citation(s)+'</div><div class="head-actions">'+button(ready(s)?'开始讲解':s.dirty?'查看影响':'查看待发布故事','story',s.id,ready(s)?'primary':'','speaker')+button(K().favorites[S.profile].includes(s.id)?'已收藏':'收藏','favorite',s.id,'compact','star')+(admin()&&s.dirty?button('更新派生内容','update-story',s.id,'compact green-btn','refresh'):'')+'</div></article>';}
 function graph(){
  const nodes=[{id:'learning',x:340,y:180,r:45,label:'知识脉络',hub:true},{id:'st1',x:175,y:60,r:34,label:'学习与复习'},{id:'st2',x:100,y:190,r:34,label:'情绪与沟通'},{id:'st3',x:505,y:70,r:35,label:'人物与证据'},{id:'st4',x:580,y:200,r:35,label:'时代与地理'},{id:'bk1',x:240,y:320,r:31,label:'论语样卷'},{id:'bk2',x:450,y:320,r:31,label:'史记样卷'}];
  return '<div class="kv5-graph-wrap"><svg class="kv5-graph" viewBox="0 0 680 380" role="img" aria-label="点击节点查看知识关系、出处与故事"><title>人物、概念、故事与原文之间的示例关系图</title>'+nodes.filter(n=>!n.hub).map(n=>'<line x1="340" y1="180" x2="'+n.x+'" y2="'+n.y+'"/>').join('')+'<line x1="175" y1="60" x2="240" y2="320"/><line x1="100" y1="190" x2="240" y2="320"/><line x1="505" y1="70" x2="450" y2="320"/><line x1="580" y1="200" x2="450" y2="320"/>'+nodes.map(n=>'<g data-act="v5-k-node" data-id="'+n.id+'" tabindex="0" role="button" aria-label="'+E(n.label)+'"><circle cx="'+n.x+'" cy="'+n.y+'" r="'+n.r+'" class="'+(n.hub?'kv5-hub':'')+'"/><text x="'+n.x+'" y="'+(n.y+5)+'" text-anchor="middle" class="'+(n.hub?'kv5-hub-text':'')+'">'+E(n.label)+'</text></g>').join('')+'</svg><div class="kv5-legend"><span><i></i>主题关系</span><span>故事保持独立，可在不同路线复用</span><span>每条关系回到版本与页码</span></div></div>';
 }
 function courseCard(c){
  const list=c.stories.map(story).filter(Boolean),doneCount=list.filter(s=>K().progress[S.profile][s.id]?.complete).length;
  return '<article class="card kv5-curriculum"><div class="row wrap between"><div><h3>'+E(c.title)+'</h3><div class="subtitle">'+E(profileName())+'的课程 · '+list.length+' 个故事 · '+list.reduce((n,s)=>n+s.duration,0)+' 分钟</div></div>'+badge(doneCount+'/'+list.length+' 已学习',doneCount===list.length?'green':'blue')+'</div><div class="mt16">'+progress(list.length?doneCount/list.length*100:0,'green-progress')+'</div>'+list.map((s,i)=>'<div class="kv5-route-line"><span class="kv5-route-dot '+(K().progress[S.profile][s.id]?.complete?'done':'')+'">'+(K().progress[S.profile][s.id]?.complete?'✓':i+1)+'</span><div class="grow"><b class="small">'+E(s.title)+'</b><div class="tiny muted">'+(s.version!==c.versions[s.id]?'原文已更新 · 课程需刷新':'原文 v'+E(c.versions[s.id]))+' · '+s.duration+' 分钟</div></div>'+button('学习','story',s.id,'compact','play')+'</div>').join('')+'<div class="head-actions mt16">'+button('刷新课程版本','refresh-course',c.id,'compact','refresh')+button('移除课程','remove-course',c.id,'compact ghost','trash')+'</div></article>';
 }
 function gapCard(g){const states={pending:'待决策',accepted:'已接受',deferred:'已暂缓',ignored:'已忽略'};return '<article class="card kv5-gap"><div class="kv5-gap-icon">'+I('flag',20)+'</div><div><div class="row wrap between"><h3>'+E(g.title)+'</h3>'+badge(states[g.state],g.state==='accepted'?'green':g.state==='pending'?'amber':'')+'</div><p>'+E(g.reason)+'</p><p><b>需要：</b>'+E(g.need)+'<br><b>影响：</b>'+E(g.impact)+'<br><b>建议：</b>'+E(g.action)+'</p><div class="kv5-score mt16">'+E(g.type)+' · 工程优先级 '+g.score+' / 100 · 不是知识完整度或事实概率</div></div><div class="head-actions">'+(g.state==='pending'||g.state==='deferred'?button('接受','gap-accept',g.id,'compact green-btn','check'):'')+button('暂缓','gap-defer',g.id,'compact','clock')+button('忽略','gap-ignore',g.id,'compact ghost','close')+'</div></article>';}
 function templeView(){
  const k=K(),tab=U.kv5TempleTab||'stories',stories=visibleStories();
  let body='';
  if(tab==='books')body='<div class="kv5-two">'+k.books.filter(b=>admin()||(b.status==='published'&&accessibleBook(b))).map(bookCard).join('')+'</div><div class="kv5-three">'+[{name:'原件库',text:'扫描 PDF、照片和页图永久保留。文件哈希、页序与版式检查有记录；识别文字不会覆盖原件。',icon:'file',tag:'不可变原件'},{name:'校勘基库',text:'OCR 候选、忠实转录、规范化文本与每一次人工裁决分开保存。每段文字对应页图位置。',icon:'edit',tag:'精校后发布'},{name:'知识神殿',text:'人物、概念、故事、关系、路线和索引绑定原文版本。原文勘误会使相关派生内容待更新。',icon:'book',tag:'证据与解读分层'}].map(x=>'<div class="card kv5-asset">'+I(x.icon,25)+'<h3>'+E(x.name)+'</h3><p>'+E(x.text)+'</p><span class="kv5-tag">'+E(x.tag)+'</span></div>').join('')+'</div>'+(admin()&&k.materials.length?'<div class="card card-pad"><h2>统一收件中的待处理资料</h2><p class="subtitle">保留终端、提交者和原始文字；不会直接进入正式知识检索。</p><div class="kv5-stack mt24">'+k.materials.map(m=>'<div class="kv5-source-result">'+I('file',22)+'<div class="grow"><h3>'+E(m.title)+'</h3><p>'+E(m.text.slice(0,200))+'</p><div class="kv5-cite">提交者 '+E(m.owner)+' · 终端 '+E(m.terminal)+' · '+E(scopeNames[m.scope]||m.scope)+' · '+E(m.at)+'</div></div>'+badge(m.status==='pending'?'待管理员处理':m.status==='source'?'已转来源候选':'已转原文草稿',m.status==='pending'?'amber':'green')+(m.status==='pending'?'<div class="head-actions">'+button('转原文草稿','material-book',m.id,'compact','book')+button('转来源候选','material-source',m.id,'compact','link')+'</div>':'')+'</div>').join('')+'</div></div>':'');
  if(tab==='stories')body='<div class="row wrap between"><p class="small muted">正式故事 '+k.stories.filter(ready).length+' 则 · 当前身份 '+E(profileName())+' · 收藏 '+k.favorites[S.profile].length+' 则</p><div class="head-actions">'+button('只看收藏','favorite-filter','',U.kv5FavoritesOnly?'green-btn compact':'compact','star')+button('规划个人课程','new-course','','compact primary','plus')+'</div></div><div class="kv5-three">'+stories.filter(s=>!U.kv5FavoritesOnly||k.favorites[S.profile].includes(s.id)).map(storyCard).join('')+'</div>'+(!stories.filter(s=>!U.kv5FavoritesOnly||k.favorites[S.profile].includes(s.id)).length?emptyState('这里还没有可学习的故事。可以先发布完成精校的原文，或取消收藏筛选。'):'');
  if(tab==='graph')body='<div class="card card-pad"><div class="row wrap between mb20"><div><h2>有关联，也各自独立</h2><p class="subtitle">图谱组织阅读路径，原文提供证据。点击任一节点查看出处。</p></div>'+badge('示例关系图','blue')+'</div>'+graph()+'</div><div class="kv5-two">'+stories.filter(ready).slice(0,2).map(storyCard).join('')+'</div>';
  if(tab==='courses')body=callout('<b>'+E(profileName())+'的学习路线。</b> 故事可按主题、整本书或人物线编排；进度和课程只属于当前身份。',button('规划课程','new-course','','primary','plus'))+'<div class="kv5-two">'+k.courses[S.profile].map(courseCard).join('')+'</div>'+(k.courses[S.profile].length?'':emptyState('尚未规划课程。选择历史与证据路线，或从已发布故事中生成个人课程。'));
  if(tab==='gaps')body=callout('<b>补什么、为什么补、影响哪条路线。</b> 建议基于已确认的学习目标，优先检查现有资料；所有建议由你决策。')+'<div class="kv5-stack">'+k.gaps.map(gapCard).join('')+'</div>';
  const list=[['stories','独立故事'],['graph','知识脉络'],['courses','我的课程'],['books','书目与三层资产']];
  if(admin())list.push(['gaps','补充建议']);
  return '<section class="kv5-workspace">'+pageHead('知识神殿','把经典与资料组织成可溯源的知识脉络，规划讲给家人听',admin()?button('上传扫描样本','upload','','primary','upload'):button('我的学习路线','temple-tab','courses','primary','book'))+'<div class="kv5-summary">'+stat('正式原文',k.books.filter(b=>b.status==='published'&&accessibleBook(b)).length,'book')+stat('可学习故事',k.stories.filter(ready).length,'speaker')+stat('我的课程',k.courses[S.profile].length,'tasks')+stat(admin()?'待决策缺口':'我的收藏',admin()?k.gaps.filter(g=>g.state==='pending').length:k.favorites[S.profile].length,admin()?'flag':'star')+'</div>'+tabs(list,tab,'temple-tab')+body+'</section>';
 }
 function pipeline(b){return '<div class="kv5-process">'+stages.map((x,i)=>'<div class="kv5-stage '+(i<b.stage?'done':i===b.stage?'current':'')+'"><span>'+(i<b.stage?'✓':i+1)+'</span>'+E(x)+'</div>').join('')+'</div>';}
 function quality(b){const flags=[{label:'原件与页序完整',ok:b.stage>=2},{label:'关键疑点 '+done(b)+'/'+b.doubts.length,ok:!critical(b).length&&b.stage>=5},{label:'逐页精校 '+b.reviewed.length+'/'+b.pages,ok:b.reviewed.length===b.pages}];return '<div class="kv5-quality">'+flags.map(x=>'<span class="kv5-quality-check '+(x.ok?'pass':'fail')+'">'+I(x.ok?'check':'clock',16)+E(x.label)+'</span>').join('')+'<div class="head-actions">'+button(b.status==='published'?'修订原文':'发布精校版',b.status==='published'?'revision':'publish',b.id,b.status==='published'?'':'primary',b.status==='published'?'edit':'check')+'</div></div>';}
 function pageFacsimile(b,q){const page=q?.page||U.kv5Page||1;return '<div class="kv5-facsimile"><div class="kv5-page-label">'+E(b.cover)+' · '+E(b.edition)+' · 第 '+page+' 页</div><div class="kv5-page-text">'+(q?E(q.before)+'<mark>'+E(q.focus)+'</mark>'+E(q.after):E(b.id==='bk1'?sampleQuotes[(page-1)%3]:'史料與解讀分層保存。\n示例頁圖不代替真實原文。'))+'</div><div class="kv5-page-foot">原型绘制的模拟页图 · 区块 '+(q?'B-'+q.page+'-01':'B-'+page+'-01')+' · 可以回到原件位置</div></div>';}
 function reviewPanel(b){
  const q=b.doubts.find(x=>x.id===U.kv5Doubt)||b.doubts.find(x=>x.status!=='resolved')||b.doubts[0];
  if(!q)return '<div class="kv5-review">'+pageFacsimile(b,null)+'<div class="kv5-review-panel"><h3>原文与解读分层</h3>'+badge('已精校','green')+'<div class="divider"></div><p class="kv5-reading">'+E(b.text)+'</p><div class="divider"></div><div class="small muted">原文 v'+E(b.version)+' · '+b.pages+' 页 · 完整人工复核</div><div class="head-actions mt24">'+button('修订原文','revision',b.id,'primary','edit')+button('查看版本','collation-tab','versions','','history')+'</div></div></div>';
  return '<div class="kv5-review">'+pageFacsimile(b,q)+'<div class="kv5-review-panel"><div class="row wrap between"><h3>第 '+q.page+' 页 · '+E(q.type)+'</h3>'+badge(q.status==='resolved'?'已裁决':q.status==='escalated'?'待重新扫描':'关键疑点',q.status==='resolved'?'green':'amber')+'</div><p class="kv5-description">'+E(q.reason)+'</p><div class="kv5-compare"><div><span>初稿 OCR · 示例分数 '+q.confidence+'</span><strong>'+E(q.ocr)+'</strong></div><div><span>交叉识别候选</span><b>'+E(q.alternate)+'</b></div></div>'+(q.status==='escalated'?'<div class="notice amber mb20">'+I('upload',19)+'当前需要补扫证据；可以模拟更清晰的原件页面再识别。'+button('模拟补扫','rescan',b.id+'|'+q.id,'compact','refresh')+'</div>':'')+formStart('v5-k-verdict',b.id+'|'+q.id)+selectField('人工决定','decision',[['confirm','确认交叉候选'],['edit','按原图手动修正'],['rescan','无法辨认，要求重扫']],'confirm')+field('忠实原文','text',q.decision||q.alternate,'textarea','required rows="3"')+field('校勘说明','note',q.note,'textarea','placeholder="例如：原图确认为子；保留原字說，将悦放入释义层" rows="2"')+formEnd()+'<div class="head-actions mt16">'+button('使用候选','use-candidate',q.id,'compact','copy')+'<button class="btn primary" type="submit" form="form-v5-k-verdict">'+I('check',16)+'保存裁决</button></div><div class="help mt16">多模型一致不代表零错误。关键疑点未解决，精校版不能发布。</div></div></div><div class="kv5-doubt-nav">'+b.doubts.map(x=>'<button class="kv5-doubt-btn '+(x.id===q.id?'active ':'')+(x.status==='resolved'?'done':'')+'" data-act="v5-k-doubt" data-id="'+E(x.id)+'">'+(x.status==='resolved'?'✓ ':'')+'第 '+x.page+' 页 · '+E(x.type)+'</button>').join('')+'</div>';
 }
 function pagesReview(b){const page=Number(U.kv5Page)||1;return '<div class="card card-pad"><div class="row wrap between"><div><h2>逐页人工精校</h2><p class="subtitle">经典样卷采用逐页精校。疑点审核与整页复核分别记录。</p></div>'+badge(b.reviewed.length+'/'+b.pages+' 已复核',b.reviewed.length===b.pages?'green':'blue')+'</div><div class="kv5-pagelist">'+Array.from({length:b.pages},(_,i)=>i+1).map(p=>'<button data-act="v5-k-page" data-id="'+p+'" class="'+(b.reviewed.includes(p)?'checked ':'')+(b.doubts.some(q=>q.page===p&&q.status!=='resolved')?'doubt ':'')+(p===page?'active':'')+'">第 '+p+' 页</button>').join('')+'</div><div class="kv5-review" style="padding:0">'+pageFacsimile(b,null)+'<div class="kv5-stack"><h3>当前第 '+page+' 页</h3><div class="kv5-reading">'+E(b.id==='bk1'?sampleQuotes[(page-1)%3]:b.text)+'</div><div class="notice">'+I('info',18)+'原图、忠实转录与现代释义分别保存。示例批量完成按钮只模拟人工流程，不代表 AI 可替代真实逐页审核。</div><div class="head-actions">'+button(b.reviewed.includes(page)?'本页已复核':'确认本页精校','review-page',b.id+'|'+page,b.reviewed.includes(page)?'green-btn':'primary','check')+button('模拟完成全卷精校','review-all',b.id,'','tasks')+'</div></div></div></div>';}
 function versionsView(b){return '<div class="card"><div class="card-header"><h2>原文版本与勘误传播</h2>'+button('新增修订','revision',b.id,'compact','edit')+'</div><div class="kv5-history-row mt16"><span class="kv5-history-version">v'+E(b.version)+'</span><div class="grow"><h3>当前'+(b.status==='published'?'正式':'待发布')+'原文</h3><p class="kv5-description">'+E(b.text)+'</p><div class="kv5-cite">'+E(b.edition)+' · '+E(b.published||b.created)+'</div></div>'+bookState(b)+'</div>'+b.revisions.slice().reverse().map(r=>'<div class="kv5-history-row"><span class="kv5-history-version">v'+E(r.version)+'</span><div class="grow"><h3>'+E(r.reason)+'</h3><p class="kv5-description">'+E(r.text)+'</p><div class="kv5-cite">'+E(r.date)+' · 历史版本保留，可溯源</div></div>'+button('查看','old-version',b.id+'|'+r.version,'compact','eye')+'</div>').join('')+'<div class="card-footer">原文修订后，与该书关联的故事进入待更新；旧版课程会提示版本变化，需刷新后继续。</div></div><div class="kv5-three">'+K().stories.filter(s=>s.book===b.id).map(storyCard).join('')+'</div>';}
 function collationView(){
  const b=currentBook(),tab=U.kv5CollationTab||'review';
  let body='';
  if(tab==='review')body='<div class="card">'+pipeline(b)+(b.stage<5?'<div class="card-pad"><div class="kv5-upload">'+I('file',33)+'<h3>'+E(b.filename)+'</h3><p>'+E(stageDescriptions[b.stage])+'</p></div><div class="row wrap between"><p class="small muted">当前 '+E(stages[b.stage])+' · '+b.pages+' 页 · '+E(b.bytes)+'</p>'+button('推进模拟解析','advance-ocr',b.id,'primary','play')+'</div></div>':reviewPanel(b))+quality(b)+'</div>';
  if(tab==='pages')body=pagesReview(b);
  if(tab==='versions')body=versionsView(b);
  if(tab==='audit')body='<div class="card card-pad"><h2>识别、裁决与发布证据</h2><div class="timeline mt16">'+b.audit.slice().reverse().map(a=>'<div class="timeline-item">'+E(a.text)+'<time>'+E(a.time)+'</time></div>').join('')+'</div><div class="detail-grid mt16">'+kv('原件指纹',b.scanHash)+kv('识别轮次',b.rounds+' 轮')+kv('样本页数',b.pages+' 页')+kv('原文版本','v'+b.version)+'</div></div>';
  return '<section class="kv5-workspace">'+pageHead('扫描与校对台','原件不覆盖，原文可校勘；疑点有裁决，发布有门槛',button('上传扫描件','upload','','primary','upload'))+callout('<b>精校目标是消除已发现的错误，并保留完整证据。</b> 本台模拟 OCR 和逐页人工审核，不能证明绝对零错误。')+'<div class="kv5-collation-layout"><aside class="card kv5-book-rail"><div class="kv5-book-rail-head">书目队列 · '+K().books.length+'</div>'+K().books.map(x=>'<button class="kv5-book-rail-item '+(b.id===x.id?'active':'')+'" data-act="v5-k-select-book" data-id="'+E(x.id)+'"><b>'+E(x.title)+'</b><span>'+E(x.edition)+'</span><small>'+bookState(x)+'</small></button>').join('')+'</aside><div class="kv5-stack"><div class="row wrap between"><div><h2>'+E(b.title)+'</h2><p class="subtitle">'+b.pages+' 页 · '+E(b.layout)+' · 原文 v'+E(b.version)+'</p></div>'+button('原件与书目','book',b.id,'compact','book')+'</div>'+tabs([['review','疑点裁决'],['pages','逐页精校'],['versions','修订与派生'],['audit','证据日志']],tab,'collation-tab')+body+'</div></div></section>';
 }
 J5.routes.sources=sourcesView;J5.routes.temple=templeView;J5.routes.collation=collationView;
 function overlay(name,fn){J5.overlays['k-'+name]=fn;}
 function open(name,id=''){J5.open('k-'+name,id);}
 function action(name,fn,privileged=true){J5.actions['v5-k-'+name]={admin:privileged,run:fn};}
 function form(name,fn,privileged=true){J5.forms['v5-k-'+name]={admin:privileged,run:fn};}
 overlay('source',id=>{
  const s=source(id);if(!s)return;
  modal('知识源配置',formStart('v5-k-source',id)+field('名称','name',s.name,'text','required')+selectField('连接方式','type',[['本地文档库','本地文档库'],['公开 API','公开 API'],['知识服务 API','知识服务 API'],['网页集合','网页集合']],s.type)+field('地址 / 路径','endpoint',s.endpoint,'text','required')+field('主题标签','topics',s.topics,'text','required')+selectField('检索模式','mode',modeOptions(),s.mode)+selectField('访问范围','scope',scopeOptions(),s.scope)+field('来源与使用范围','rights',s.rights,'textarea','required')+'<label class="kv5-checkbox full"><input type="checkbox" name="authorized" '+(s.authorized?'checked':'')+'>有效授权 · 关闭后，该来源及其关联故事不再被召回</label>'+formEnd(),formFooter('保存配置','v5-k-source'),true);
 });
 overlay('new-source',()=>modal('登记新的知识储备',formStart('v5-k-source')+field('来源名称','name','','text','placeholder="例如：历史地图馆、专业教材库、自己的笔记库" required')+selectField('连接方式','type',[['本地文档库','本地文档库'],['公开 API','公开 API'],['知识服务 API','知识服务 API'],['网页集合','网页集合']],'本地文档库')+field('地址 / 路径','endpoint','','text','placeholder="路径或 API 地址；原型不会访问" required')+field('主题标签','topics','','text','placeholder="用 / 分隔，例如：历史 / 地理" required')+selectField('检索模式','mode',modeOptions(),'hybrid')+selectField('访问范围','scope',scopeOptions(),'family')+field('来源与使用范围','rights','家庭内部学习；引用保留出处','textarea','required')+'<label class="kv5-checkbox full"><input type="checkbox" name="authorized" checked>确认此来源有有效授权，允许在选定范围内处理</label>'+formEnd(),formFooter('登记示例连接','v5-k-source'),true));
 overlay('upload',()=>modal('上传书籍扫描件',formStart('v5-k-upload')+'<div class="kv5-upload full">'+I('upload',34)+'<h3>选择 PDF / 图片，或使用内置样卷</h3><p>只登记文件元数据并模拟解析，不读取内容、不上传网络。</p><input class="input" type="file" name="scan" accept=".pdf,.png,.jpg,.jpeg,.webp"></div>'+field('书目名称','title','论语 · 新上传样卷','text','required')+field('版本 / 注本','edition','繁体竖排 · 模拟扫描 C 版','text','required')+field('作者 / 编者','author','示例作者')+field('样本页数','pages',30,'number','min="3" max="200" required')+selectField('关联知识源','source',K().sources.filter(s=>s.active&&s.authorized&&s.mode!=='live').map(s=>[s.id,s.name]),'src-local')+selectField('版式','layout',[['竖排 / 正文 + 注释','竖排 / 正文 + 注释'],['横排 / 正文 + 插图','横排 / 正文 + 插图'],['复杂版式 / 表格与公式','复杂版式 / 表格与公式']],'竖排 / 正文 + 注释')+field('来源与使用范围','rights','本原型模拟样卷；只用于演示校对流程','textarea','required')+formEnd(),formFooter('登记并进入解析队列','v5-k-upload'),true));
 overlay('book',id=>{
  const b=book(id);if(!b)return;
  const relatives=K().books.filter(x=>x.cover===b.cover&&x.id!==b.id);
  modal('书目、版本与三层资产','<div class="kv5-book" style="padding:0"><div class="kv5-cover '+(b.id==='bk2'?'sand':'')+'"><b>'+E(b.cover)+'</b><small>示例书目</small></div><div class="grow"><h2>'+E(b.title)+'</h2><p class="subtitle">'+E(b.edition)+'</p><div class="kv5-pill-row">'+bookState(b)+badge(b.pages+' 页','blue')+'</div><p class="kv5-description">'+E(b.rights)+'</p></div></div><div class="detail-grid mt24">'+kv('作者 / 编者',b.author)+kv('版式',b.layout)+kv('来源',source(b.source)?.name||'未知来源')+kv('原文版本','v'+b.version)+kv('原件文件',b.filename)+kv('原件指纹',b.scanHash)+'</div><div class="divider"></div><div class="kv5-three">'+[{title:'原件库',text:'扫描文件、页图、完整页序。原件不可变。'},{title:'校勘基库',text:b.rounds+' 轮校对；'+done(b)+'/'+b.doubts.length+' 疑点已裁决；'+b.reviewed.length+'/'+b.pages+' 页人工精校。'},{title:'知识神殿',text:K().stories.filter(s=>s.book===b.id).length+' 个关联故事；'+K().stories.filter(s=>s.book===b.id&&s.dirty).length+' 个派生内容待更新。'}].map(x=>'<div class="kv5-asset card"><h3>'+E(x.title)+'</h3><p>'+E(x.text)+'</p></div>').join('')+'</div><div class="divider"></div><h3>同作品版本保持独立</h3><p class="kv5-description mt16">'+(relatives.length?relatives.map(x=>E(x.title)+' · '+E(x.edition)+' · v'+E(x.version)).join('<br>'):'暂未登记同作品的其他版本。上传新版本后保留独立原件、页码与校勘记录。')+'</p>',B('关闭','close-overlay')+(admin()?button('进入校对台','collate',id,'primary','edit'):'')+button('关联故事','book-stories',id,'','book'),true);
 });
 overlay('revision',id=>{
  const b=book(id);if(!b)return;if(b.status!=='published'){toast('请先完成精校并发布原文版本。',true);closeOverlay();return;}
  modal('原文修订与影响确认',callout('<b>修订会生成新原文版本。</b> 关联故事将进入待更新，课程保留旧版引用并提示变化。')+'<div class="mt20"></div>'+formStart('v5-k-revision',id)+field('原文修订内容','text',b.text,'textarea','required rows="5"')+field('修订原因与证据','reason','','textarea','placeholder="例如：重新检查原页图，补回遗漏的标点；附对应页码" required')+field('页码 / 区域','page',2,'number','min="1" max="'+b.pages+'" required')+'<label class="kv5-checkbox full"><input type="checkbox" name="checked" required>已按原页图人工核对本次修订；此处仅模拟修订审定</label>'+formEnd(),formFooter('发布修订并标记派生影响','v5-k-revision'),true);
 });
 overlay('publish',id=>{
  const b=book(id);if(!b)return;
  const blocked=critical(b).length||b.reviewed.length!==b.pages||b.stage<5;
  modal('原文正式发布', '<div class="kv5-stack">'+(blocked?'<div class="notice amber">'+I('lock',21)+'当前门槛尚未满足，不能发布精校版。</div>':'<div class="notice green">'+I('check',21)+'已知关键疑点全部裁决，逐页精校完成。可以发布精校版。</div>')+'<div class="detail-grid">'+kv('样本页序',b.stage>=2?'完整检查通过':'尚未检查')+kv('关键疑点',critical(b).length+' 个未解决')+kv('人工精校',b.reviewed.length+'/'+b.pages+' 页')+kv('识别与校对轮次',b.rounds+' 轮')+'</div><p class="kv5-description">正式版保留来源、原文版本与校勘日志。精校并不证明绝对零错误；后续勘误会创建新修订，更新知识索引和关联故事。</p></div>',B('返回继续审核','close-overlay')+(blocked?button('去逐页精校','collation-tab','pages','','edit'):button('确认发布 v'+b.version,'confirm-publish',id,'primary','check')),true);
 });
 overlay('story',id=>{
  const s=story(id);if(!s)return;
  if(!ready(s)){
   if(!admin()){toast('此故事尚未完成正式发布或来源授权已失效。',true);closeOverlay();return;}
   modal('故事发布状态','<div class="kv5-stack"><h2>'+E(s.title)+'</h2><div class="notice amber">'+I('clock',20)+(s.dirty?'原文已修订，故事当前引用 v'+E(s.version)+'，最新原文 v'+E(book(s.book).version)+'。更新派生内容后才能重新学习。':'关联原文仍待精校与发布。此草稿不会进入家庭教学或正式知识检索。')+'</div><p class="kv5-description">'+E(s.summary)+'</p><div class="kv5-cite">'+citation(s)+'</div></div>',B('关闭','close-overlay')+(s.dirty?button('更新派生内容','update-story',id,'primary','refresh'):button('审核关联原文','collate',s.book,'primary','edit')),true);return;
  }
  const personal=K().progress[S.profile][id]||{};
  modal('独立故事 · '+s.duration+' 分钟','<div class="row wrap between"><div><span class="kv5-story-number">'+E(s.topic)+' / '+E(s.level)+'</span><h2 class="mt16">'+E(s.title)+'</h2></div>'+badge(personal.complete?'本次学习已完成':'当前身份：'+profileName(),personal.complete?'green':'blue')+'</div><div class="kv5-quote mt24">'+E(s.quote)+'</div><div class="kv5-reading">'+s.sections.map((t,i)=>'<p><b>'+String(i+1).padStart(2,'0')+'.</b> '+E(t)+'</p>').join('')+'</div><div class="notice">'+I('info',19)+'原文、教学解读与现代应用分层标识。声音与学习进度按当前家庭成员保存。</div><div class="kv5-cite mt16">'+citation(s)+'</div><div class="kv5-pill-row">'+s.connections.map(x=>'<span class="kv5-tag">'+E(x)+'</span>').join('')+'</div>',button('系统朗读','narrate',id,'','speaker')+button(K().favorites[S.profile].includes(id)?'取消收藏':'收藏','favorite',id,'','star')+button('回答一个小问题','quiz',id,'primary','play'),true);
 });
 overlay('quiz',id=>{
  const s=story(id);if(!ready(s)){toast('请先使用已发布且来源有效的故事。',true);closeOverlay();return;}
  modal('把知识说回来','<div class="kv5-stack"><span class="kv5-story-number">'+E(s.title)+'</span><h2>'+E(s.quiz.question)+'</h2>'+formStart('v5-k-quiz',id)+'<div class="full">'+s.quiz.choices.map((x,i)=>'<label class="kv5-learning-choice"><input type="radio" name="answer" value="'+i+'" required>'+E(x)+'</label>').join('')+'</div>'+formEnd()+'<div class="kv5-cite">'+citation(s)+'</div></div>',formFooter('提交并记录学习','v5-k-quiz'),true);
 });
 overlay('quiz-result',id=>{
  const s=story(id),p=K().progress[S.profile][id];if(!s||!p)return;
  modal(p.correct?'理解得很好':'再想一想这个角度','<div class="kv5-stack"><div class="kv5-feedback">'+I(p.correct?'check':'info',20)+' '+E(s.quiz.explanation)+'</div><p class="kv5-reading">本次学习已归入'+E(profileName())+'的个人记录。'+(p.correct?'下一次将回访这一知识点，帮助你复习。':'建议再听一次故事，用自己的话解释两种说法的差别。')+'</p><div class="detail-grid">'+kv('本次用时',s.duration+' 分钟 · 示例')+kv('复习建议',p.correct?'明天回忆一次':'今天再复述一次')+'</div></div>',B('完成','close-overlay')+button('再听故事','story',id,'primary','speaker'),true);
 });
 overlay('new-course',()=>{
  const list=K().stories.filter(ready);
  if(!list.length){modal('课程规划',emptyState('没有可学习故事。先完成原文发布或恢复来源授权。'),B('关闭','close-overlay'));return;}
  modal('为'+profileName()+'规划课程',formStart('v5-k-course')+field('课程名称','title','历史与证据 · 我的入门路线','text','required')+selectField('组织方式','structure',[['theme','主题 / 问题跨书编排'],['book','一本经典顺序阅读'],['people','人物与时间线']],'theme')+selectField('每次学习时长','pace',[['short','约 5 分钟'],['normal','约 10 分钟'],['long','约 15 分钟']],'normal')+field('学习目标','goal','听懂故事，能够说清楚知识的出处','textarea','required')+'<div class="full"><div class="small strong">选择正式发布的故事</div>'+list.map(s=>'<label class="kv5-checkbox"><input type="checkbox" name="stories" value="'+s.id+'" checked>'+E(s.title)+' · '+s.duration+' 分钟</label>').join('')+'</div>'+formEnd(),formFooter('生成个人课程','v5-k-course'),true);
 });
 overlay('node',id=>{
  if(id==='learning'){modal('知识脉络的组织方式','<div class="kv5-stack"><h2>故事独立，关联有据</h2><p class="kv5-reading">主题、人物、时代、地点与概念把故事连起来；每个故事仍能独立讲清一个问题。图谱不替代原文，关系的出处与版本保持可查。</p><div class="notice">'+I('book',20)+'本图为原型模拟关系。精校草稿、失效来源及未更新派生内容不进入正式教学。</div></div>',B('关闭','close-overlay')+button('我的课程','temple-tab','courses','primary','book'),true);return;}
  if(id.startsWith('bk')){open('book',id);return;}
  const s=story(id);if(!s)return;
  if(!admin()&&!ready(s)){toast('此关系的原文尚未正式发布；当前身份仅能使用公开教学内容。',true);return;}
  drawer(s.title,'知识节点 / '+s.topic,'<div class="kv5-stack"><p class="kv5-reading">'+E(s.summary)+'</p>'+storyState(s)+'<div class="divider"></div><h3>关系与出处</h3>'+s.connections.map(x=>'<div class="kv">'+E(x)+' → '+E(s.title)+'</div>').join('')+'<div class="kv5-cite">'+citation(s)+'</div><div class="notice">'+I('info',18)+'关系为组织阅读的示例，不作为脱离原文的事实证明。</div></div>',B('关闭','close-overlay')+button('查看故事','story',id,'primary','book'));
 });
 overlay('old-version',id=>{const [bid,version]=id.split('|'),b=book(bid),r=b?.revisions.find(x=>x.version===version);if(!r)return;modal('保留的原文历史版本','<div class="kv5-stack"><h2>'+E(b.title)+' · v'+E(version)+'</h2><div class="kv5-reading">'+E(r.text)+'</div><div class="detail-grid">'+kv('修订原因',r.reason)+kv('保存时间',r.date)+'</div><div class="notice">'+I('history',18)+'历史版本用于溯源；新课程使用当前正式版本。</div></div>',B('关闭','close-overlay'),true);});
 overlay('gap-accept',id=>{const g=K().gaps.find(x=>x.id===id);if(!g)return;modal('确认知识补充建议','<div class="kv5-stack"><h2>'+E(g.title)+'</h2><p class="kv5-reading">'+E(g.reason)+'</p><div class="detail-grid">'+kv('需要补齐',g.need)+kv('影响范围',g.impact)+'</div><div class="notice">'+I('flag',20)+'接受后进入知识补充清单。原型不自动购买书籍、不下载资料。可选择先检查现有来源或登记待补资料。</div>'+formStart('v5-k-gap',id)+selectField('下一步','next',[['search','先检索已有来源'],['collect','加入待补资料清单'],['story','整理候选先修故事']],'search')+field('补充说明','note','','textarea','placeholder="可填写感兴趣的人物、时期或资料类型"')+formEnd()+'</div>',formFooter('接受并安排下一步','v5-k-gap'),true);});
 overlay('source-failure',()=>modal('模拟知识源中断','<div class="kv5-stack"><div class="notice amber">'+I('link',20)+'博物馆示例源将进入“同步异常”。原型保留授权且可用的本地快照；实时部分将暂不可用。</div><p class="kv5-description">若需要彻底撤销访问，请在配置里关闭“有效授权”。同步失败与授权撤销有不同含义。</p></div>',B('取消','close-overlay')+button('确认模拟中断','confirm-source-failure','src-museum','primary','bolt'),true));
 action('source-tab',id=>{U.kv5SourceTab=id;closeOverlay();render();});
 action('temple-tab',id=>{if(id==='gaps'&&!admin())return toast('补充建议由管理员决策。',true);U.kv5TempleTab=id;closeOverlay();J5.navigate('temple');},false);
 action('collation-tab',id=>{U.kv5CollationTab=id;closeOverlay();J5.navigate('collation');});
 action('select-book',id=>{U.kv5Book=id;U.kv5Doubt='';U.kv5Page=1;render();});
 action('collate',id=>{U.kv5Book=id;U.kv5CollationTab='review';U.kv5Doubt='';closeOverlay();J5.navigate('collation');});
 action('source',id=>open('source',id));
 action('new-source',()=>open('new-source'));
 action('upload',()=>open('upload'));
 action('book',id=>{const b=book(id);if(!b)return;if(!admin()&&(b.status!=='published'||!accessibleBook(b)))return toast('该书目尚未对当前身份发布。',true);open('book',id);},false);
 action('book-stories',id=>{U.kv5TempleTab='stories';U.kv5FavoritesOnly=false;closeOverlay();J5.navigate('temple');toast('关联故事标明书目版本与页码。');},false);
 action('sync',id=>{const s=source(id);if(!s)return;if(!s.active||!s.authorized)return toast('来源已停用或授权已撤销，不能同步。',true);s.sync='刚刚 '+now();s.health='可用';s.version='sync-'+Date.now().toString(36).slice(-5);if(s.id==='src-local')s.count=K().books.filter(b=>b.status==='published').reduce((n,b)=>n+b.pages,0);event('模拟同步 '+s.name+'；仅有效授权与正式发布内容进入索引。');commit('来源同步已完成（模拟）。');});
 action('toggle-source',id=>{const s=source(id);if(!s)return;if(!s.authorized&&!s.active)return toast('请先在配置中确认有效授权。',true);s.active=!s.active;s.health=s.active?'可用':'已停用';event((s.active?'启用':'停用')+'知识源 '+s.name+'，召回范围已更新。');commit(s.active?'来源已启用。':'来源已停用，检索与相关教学即时更新。');});
 action('source-failure',()=>open('source-failure'));
 action('confirm-source-failure',id=>{const s=source(id);s.health='同步异常';s.sync='同步失败 · '+now();event(s.name+'实时部分模拟中断，保留已授权本地快照。');closeOverlay();commit('同步异常已记录；可点“同步”恢复。');});
 action('doubt',id=>{U.kv5Doubt=id;render();});
 action('use-candidate',id=>{const q=currentBook().doubts.find(x=>x.id===id),f=document.querySelector('[data-form="v5-k-verdict"] [name="text"]');if(q&&f)f.value=q.alternate;});
 action('rescan',id=>{
  const [bid,qid]=id.split('|'),b=book(bid),q=b?.doubts.find(x=>x.id===qid);if(!q||q.status!=='escalated')return;
  b.rounds++;q.status='pending';q.confidence=Math.min(95,q.confidence+12);q.note='模拟补扫页面后重新识别；仍需人工确认，不自动裁决。';q.evidenceRevision=(q.evidenceRevision||0)+1;U.kv5Doubt=q.id;
  b.audit.push({time:now(),text:'第 '+q.page+' 页补扫证据模拟 v'+q.evidenceRevision+'；重新识别后送人工审核，识别总轮次 '+b.rounds+'。'});event(b.title+'第 '+q.page+' 页完成补扫与重识别模拟。');commit('补扫证据已模拟生成；请再次对照原图裁决。');
 });
 action('advance-ocr',id=>{
  const b=book(id);if(!b||b.stage>=5)return;
  b.stage++;b.audit.push({time:now(),text:stages[b.stage]+'模拟完成；原件不变，生成独立处理记录。'});
  if(b.stage===3)b.rounds=1;
  if(b.stage===4){b.rounds=2;b.doubts=seedDoubts().map(q=>({...q,page:Math.min(q.page,b.pages)}));b.status='review';}
  if(b.stage===5){b.status='review';event(b.title+'进入人工精校；'+critical(b).length+' 个关键疑点。');}
  commit('已推进到：'+stages[b.stage]+'（模拟）。');
 });
 action('page',id=>{U.kv5Page=Number(id);render();});
 action('review-page',id=>{const [bid,p]=id.split('|'),b=book(bid),page=Number(p);if(!b||b.stage<5)return toast('先完成 OCR 与交叉校对。',true);if(b.doubts.some(q=>q.page===page&&q.critical&&q.status!=='resolved'))return toast('请先裁决该页关键疑点。',true);if(!b.reviewed.includes(page))b.reviewed.push(page);b.audit.push({time:now(),text:'人工确认第 '+page+' 页精校（模拟）。'});U.kv5Page=page<b.pages?page+1:page;commit('本页精校已记录。');});
 action('review-all',id=>{const b=book(id);if(!b||b.stage<5)return toast('先完成解析与交叉校对。',true);if(critical(b).length)return toast('还有 '+critical(b).length+' 个关键疑点，不能跳过审核。',true);b.reviewed=Array.from({length:b.pages},(_,i)=>i+1);b.audit.push({time:now(),text:'模拟人工逐页复核全卷 '+b.pages+' 页；已知关键疑点全部处置。'});event(b.title+'完成全卷人工精校模拟。');commit('全卷逐页精校流程已模拟完成；可审核发布。');});
 action('publish',id=>open('publish',id));
 action('confirm-publish',id=>{
  const b=book(id);if(!b)return;
  if(b.stage<5||critical(b).length||b.reviewed.length!==b.pages)return toast('发布被拦截：关键疑点或逐页精校尚未完成。',true);
  b.status='published';b.stage=6;b.published='10月03日 '+now();b.audit.push({time:now(),text:'发布精校原文 v'+b.version+'，保留疑点裁决与逐页复核证据。'});
  K().stories.filter(s=>s.book===id).forEach(s=>{s.version=b.version;s.released=true;s.dirty=false;});
  source(b.source).count=K().books.filter(x=>x.status==='published').reduce((n,x)=>n+x.pages,0);
  event(b.title+'原文 v'+b.version+' 已发布；关联故事可学习。');closeOverlay();commit('精校原文已发布，知识神殿与课程同步获得可用故事。');
 });
 action('revision',id=>open('revision',id));
 action('old-version',id=>open('old-version',id));
 action('update-story',id=>{const s=story(id);if(!s)return;const b=book(s.book);if(!b||b.status!=='published'||!allowed(source(b.source)))return toast('原文未发布或来源授权失效，不能更新。',true);s.version=b.version;s.dirty=false;s.released=true;s.quote=b.id==='bk1'?b.text:s.quote;s.updated=now();b.audit.push({time:now(),text:'模拟重核故事“'+s.title+'”，更新引用为原文 v'+b.version+'。'});event(s.title+'派生内容更新完成；原文 v'+b.version+'。');closeOverlay();commit('故事已按新原文更新；旧课程可刷新版本。');});
 action('story',id=>open('story',id),false);
 action('favorite',id=>{const s=story(id);if(!s||!ready(s))return toast('只有正式发布且来源有效的故事可以收藏。',true);const list=K().favorites[S.profile],i=list.indexOf(id);if(i>=0)list.splice(i,1);else list.push(id);commit(i>=0?'已取消个人收藏。':'已加入'+profileName()+'的收藏。');},false);
 action('favorite-filter',()=>{U.kv5FavoritesOnly=!U.kv5FavoritesOnly;render();},false);
 action('new-course',()=>open('new-course'),false);
 action('narrate',id=>{const s=story(id);if(!ready(s))return toast('请先使用正式发布且来源有效的故事。',true);const state=K().progress[S.profile][id]||{};state.listened=true;state.last=now();K().progress[S.profile][id]=state;persist();speak(s.title+'。'+s.sections.join('。'));},false);
 action('quiz',id=>open('quiz',id),false);
 action('refresh-course',id=>{const c=K().courses[S.profile].find(x=>x.id===id);if(!c)return;const invalid=c.stories.map(story).filter(s=>!ready(s));if(invalid.length)return toast('有 '+invalid.length+' 则故事待更新或来源不可用，先处理后再刷新。',true);c.stories.forEach(sid=>c.versions[sid]=story(sid).version);commit('课程已刷新到当前正式原文版本。');},false);
 action('remove-course',id=>{K().courses[S.profile]=K().courses[S.profile].filter(x=>x.id!==id);commit('个人课程已移除；故事与学习记录保留。');},false);
 action('node',id=>open('node',id),false);
 action('gap-accept',id=>open('gap-accept',id));
 action('gap-defer',id=>{const g=K().gaps.find(x=>x.id===id);if(g){g.state='deferred';event('暂缓知识建议：'+g.title);commit('建议已暂缓。');}});
 action('gap-ignore',id=>{const g=K().gaps.find(x=>x.id===id);if(g){g.state='ignored';event('忽略知识建议：'+g.title);commit('建议已忽略，可继续接受或暂缓。');}});
 form('source',(d,id)=>{
  if(!d.name?.trim()||!d.endpoint?.trim())return toast('请填写来源名称与地址。',true);
  const authorized=!!d.authorized;
  if(id){const s=source(id);Object.assign(s,{name:d.name.trim(),type:d.type,endpoint:d.endpoint.trim(),topics:d.topics,mode:d.mode,scope:d.scope,rights:d.rights,authorized});s.health=authorized?(s.active?'可用':'已停用'):'授权已撤销';}
  else K().sources.push({id:uid('src'),name:d.name.trim(),type:d.type,endpoint:d.endpoint.trim(),topics:d.topics,mode:d.mode,scope:d.scope,rights:d.rights,active:authorized,authorized,count:3,sync:'尚未同步',health:authorized?'待同步':'授权未确认',version:'new-1',records:[{title:d.name+' · 示例资料',text:d.topics+'的模拟内容；正式接入后保留原始来源、版本与引用。'},{title:d.name+' · 知识入口',text:'用于演示动态登记来源后参与授权检索。'}]});
  event((id?'更新':'登记')+'知识源 '+d.name+'；'+modeNames[d.mode]+'；'+scopeNames[d.scope]+(authorized?'':'；授权已撤销'));closeOverlay();commit('知识源登记已更新，授权即时生效。');
 });
 form('query',(d)=>{
  const q=(d.query||'').trim();if(!q)return;
  const parts=q.split(/[、，, /]+/).filter(Boolean),all=[];
  K().sources.filter(s=>allowed(s)&&(d.mode==='all'||d.mode==='local'&&s.mode!=='live'||d.mode==='live'&&s.mode!=='local')).forEach(s=>{
   if(s.health==='同步异常'&&s.mode==='live')return;
   s.records.forEach(r=>{if(r.book&&(book(r.book)?.status!=='published'||!accessibleBook(book(r.book))))return;const hay=r.title+' '+r.text+' '+s.topics;if(parts.some(p=>hay.includes(p)))all.push({...r,source:s.id});});
  });
  K().query={text:q,results:all,at:now()};U.kv5SourceTab='query';event('模拟联合检索“'+q+'”，有效授权结果 '+all.length+' 条。');commit(all.length?'检索完成，结果保留出处。':'未找到正式且有效授权的匹配资料。');
 },false);
 form('upload',(d,id,f)=>{
  const pages=Math.min(200,Math.max(3,Number(d.pages)||30)),file=f.querySelector('[name="scan"]')?.files?.[0],sid=d.source;
  if(!source(sid)||!allowed(source(sid)))return toast('请选择有效授权的本地或混合知识源。',true);
  const b={id:uid('bk'),title:d.title.trim(),cover:d.title.includes('论语')?'论语':'样卷',edition:d.edition,author:d.author||'未填写',source:sid,rights:d.rights,filename:file?.name||'内置模拟扫描样本.pdf',pages,bytes:file?((file.size/1024/1024).toFixed(1)+' MB · 仅元数据'):'18.4 MB · 模拟',stage:0,status:'queued',version:'1.0',rounds:0,reviewed:[],doubts:[],text:sampleQuotes[0],normalized:'原文、现代标点与教学解读分别保存。',scanHash:'SHA256 · 模拟-'+Date.now().toString(16).slice(-8).toUpperCase(),created:'10月03日 '+now(),published:null,revisions:[],layout:d.layout,audit:[{time:now(),text:'登记扫描元数据与 '+pages+' 页样本；未上传网络。'}]};
  K().books.unshift(b);K().stories.push({...JSON.parse(JSON.stringify(K().stories[0])),id:uid('st'),title:d.title+' · 学习与复习',book:b.id,released:false,dirty:false,version:'1.0'});
  U.kv5Book=b.id;U.kv5CollationTab='review';U.kv5Doubt='';event('新增扫描书目 '+b.title+'，'+pages+' 页待解析。');closeOverlay();J5.navigate('collation');commit('扫描件已登记，按步骤推进模拟解析。');
 });
 form('verdict',(d,id)=>{
  const [bid,qid]=id.split('|'),b=book(bid),q=b?.doubts.find(x=>x.id===qid);if(!q)return;
  if(d.decision==='rescan'){q.status='escalated';q.note=d.note||'原图无法确定，要求重新扫描或人工补证。';q.decision='';b.audit.push({time:now(),text:'第 '+q.page+' 页疑点请求重新扫描，关键门槛继续阻断。'});commit('疑点已升级，补齐证据前不能发布。');return;}
  const text=(d.text||'').trim();if(!text)return toast('请填写人工确认的忠实原文。',true);
  q.status='resolved';q.decision=text;q.note=d.note||'按模拟原图人工确认。';q.reviewedBy=profileName();q.reviewedAt=now();
  b.audit.push({time:now(),text:'人工裁决第 '+q.page+' 页：'+text+'；'+q.note});
  const next=b.doubts.find(x=>x.status!=='resolved');U.kv5Doubt=next?.id||q.id;event(b.title+'第 '+q.page+' 页疑点已裁决。');commit(next?'裁决已保存，继续下一项疑点。':'所有疑点已有裁决；请完成逐页精校。');
 });
 form('revision',(d,id)=>{
  const b=book(id);if(!b||b.status!=='published')return toast('只可修订正式发布的原文。',true);
  if(!d.checked||!d.text?.trim()||!d.reason?.trim())return toast('请填写修订内容与证据，并确认人工核对。',true);
  b.revisions.push({version:b.version,date:'10月03日 '+now(),text:b.text,reason:d.reason+' · 第 '+d.page+' 页'});
  const split=b.version.split('.');b.version=split[0]+'.'+(Number(split[1])+1);b.text=d.text.trim();b.published='10月03日 '+now();
  const affected=K().stories.filter(s=>s.book===id);affected.forEach(s=>{s.dirty=true;s.released=false;});
  b.audit.push({time:now(),text:'原文发布修订 v'+b.version+'；'+affected.length+' 个故事已标记派生失效。原因：'+d.reason});
  event(b.title+'原文修订 v'+b.version+'；故事待重新核对。');closeOverlay();U.kv5CollationTab='versions';commit('原文修订已发布，关联故事进入待更新。');
 });
 form('course',(d,id,f)=>{
  const ids=Array.from(f.querySelectorAll('[name="stories"]:checked')).map(x=>x.value).filter(sid=>ready(story(sid)));
  if(!ids.length)return toast('至少选择一则已发布且授权有效的故事。',true);
  K().courses[S.profile].push({id:uid('course'),title:d.title.trim(),goal:d.goal,structure:d.structure,pace:d.pace,stories:ids,versions:Object.fromEntries(ids.map(sid=>[sid,story(sid).version])),created:now()});
  U.kv5TempleTab='courses';closeOverlay();J5.navigate('temple');commit('已生成'+profileName()+'的个人课程。');
 },false);
 form('quiz',(d,id)=>{
  const s=story(id);if(!ready(s))return toast('故事来源或版本已失效，请返回检查。',true);
  if(d.answer===undefined)return toast('请选择一个答案。',true);
  const correct=Number(d.answer)===s.quiz.answer,previous=K().progress[S.profile][id]||{};
  K().progress[S.profile][id]={...previous,complete:correct,correct,attempts:(previous.attempts||0)+1,last:now(),version:s.version,review:correct?'明天':'今天'};
  if(correct&&!previous.complete&&S.learning?.[S.profile]){S.learning[S.profile].minutes+=s.duration;S.learning[S.profile].completed++;}
  persist();open('quiz-result',id);toast(correct?'学习记录已更新，安排下一次复习。':'已记录本次练习，建议重新听讲。');
 },false);
 form('gap',(d,id)=>{
  const g=K().gaps.find(x=>x.id===id);if(!g)return;g.state='accepted';g.next=d.next;g.note=d.note;g.acceptedAt=now();event('接受知识补充建议：'+g.title+'；下一步 '+d.next+'。');closeOverlay();
  if(d.next==='search'){K().query={text:g.type==='呈现缺口'?'地理':'学习',results:[],at:''};U.kv5SourceTab='query';J5.navigate('sources');}
  commit('建议已接受并加入知识补充清单。');
 });
 J5.boards.knowledge={title:'知识神殿 · 领域态势',subtitle:'原件、校勘、故事与学习路线 / 离线模拟',render(){
  const k=K(),unresolved=k.books.reduce((n,b)=>n+critical(b).length,0),published=k.books.filter(b=>b.status==='published').length;
  if(!admin()){
   const publicStories=k.stories.filter(ready),personal=k.progress[S.profile];
   return '<div class="kv5-board-metrics">'+[['可学习故事',publicStories.length],['我的课程',k.courses[S.profile].length],['我的收藏',k.favorites[S.profile].length],['已学故事',Object.values(personal).filter(p=>p.complete).length]].map(([label,value])=>'<div class="kv5-board-metric"><span>'+E(label)+'</span><strong>'+E(value)+'</strong></div>').join('')+'</div><div class="kv5-board-grid"><div class="kv5-board-card"><div class="row wrap between"><h2>'+E(profileName())+'的故事与知识</h2>'+button('进入知识神殿','temple-tab','stories','compact','book')+'</div>'+publicStories.map(s=>'<div class="kv5-board-row"><div class="grow"><b>'+E(s.title)+'</b><small>'+s.duration+' 分钟 / '+E(s.topic)+' / 原文 v'+E(s.version)+'</small></div>'+button('开始讲解','story',s.id,'compact','speaker')+'</div>').join('')+'</div><div class="kv5-board-card"><div class="row wrap between"><h2>我的学习路线</h2>'+button('规划个人课程','new-course','','compact','plus')+'</div>'+k.courses[S.profile].map(c=>'<div class="kv5-board-row"><div><b>'+E(c.title)+'</b><small>'+c.stories.length+' 个故事 / 个人进度独立保存</small></div>'+button('继续学习','temple-tab','courses','compact','play')+'</div>').join('')+'<p class="mt16">家庭只呈现正式发布且来源有效的内容。个人课程、收藏和学习记录互相独立。</p></div></div>';
  }
  return '<div class="kv5-board-metrics">'+[['有效知识源',k.sources.filter(s=>s.active&&s.authorized).length],['正式原文',published],['关键待审疑点',unresolved],['可学习故事',k.stories.filter(ready).length]].map(([label,value])=>'<div class="kv5-board-metric"><span>'+E(label)+'</span><strong>'+E(value)+'</strong></div>').join('')+'</div><div class="kv5-board-grid"><div class="kv5-board-card"><div class="row wrap between"><div><h2>原文处理与质量门槛</h2><p>已发现疑点全部处置，逐页精校后正式发布</p></div>'+button('进入校对台','board-collation','','compact','edit')+'</div>'+k.books.slice(0,4).map(b=>'<div class="kv5-board-row"><div class="grow"><b>'+E(b.title)+'</b><small>'+b.pages+' 页 / 人工复核 '+b.reviewed.length+' 页 / 原文 v'+E(b.version)+'</small></div>'+bookState(b)+button('处理','collate',b.id,'compact','arrow')+'</div>').join('')+'</div><div class="kv5-board-card"><div class="row wrap between"><h2>知识补充建议</h2>'+button('决策清单','temple-tab','gaps','compact','flag')+'</div>'+k.gaps.filter(g=>g.state==='pending').slice(0,3).map(g=>'<div class="kv5-board-row"><div class="grow"><b>'+E(g.title)+'</b><small>'+E(g.type)+' / 影响 '+E(g.impact)+'</small></div>'+button('决策','gap-accept',g.id,'compact','check')+'</div>').join('')+'</div><div class="kv5-board-card"><div class="row wrap between mb20"><h2>故事与知识脉络</h2>'+button('进入知识神殿','temple-tab','graph','compact','book')+'</div>'+graph()+'</div><div class="kv5-board-card"><div class="row wrap between"><h2>来源与更新</h2>'+button('知识接入中心','board-sources','','compact','link')+'</div>'+k.sources.slice(0,4).map(s=>'<div class="kv5-board-row"><div class="grow"><b>'+E(s.name)+'</b><small>'+E(modeNames[s.mode])+' / '+E(s.sync)+'</small></div>'+badge(s.active&&s.authorized?s.health:'已停用',s.active&&s.authorized?'green':'')+'</div>').join('')+'<p class="mt16">停用和撤权即时影响知识召回；草稿不会进入正式教学。</p></div></div>';
 }};
 action('board-collation',()=>{closeOverlay();J5.navigate('collation');});
 action('board-sources',()=>{closeOverlay();J5.navigate('sources');});
 J5.acceptMaterial=function(payload){
  const owner=payload.owner||S.profile,id=uid('material');
  K().materials.unshift({id,title:String(payload.title||'终端提交资料'),text:String(payload.text||''),owner,terminal:String(payload.terminal||'未指定终端'),scope:payload.scope||'personal',at:'10月03日 '+now(),status:'pending'});
  K().events.unshift({time:now(),text:'统一收件：'+String(payload.title||'终端提交资料')+'，待管理员分类与校核。'});
  return {id,status:'pending',message:'资料原文已保存为待处理稿，不会直接发布。'};
 };
 J5.voiceStory=function(options={}){
  if(options.owner&&options.owner!==S.profile)return null;
  const list=K().stories.filter(ready);if(!list.length)return null;
  const key='kv5VoiceCursor_'+S.profile;
  let position=Number(U[key])||0;
  if(options.next)position=(position+1)%list.length;
  U[key]=position;const s=list[position%list.length];
  return {id:s.id,title:s.title,text:s.title+'。'+s.sections.join('。'),source:citation(s),version:s.version,duration:s.duration,ready:true,quiz:s.quiz,connections:s.connections};
 };
 J5.finishVoiceStory=function(id){
  const s=story(id);if(!ready(s))return {ok:false,message:'正式故事或来源当前不可用。'};
  const previous=K().progress[S.profile][id]||{};
  K().progress[S.profile][id]={...previous,complete:true,listened:true,last:now(),version:s.version,mode:'voice',assessed:!!previous.correct,review:'明天'};
  if(!previous.complete&&S.learning?.[S.profile]){S.learning[S.profile].minutes+=s.duration;S.learning[S.profile].completed++;}
  persist();return {ok:true,id,title:s.title,owner:S.profile,alreadyCompleted:!!previous.complete,message:'已记录故事听完；掌握情况仍需问答确认。'};
 };
 action('material-book',id=>{
  const m=K().materials.find(x=>x.id===id);if(!m||m.status!=='pending')return;
  const sid=K().sources.find(s=>s.active&&s.authorized&&s.scope===m.scope&&s.mode!=='live')?.id||'src-local';
  const b={id:uid('bk'),title:m.title,cover:'资料',edition:'终端提交原文 · 待校核草稿',author:m.owner,source:sid,rights:'终端 '+m.terminal+'；提交范围 '+(scopeNames[m.scope]||m.scope),filename:'收件原文_'+m.id+'.txt',pages:3,bytes:'文字提交 · 非扫描件',stage:5,status:'review',version:'1.0',rounds:0,reviewed:[],doubts:[],text:m.text,normalized:'待解读；原始文字保留。',scanHash:'DEMO · '+m.id,created:m.at,published:null,revisions:[],layout:'终端文字 / 待人工校核',audit:[{time:now(),text:'从统一收件保留原文、终端和提交者，转人工校核草稿。'}],scope:m.scope,owner:m.owner};
  K().books.unshift(b);m.status='book';m.target=b.id;U.kv5Book=b.id;U.kv5CollationTab='pages';event('资料 '+m.title+'已转原文草稿，待人工复核。');J5.navigate('collation');commit('原始资料已转校核草稿，尚未正式发布。');
 });
 action('material-source',id=>{
  const m=K().materials.find(x=>x.id===id);if(!m||m.status!=='pending')return;
  const sid=uid('src');K().sources.push({id:sid,name:m.title+' · 来源候选',type:'本地文档库',mode:'local',scope:m.scope,endpoint:'inbox://'+m.id,topics:'待整理资料',active:false,authorized:false,rights:'来自 '+m.owner+' / '+m.terminal+'；范围与授权待确认',sync:'尚未同步',count:1,health:'来源候选',version:'draft-1',records:[{title:m.title,text:m.text,owner:m.owner,terminal:m.terminal}]});m.status='source';m.target=sid;event('资料 '+m.title+'转来源候选，等待有效授权确认。');U.kv5SourceTab='registry';J5.navigate('sources');commit('来源候选已登记；默认停用且未授权。');
 });
 J5.snapshots.knowledge=()=>{
  const k=K(),n=k.books.reduce((sum,b)=>sum+critical(b).length,0);
  return {summary:k.books.filter(b=>b.status==='published').length+' 部正式原文，'+k.stories.filter(ready).length+' 个可学习故事；'+n+' 个关键疑点待审。',metrics:[{label:'知识源',value:k.sources.filter(s=>s.active&&s.authorized).length},{label:'正式原文',value:k.books.filter(b=>b.status==='published').length},{label:'待审疑点',value:n},{label:'可学习故事',value:k.stories.filter(ready).length}],pending:n+k.materials.filter(m=>m.status==='pending').length+k.gaps.filter(g=>g.state==='pending').length};
 };
 document.addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&ev.target.matches?.('.kv5-graph g[data-act]')){ev.preventDefault();ev.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
})();
