const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:960}});
 const page=await context.newPage(),errors=[],api=[],checks=[];
 const base='http://127.0.0.1:3140/?mode=demo';
 const out=path.resolve('artifacts/knowledge-react-qa');await fs.mkdir(out,{recursive:true});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push(r.url())});
 const pass=name=>{checks.push(name);console.log('PASS '+name)};
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('jarvis-platform-demo-v2')));
 const route=async(id)=>{await page.goto(base+'#theme=stark&view='+id);await page.locator('.kn-workspace').waitFor()};
 const close=()=>page.getByRole('button',{name:'关闭知识详情'}).click();
 try{
  await route('collation');
  await page.getByRole('button',{name:'上传扫描件',exact:true}).click();
  let dialog=page.getByRole('dialog');
  await dialog.getByLabel('书目名称').fill('浏览器校对样卷');
  await dialog.getByLabel('版本与注本').fill('模拟三页本');
  await dialog.getByLabel('样本页数').fill('3');
  await dialog.getByLabel('关联知识源').selectOption('src-local');
  await dialog.getByLabel('来源与使用范围').fill('仅用于模拟流程验收');
  await dialog.getByRole('button',{name:'登记并进入解析队列'}).click();
  await page.locator('.kn-collation-main h3').filter({hasText:'浏览器校对样卷'}).first().waitFor();
  let d=await stored();const id=d.knowledge.books.find(b=>b.title==='浏览器校对样卷').id;
  assert.equal(d.knowledge.books.find(b=>b.id===id).text,'');pass('上传只登记原件元数据，原文未伪造解析');
  for(let stage=1;stage<=5;stage++){
   await page.getByRole('button',{name:'推进模拟解析'}).click();
   await page.waitForFunction(({id,stage})=>JSON.parse(localStorage.getItem('jarvis-platform-demo-v2')).knowledge.books.find(b=>b.id===id).stage===stage,{id,stage});
  }
  await page.getByRole('button',{name:'审核发布门槛'}).click();
  assert.equal(await page.getByRole('button',{name:'确认发布 v1.0'}).isDisabled(),true);await close();pass('未裁决疑点时发布被阻断');
  d=await stored();const doubts=d.knowledge.books.find(b=>b.id===id).doubts;
  for(const q of doubts){
   await page.locator('.kn-doubt-tabs button').filter({hasText:`第 ${q.page} 页 · ${q.type}`}).click();
   await page.getByLabel('人工决定').selectOption('confirm');
   await page.getByLabel(/^忠实原文/).fill(q.expected);
   await page.getByLabel('校勘说明').fill('浏览器逐项按样例页图确认');
   await page.getByRole('button',{name:'保存裁决'}).click();
  }
  d=await stored();assert(d.knowledge.books.find(b=>b.id===id).doubts.every(q=>q.status==='resolved'));pass('疑点逐项人工裁决留痕');
  await page.getByRole('tab',{name:'逐页精校'}).click();
  for(let i=1;i<=3;i++)await page.getByRole('button',{name:'确认本页精校'}).click();
  await page.getByRole('button',{name:'审核发布',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'确认发布 v1.0'}).isEnabled(),true);
  await page.getByRole('button',{name:'确认发布 v1.0'}).click();
  d=await stored();assert.equal(d.knowledge.books.find(b=>b.id===id).status,'published');pass('逐页精校完成后独立确认正式发布');
  await route('temple');
  const card=page.locator('.kn-story-card').filter({hasText:'浏览器校对样卷 · 示例解读'});
  await card.getByRole('button',{name:'开始讲解'}).click();
  dialog=page.getByRole('dialog');
  assert.match(await dialog.textContent(),/原文 v1\.0/);
  await dialog.getByRole('button',{name:'记录模拟听完'}).click();
  d=await stored();const story=d.knowledge.stories.find(s=>s.book===id);assert.equal(d.knowledge.progress.me[story.id].listened,true);assert.notEqual(d.knowledge.progress.me[story.id].complete,true);
  await dialog.getByRole('button',{name:'回答小问题'}).click();
  await page.getByRole('dialog').locator('input[type=radio]').nth(story.quiz.answer).check();
  await page.getByRole('button',{name:'提交并记录学习'}).click();
  assert.equal((await stored()).knowledge.progress.me[story.id].correct,true);await close();pass('故事可回查出处；听完与测验掌握分别记录');
  await page.getByRole('button',{name:'规划课程'}).click();
  dialog=page.getByRole('dialog');
  await dialog.getByLabel('学习者').selectOption('son');
  await dialog.getByLabel('课程名称').fill('三页本知识路线');
  await dialog.getByLabel('学习目标').fill('能够说明出处与校勘过程');
  await dialog.locator('.kn-story-picker label').filter({hasText:'浏览器校对样卷 · 示例解读'}).locator('input').check();
  await dialog.getByRole('button',{name:'创建个人课程'}).click();
  await page.getByRole('heading',{name:'学习计划',exact:true}).waitFor();
  assert.equal((await stored()).profile,'son');assert((await stored()).knowledge.courses.son.some(c=>c.title==='三页本知识路线'));pass('管理员为孩子规划课程并进入对应个人路线');
  await page.getByLabel('知识学习身份').selectOption('public');
  assert.equal(await page.getByRole('button',{name:'规划课程'}).isDisabled(),true);
  assert.match(await page.locator('.kn-workspace').textContent(),/公共空间只阅读共享内容/);pass('公共身份只读，无私人学习记录');
  await page.getByLabel('知识学习身份').selectOption('me');await route('sources');
  const sourceName=(await stored()).knowledge.sources.find(s=>s.id==='src-local').name;
  await page.locator('.kn-source-card').filter({hasText:sourceName}).getByRole('button',{name:'配置与授权'}).click();
  await page.getByRole('dialog').locator('input[name=authorized]').uncheck();
  await page.getByRole('button',{name:'保存配置'}).click();
  await route('temple');
  assert.equal(await page.locator('.kn-story-card').filter({hasText:'浏览器校对样卷 · 示例解读'}).getByRole('button',{name:'收藏',exact:true}).isDisabled(),true);
  assert.equal(await page.locator('.kn-story-card').filter({hasText:'浏览器校对样卷 · 示例解读'}).getByRole('button',{name:'开始讲解'}).count(),0);pass('撤销来源授权立即停止故事教学');
  await page.screenshot({path:path.join(out,'temple-desktop.png'),fullPage:true});
  for(const id of ['sources','temple','collation','learning']){
   await route(id);await page.setViewportSize({width:390,height:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'水平溢出 '+id);
   await page.screenshot({path:path.join(out,id+'-mobile.png'),fullPage:true});
   await page.setViewportSize({width:1440,height:960});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(api,[]);pass('四页手机无水平溢出、无浏览器异常、无真实API请求');
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,errors,api},null,2));
 }catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.error(await page.locator('body').innerText());throw error}
 finally{await context.close();await browser.close()}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
