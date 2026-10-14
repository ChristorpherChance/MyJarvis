const fs=require('fs');
const path=require('path');
const {pathToFileURL}=require('url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve('artifacts/prototype-v14-content-qa'); fs.mkdirSync(out,{recursive:true});
const target=path.resolve('贾维斯V14.0 · 十套主题与全平台交互原型.html');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  const errors=[],requests=[],checks=[],surfaces=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
  const check=(name,value,detail)=>{checks.push({name,ok:!!value,detail});if(!value)throw new Error(name+': '+JSON.stringify(detail));};
  try{
    await page.goto(pathToFileURL(target).href,{waitUntil:'load'});
    const registry=await page.evaluate(()=>J14Content.pages); check('18 页均登记',Object.keys(registry).length===18);
    for(const route of Object.keys(registry)){
      const surface=await page.evaluate(r=>{
        navigate(r);
        const main=document.getElementById('main'),head=main.querySelector('.page-head'),title=head?.querySelector('h1')?.textContent||main.querySelector('.vm5-top h1')?.textContent;
        return {route:r,title,subtitle:head?.querySelector('.subtitle')?.textContent,primary:[...main.querySelectorAll('.page-head .primary')].map(x=>x.textContent.trim()),horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,buttons:main.querySelectorAll('button').length};
      },route);
      surfaces.push(surface);check(route+' 标题同步',surface.title===registry[route][0],surface);
      if(route!=='chat')check(route+' 简短目的',!!surface.subtitle&&surface.subtitle.length<=38,surface.subtitle);
      check(route+' 无水平溢出',!surface.horizontalOverflow,surface);
    }
    await page.evaluate(()=>navigate('inbox'));
    await page.evaluate(()=>J5.open('rd-capture'));
    const form=await page.evaluate(()=>{
      const input=document.querySelector('form[data-form="v5-rd-capture"] textarea[name="text"]');
      input.value='V14 原话 ABC <span> 保留';window.__v14ContentNode=input;
      J14Content.refresh();J14Content.refreshOverlay();
      return {same:input===window.__v14ContentNode&&input===document.querySelector('form[data-form="v5-rd-capture"] textarea[name="text"]'),value:input.value,required:input.required,titlePlaceholder:document.querySelector('form[data-form="v5-rd-capture"] input[name="title"]').placeholder};
    });
    check('精简不替换或清空表单',form.same&&form.value==='V14 原话 ABC <span> 保留'&&form.required,form);
    check('可选标题给出提示',form.titlePlaceholder.includes('可选'),form);
    await page.evaluate(()=>{closeOverlay();navigate('memory')});
    const memory=await page.evaluate(()=>({expected:J5.state().vm.memories[S.profile].filter(x=>x.status==='active').map(x=>x.text),actual:[...document.querySelectorAll('.vm5-memory-card h3')].map(x=>x.textContent)}));
    check('私人记忆正文未改写',memory.expected.every(x=>memory.actual.includes(x)),memory);
    await page.evaluate(()=>{navigate('temple');U.kv5TempleTab='stories';render()});
    const stories=await page.evaluate(()=>({expected:J5.state().knowledgeCenter.stories.map(x=>x.summary),actual:[...document.querySelectorAll('.kv5-story p')].map(x=>x.textContent)}));
    check('故事正文未改写',stories.actual.every(x=>stories.expected.includes(x)),stories);
    await page.evaluate(()=>navigate('family'));
    const members=page.locator('.j14-family-members');check('家庭成员可展开',await members.count()===1);
    await members.locator('summary').click();
    const expanded=await page.evaluate(()=>{const before=document.querySelector('.j14-family-members').open;render();return {before,after:document.querySelector('.j14-family-members').open,memberButtons:document.querySelector('.j14-family-members').querySelectorAll('[data-act="switch-profile"]').length}});
    check('重绘保留展开状态和身份入口',expanded.before&&expanded.after&&expanded.memberButtons===4,expanded);
    for(const r of ['research','family','sources','personas']){
      await page.evaluate(r=>navigate(r),r);
      await page.screenshot({path:path.join(out,r+'-desktop.jpg'),type:'jpeg',quality:80,timeout:60000});
    }
    await page.evaluate(()=>{handleAction('switch-profile','wife');navigate('settings')});
    const personal=await page.evaluate(()=>({title:document.querySelector('.page-head h1').textContent,manageTab:!!document.querySelector('[data-act="settings-tab"][data-id="execution"]')}));
    check('家人显示个人设置',personal.title==='个人设置'&&!personal.manageTab,personal);
    check('无脚本错误',errors.length===0,errors);check('无外部请求',requests.length===0,requests);
    console.log(JSON.stringify({checks:checks.length,surfaces:surfaces.length,errors,requests,ok:true}));
  }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,surfaces,errors,requests},null,2));await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
