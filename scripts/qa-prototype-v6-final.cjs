const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/prototype-v6-qa'),checks=[],errors=[];
function check(label,value){checks.push({label,passed:!!value});if(!value)throw new Error(label)}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.join(root,'贾维斯V6.0 · 五套外观交互原型.html')).href);
 check('单文件五张外观卡',await p.locator('.j6-design-card').count()===5);
 for(const scene of ['overview','voice','screen']){await p.locator('[data-j6-act="scene"][data-id="'+scene+'"]').click();check(scene+' 五张实际预览',await p.locator('.j6-preview-frame img').count()===5&&await p.locator('.j6-preview-frame img').evaluateAll(imgs=>imgs.every(img=>img.src.startsWith('data:image/jpeg;base64,'))))}
 await p.locator('[data-j6-act="scene"][data-id="overview"]').click();await p.locator('.j6-lab h1').click();await p.screenshot({path:path.join(out,'final-gallery-desktop.png')});
 await p.setViewportSize({width:375,height:812});check('最终图库手机不溢出',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,'final-gallery-mobile.png')});
 await p.evaluate(()=>J6.closeLayer());await p.setViewportSize({width:1440,height:1000});
 await p.evaluate(()=>{navigate('services');J5.open('guide')});
 const dialog=await p.locator('[role="dialog"]').elementHandle();
 for(const skin of ['orbit','bridge','daybreak','sanctuary','nocturne']){await p.evaluate(id=>J6.apply(id),skin);check(skin+' 换肤保留已打开的业务弹窗',await dialog.evaluate(n=>n.isConnected));check(skin+' 明暗偏好与外观一致',await p.evaluate(()=>S.settings.theme===J6.theme().tone&&document.body.classList.contains('dark')===(J6.theme().tone==='dark')))}
 await p.evaluate(()=>{closeOverlay();navigate('settings');U.settingsTab='general';render();J6.apply('daybreak')});
 await p.locator('[data-act="toggle-setting"][data-id="theme"]').click();check('旧深色模式开关映射到舰桥',await p.evaluate(()=>J6.state.theme==='bridge'&&S.settings.theme==='dark'));
 await p.locator('[data-act="toggle-setting"][data-id="theme"]').click();check('旧深色模式可切回白昼',await p.evaluate(()=>J6.state.theme==='daybreak'&&S.settings.theme==='light'));
 await p.evaluate(()=>J6.openDirectory('operations'));check('分类入口6项',await p.locator('[data-j6-route]').count()===6);
 await p.locator('[data-j6-route="services"]').click();await p.locator('#j6-dock [data-j6-act="directory"]').click();check('全部能力恢复20项',await p.locator('[data-j6-route]').count()===20);
 await p.locator('[data-j6-search]').fill('扫描');check('目录搜索找到原文校对',await p.locator('[data-j6-route="collation"]').count()===1);await p.locator('[data-j6-route="collation"]').click();check('目录直达完整校对台',await p.evaluate(()=>U.route==='collation'&&!J6.state.layer));
 for(const skin of ['orbit','bridge','daybreak','sanctuary','nocturne']){await p.evaluate(id=>{J6.apply(id);J5.state().terminal=true;navigate('chat')},skin);await p.setViewportSize({width:375,height:812});const b=await p.locator('[data-act="v5-vm-listen"]').boundingBox(),dock=await p.locator('#j6-dock').boundingBox();check(skin+' 手机语音操作位于工具栏上方',b&&dock&&b.y+b.height<dock.y);check(skin+' 最终语音不溢出',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.setViewportSize({width:1440,height:1000})}
 check('最终联动无运行错误',errors.length===0);await fs.writeFile(path.join(out,'final-report.json'),JSON.stringify({checks,errors},null,2));process.stdout.write(JSON.stringify({passed:checks.length,errors})+'\n');
 }finally{await browser.close()}})().catch(async e=>{process.stderr.write(e.stack+'\n');await fs.writeFile(path.join(out,'final-failure.json'),JSON.stringify({checks,errors,error:e.message},null,2));process.exitCode=1});
