const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v13-qa'),checks=[],errors=[],requests=[];
function check(label,value,detail){checks.push({label,passed:!!value,...(detail?{detail}:{})});if(!value)throw Error(label+' '+JSON.stringify(detail||''));}
(async()=>{await fs.mkdir(out,{recursive:true});const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const p=await b.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
  await p.goto(pathToFileURL(path.join(root,'贾维斯V13.0 · 十套主题与全平台交互原型.html')).href);
  await p.evaluate(()=>{S.settings.voice=false;J12Immersive.setMode('theatre')});
  check('默认左右分区模块',await p.evaluate(()=>!!window.J13Split&&J13Split===J12Immersive&&!!document.querySelector('.j13-split')));
  check('右侧真实会话常驻',await p.locator('.j13-conversation .vm5-dialogue').isVisible());
  await p.evaluate(()=>J13Split.open('text'));await p.locator('#vm5-input').fill('管理员未发送草稿 V13');
  await p.evaluate(()=>{window.__v13Input=document.getElementById('vm5-input');J13Split.close();J13Split.setMode('control');J7.apply('hero');J13Split.setMode('theatre')});
  check('换主题和收拢保留同一输入及草稿',await p.evaluate(()=>window.__v13Input===document.getElementById('vm5-input')&&window.__v13Input.value==='管理员未发送草稿 V13'));
  await p.evaluate(()=>J13Split.setMode('control'));await p.locator('.j13-fullscreen-button').click();
  await p.waitForFunction(()=>J13Split.state.mode==='theatre');
  check('原生全屏入口也进入专注布局',!await p.locator('.j7-film-bar').isVisible());
  await p.evaluate(()=>J13Split.setMode('control'));await p.waitForFunction(()=>!document.fullscreenElement);
  check('收拢同时退出原生全屏',await p.evaluate(()=>J13Split.state.mode==='control'&&!document.fullscreenElement));
  await p.evaluate(()=>J13Split.setMode('theatre'));
  await p.evaluate(()=>J13Split.open('text'));await p.locator('#vm5-input').fill('今天想听一个历史故事');await p.locator('[data-act="v5-vm-send"]').click();
  await p.waitForFunction(()=>['answered','awaiting'].includes(U.vm5.phase));
  check('右侧能看到实际请求与回答',await p.locator('.j13-conversation .vm5-message').count()>=2);
  check('发送只清空已发送草稿',await p.evaluate(()=>document.getElementById('vm5-input').value===''));
  await p.evaluate(()=>{J13Split.open('text');document.getElementById('vm5-input').value='管理员草稿';document.getElementById('vm5-input').dispatchEvent(new Event('input',{bubbles:true}));handleAction('switch-profile','wife');J5.state().terminal=true;navigate('chat')});
  check('切家人不会带入管理员草稿',await p.locator('#vm5-input').inputValue()==='');
  await p.evaluate(()=>{J13Split.open('text');document.getElementById('vm5-input').value='家人草稿';document.getElementById('vm5-input').dispatchEvent(new Event('input',{bubbles:true}));handleAction('switch-profile','me');J5.state().terminal=true;navigate('chat')});
  check('管理员草稿按档案恢复',await p.locator('#vm5-input').inputValue()==='管理员草稿');
  await p.evaluate(()=>handleAction('v5-vm-demo','ambiguous'));await p.waitForFunction(()=>U.vm5.phase==='awaiting');
  check('待确认操作真实按钮在右侧',await p.locator('.j13-conversation [data-act="v5-vm-command-option"]').count()===3);
  await p.evaluate(()=>handleAction('v5-vm-interrupt'));check('打断取消待确认',await p.evaluate(()=>U.vm5.phase==='interrupted'&&!U.vm5.pending));
  await p.evaluate(()=>handleAction('v5-vm-listen'));await p.locator('[data-act="v5-vm-demo-listen"]').click();
  check('右侧语音进入真实模拟聆听',await p.evaluate(()=>U.vm5.phase==='listening'));
  await p.waitForFunction(()=>U.vm5.transcript.length>0);await p.evaluate(()=>handleAction('v5-vm-interrupt'));await p.waitForTimeout(1300);
  check('打断后不会继续延迟回答',await p.evaluate(()=>U.vm5.phase==='interrupted'));
  await p.evaluate(()=>{J7.apply('hero');J7Effects.start()});await p.waitForFunction(()=>U.vm5.phase==='speaking'&&J7Effects.state.stage==='output');
  check('左右分区支持完整回应特效',await p.locator('.j13-conversation .vm5-caption').isVisible());
  await p.screenshot({path:path.join(out,'hero-speaking.jpg'),type:'jpeg',quality:80,timeout:60000});await p.evaluate(()=>handleAction('v5-vm-interrupt'));
  await p.evaluate(()=>{handleAction('switch-profile','wife');J5.state().terminal=true;navigate('chat');handleAction('v5-vm-sample','查看贾维斯项目进度')});await p.waitForFunction(()=>['answered','awaiting'].includes(U.vm5.phase));
  check('家人项目权限继续隔离',await p.evaluate(()=>U.vm5.answer.includes('管理员')&&!U.vm5.answer.includes('完成约')));
  await p.evaluate(()=>{handleAction('v5-vm-unknown');handleAction('v5-vm-sample','查看我的聊天记录密码 ABC_PRIVATE_SENTINEL')});await p.waitForFunction(()=>['answered','awaiting'].includes(U.vm5.phase));
  check('公共敏感请求先确认身份',await p.evaluate(()=>U.vm5.phase==='awaiting'&&U.vm5.answer.includes('先确认')));
  check('公共会话记录没有敏感原句',!(await p.locator('.vm5-message-list').innerText()).includes('ABC_PRIVATE_SENTINEL'));
  await p.evaluate(()=>{handleAction('v5-vm-identify','me');J5.state().terminal=true;navigate('chat')});
  for(const panel of ['scenes','intent','text']){await p.evaluate(x=>J13Split.open(x),panel);check(panel+' 面板可开启',await p.locator('.j12-drawer').isVisible());await p.keyboard.press('Escape');check(panel+' Escape退出',await p.evaluate(()=>!J13Split.state.panel))}
  await p.evaluate(()=>{J13Split.setMode('control');handleAction('v5-vm-console')});
  const routes=['overview','chat','sources','temple','collation','memory','personas','research','inbox','tasks','projects','knowledge','services','machines','family','learning','approvals','operations','settings','screen'];
  for(const route of routes){await p.evaluate(r=>{J5.state().terminal=false;U.overlay=null;navigate(r)},route);check('管理视图 '+route,(await p.locator('#main').innerText()).length>30);if(route!=='chat')check(route+' 无分区样式残留',await p.evaluate(()=>!document.body.classList.contains('j13-theatre')&&!document.body.classList.contains('j13-control')))}
  await p.evaluate(()=>{J5.state().terminal=true;navigate('chat');J13Split.setMode('theatre')});
  const life=await p.evaluate(()=>{const start=J7.state.mounted;for(const t of ['matrix','jaeger','interstellar','mars','yijing','pantheon','shanshui','baijia','hero','stark'])J7.apply(t);return{mounted:J7.state.mounted-start,outstanding:J7.state.mounted-J7.state.disposed,cores:document.querySelectorAll('.vm5-stage .j7-core-holder').length,input:document.querySelectorAll('#vm5-input').length}});
  check('十主题无重复核心或输入',life.outstanding===1&&life.cores===1&&life.input===1,life);
  check('无脚本错误',errors.length===0,errors);check('单HTML无外网请求',requests.length===0,requests);
  await fs.writeFile(path.join(out,'functional-report.json'),JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({passed:checks.length,errors,requests}));
 }finally{await b.close()}
})().catch(async e=>{await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'functional-failure.json'),JSON.stringify({error:e.message,checks,errors,requests},null,2));console.error(e.stack);process.exitCode=1});
