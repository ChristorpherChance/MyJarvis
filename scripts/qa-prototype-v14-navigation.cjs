const fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v14-navigation-qa'),checks=[],errors=[],external=[];
function check(label,value,detail){checks.push({label,passed:!!value,...(detail?{detail}:{})});if(!value)throw new Error(label+' '+JSON.stringify(detail||''))}
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url())});
 await page.goto(pathToFileURL(path.join(root,'贾维斯V14.0 · 十套主题与全平台交互原型.html')).href);
 await page.evaluate(()=>{J5.state().terminal=false;navigate('projects');J7Navigation.state.collapsed=false;J7Navigation.applyLayout()});
 const inventory=await page.evaluate(()=>({labels:[...document.querySelectorAll('#sidebar [data-j7-nav-route]')].map(n=>n.textContent.trim()),routes:[...document.querySelectorAll('#sidebar [data-j7-nav-route]')].map(n=>n.dataset.j7NavRoute),groups:J7Navigation.groups.map(g=>[g.id,g.name,g.items.map(n=>n[0])]),catalog:J6Usability.getCatalog().map(n=>[n.route,n.name,n.group])}));
 check('管理导航保留 20 个路由',inventory.routes.length===20&&new Set(inventory.routes).size===20,inventory.routes);
 check('全部同级菜单为四字',inventory.labels.every(n=>[...n].length===4),inventory.labels);
 check('目录与菜单名称一致',inventory.catalog.every(n=>inventory.labels.includes(n[1])),inventory.catalog);
 check('四组分类明确',inventory.groups.map(g=>g[1]).join(',')==='工作创作,知识学习,家庭生活,系统运维');
 for(const theme of ['stark','hero','baijia']){
  await page.evaluate(t=>J7.apply(t),theme);
  for(const viewport of [{width:1440,height:900},{width:1366,height:768},{width:375,height:812}]){
   await page.setViewportSize(viewport);
   await page.evaluate(()=>{J5.state().terminal=false;navigate('projects');J7Navigation.state.collapsed=false;J7Navigation.applyLayout();if(innerWidth<=760&&!U.menu)handleAction('menu')});
   const metrics=await page.evaluate(()=>{const side=document.querySelector('#sidebar'),nav=side.querySelector('.nav'),footer=side.querySelector('.sidebar-footer'),r=n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom,right:b.right}};const items=[...side.querySelectorAll('.nav-item')].filter(n=>n.getBoundingClientRect().height);return{side:r(side),nav:r(nav),footer:r(footer),scroll:nav.scrollHeight-nav.clientHeight,expanded:[...side.querySelectorAll('.j14-group-toggle[aria-expanded="true"]')].map(n=>n.dataset.j14NavGroup),visible:items.length,hit:items.every(n=>{const b=n.getBoundingClientRect();return n.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})}});
   check(theme+' '+viewport.width+' 当前组自动展开',metrics.expanded.join(',')==='create',metrics);
   check(theme+' '+viewport.width+' 导航重点一屏可见',metrics.scroll<=2,metrics);
   check(theme+' '+viewport.width+' 页脚不遮挡且在视口内',metrics.nav.bottom<=metrics.footer.y+1&&metrics.footer.bottom<=viewport.height+1,metrics);
   check(theme+' '+viewport.width+' 只常显当前分组',metrics.visible===10,metrics);
   check(theme+' '+viewport.width+' 可见菜单真实命中',metrics.hit,metrics);
   await page.locator('[data-j14-nav-group="knowledge"]').click();
   check(theme+' '+viewport.width+' 只展开知识学习',await page.evaluate(()=>J7Navigation.state.expanded==='knowledge'&&document.querySelectorAll('.j14-group-toggle[aria-expanded="true"]').length===1));
   await page.locator('#sidebar [data-j7-nav-route="learning"]').click();
   check(theme+' '+viewport.width+' 点击学习计划打开正确页',await page.evaluate(()=>U.route==='learning'&&J7Navigation.state.expanded==='knowledge'));
   if(viewport.width<=760){await page.evaluate(()=>handleAction('menu'));await page.locator('[data-j7-nav-act="collapse"]').click();check(theme+' 手机可关闭导航',await page.evaluate(()=>!U.menu));}
   else{await page.locator('[data-j7-nav-act="collapse"]').click();check(theme+' '+viewport.width+' 可收起图标栏',await page.locator('#sidebar').evaluate(n=>Math.round(n.getBoundingClientRect().width)===72));await page.locator('[data-j14-nav-group="operate"]').click();check(theme+' '+viewport.width+' 收起仍可切换分组',await page.evaluate(()=>J7Navigation.state.expanded==='operate'));await page.locator('[data-j7-nav-act="collapse"]').click();check(theme+' '+viewport.width+' 可恢复文字导航',await page.locator('#sidebar').evaluate(n=>Math.round(n.getBoundingClientRect().width)===224));}
   if((theme==='stark'&&viewport.width===1366)||(theme==='baijia'&&viewport.width!==1366))await page.screenshot({path:path.join(out,theme+'-navigation-'+viewport.width+'.jpg'),type:'jpeg',quality:85,timeout:60000});
  }
 }
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{J5.state().terminal=false;navigate('overview');J7.openDirectory()});
 check('完整目录 20 项',await page.locator('[data-j6-directory] [data-j6-route]').count()===20);
 check('目录标题不重复',await page.locator('.j7-directory h2').count()===1);
 await page.locator('[data-j6-category="create"]').click();check('工作创作筛选 5 项',await page.locator('[data-j6-directory] [data-j6-route]').count()===5);
 await page.locator('[data-j6-search]').fill('开发');check('关键词可查开发监督',await page.locator('[data-j6-route="tasks"]').isVisible());
 await page.locator('[data-j6-route="tasks"]').click();check('目录点击进入开发监督并关闭面板',await page.evaluate(()=>U.route==='tasks'&&!J7.state.layer));
 await page.evaluate(()=>{J7.openDirectory('operations')});check('兼容原运维分类参数',await page.locator('[data-j6-directory] [data-j6-route]').count()===5);
 await page.evaluate(()=>J7.closeLayer());
 await page.evaluate(()=>{handleAction('switch-profile','wife');J5.state().terminal=false;navigate('learning')});
 check('家人仅有 10 个允许入口',await page.locator('#sidebar [data-j7-nav-route]').count()===10);
 check('家人名称仍统一四字',await page.locator('#sidebar [data-j7-nav-route]').evaluateAll(ns=>ns.every(n=>[...n.textContent.trim()].length===4)));
 check('家人没有设备项目审批入口',await page.locator('#sidebar [data-j7-nav-route]').evaluateAll(ns=>ns.every(n=>!['machines','services','operations','approvals','projects','tasks','research','sources','collation'].includes(n.dataset.j7NavRoute))));
 await page.evaluate(()=>J7.openDirectory());check('家人目录 10 项且个人资料标题一致',await page.locator('[data-j6-directory] [data-j6-route]').count()===10&&(await page.locator('[data-j6-route="knowledge"] strong').textContent())==='家庭资料');
 await page.evaluate(()=>{J7.closeLayer();navigate('chat');handleAction('v5-vm-unknown');J12Immersive.setMode('control')});
 check('公共导航仅语音对话和大屏中心',await page.locator('#sidebar [data-j7-nav-route]').evaluateAll(ns=>ns.length===2&&ns.every(n=>['chat','screen'].includes(n.dataset.j7NavRoute))));
 await page.evaluate(()=>J7.openDirectory());check('公共目录仅有 2 项',await page.locator('[data-j6-directory] [data-j6-route]').count()===2);
 check('公共目录提示选择档案',await page.locator('[data-j6-act="identify"]').isVisible());
 check('无脚本错误',errors.length===0,errors);check('单 HTML 无外部请求',external.length===0,external);
 console.log(JSON.stringify({passed:checks.length,errors,external}));
 }finally{await fs.writeFile(path.join(out,'navigation-report.json'),JSON.stringify({checks,errors,external},null,2));await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
