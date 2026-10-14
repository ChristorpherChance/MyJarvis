import {readFile,writeFile} from 'node:fs/promises';
const oldNames="['stark','matrix','hero','jaeger','interstellar','mars']",allNames="['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon']";
const oldFile='贾维斯V9.0 · 六套主题与全平台交互原型.html',file='贾维斯V10.0 · 八套主题与全平台交互原型.html';
let qa=await readFile('scripts/qa-prototype-v9.cjs','utf8');
qa=qa.replaceAll(oldFile,file).replaceAll('prototype-v9-qa','prototype-v10-qa').replaceAll(oldNames,allNames).replaceAll('六种不同','八种不同').replaceAll('首屏六风格','首屏八风格').replaceAll('六方案对比','八方案对比').replaceAll('count()===6','count()===8').replaceAll('[i%6]','[i%8]');
qa=qa.replaceAll('for(const theme of '+allNames+')','for(const theme of [\'yijing\',\'pantheon\'])');
const spot=`
await page.evaluate(()=>{J7.apply('yijing');handleAction('toggle-setting','theme');handleAction('toggle-setting','theme')});check('明暗设置恢复用户选择的易经浅色主题',await page.evaluate(()=>J7.state.theme==='yijing'&&document.documentElement.dataset.j7Theme==='yijing'));
for(const theme of ${allNames})for(const viewport of [{width:1366,height:768},{width:375,height:812}]){await page.setViewportSize(viewport);await page.evaluate(t=>{J7.apply(t);J5.state().terminal=true;navigate('chat')},theme);check(theme+' '+viewport.width+' 八套入口完整',await page.locator('.j7-film-switch button').count()===8);const mic=await page.locator('[data-act="v5-vm-listen"]').boundingBox();check(theme+' '+viewport.width+' 主控首屏',mic.y+mic.height<=viewport.height,mic);check(theme+' '+viewport.width+' 无横向溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
await page.setViewportSize({width:1440,height:1000});await page.keyboard.press('Alt+7');check('Alt7可选择易经',await page.evaluate(()=>J7.state.theme==='yijing'));await page.keyboard.press('Alt+8');check('Alt8可选择众神',await page.evaluate(()=>J7.state.theme==='pantheon'));
`;
qa=qa.replace("check('无脚本错误',errors.length===0,errors);",spot+"check('无脚本错误',errors.length===0,errors);");
await writeFile('scripts/qa-prototype-v10.cjs',qa);
let audit=await readFile('scripts/audit-prototype-v9-visuals.cjs','utf8');audit=audit.replaceAll(oldFile,file).replaceAll('prototype-v9-qa','prototype-v10-qa').replaceAll(oldNames,"['yijing','pantheon']");await writeFile('scripts/audit-prototype-v10-visuals.cjs',audit);
let effects=await readFile('scripts/capture-prototype-v10-effects.cjs','utf8');effects=effects.replaceAll(allNames,"['yijing','pantheon']").replace('theme=jaeger','theme=yijing');await writeFile('scripts/capture-prototype-v10-effects.cjs',effects);
let guide=await readFile('贾维斯V9.0 · 六套主题与全平台体验说明.md','utf8');guide=guide.replaceAll('V9','V10').replaceAll('六套','八套').replaceAll('六种外观','八种外观').replaceAll('顶部六个','顶部八个').replace('Alt + 6','Alt + 8');
guide=guide.replace('| 火星移民 · 火星栖居计划 | 火星地形、聚落与轨道联络 | 赤陶、沙色、石墨与基地舱室 |','| 火星移民 · 火星栖居计划 | 火星地形、聚落与轨道联络 | 赤陶、沙色、石墨与基地舱室 |\n| 中国易经 · 太初问道 | 阴阳玉盘、八卦环、山水云纹 | 浅色宣纸、墨色、青玉与朱砂 |\n| 西方众神 · 万神穹庭 | 月光水晶、悬浮神殿、星座与徽记 | 午夜靛紫、月光白、淡金 |');
guide=guide.replace('V7、V8 文件保留','V7、V8、V9 文件保留');await writeFile('贾维斯V10.0 · 八套主题与全平台体验说明.md',guide);
console.log('V10 focused platform, eight-choice, theme preference and visual audit QA prepared.');
