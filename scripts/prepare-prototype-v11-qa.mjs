import {readFile,writeFile} from 'node:fs/promises';
const ids="['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon','shanshui','baijia']";
for(const file of ['scripts/qa-prototype-v11.cjs','scripts/audit-prototype-v11-visuals.cjs','scripts/capture-prototype-v11-previews.cjs','scripts/capture-prototype-v11-effects.cjs','scripts/capture-prototype-v11-gallery.cjs']){
 let s=await readFile(file,'utf8');
 s=s.replaceAll("['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon']",ids).replaceAll("['yijing','pantheon']","['pantheon','shanshui','baijia']");
 if(file.includes('qa-prototype')){
  s=s.replaceAll('八','十').replaceAll('===8','===10').replace('[i%8]','[i%10]');
  s=s.replace("await page.keyboard.press('Alt+8');check('Alt8可选择众神',await page.evaluate(()=>J7.state.theme==='pantheon'));","await page.keyboard.press('Alt+8');check('Alt8可选择众神',await page.evaluate(()=>J7.state.theme==='pantheon'));await page.keyboard.press('Alt+9');check('Alt9可选择水墨',await page.evaluate(()=>J7.state.theme==='shanshui'));await page.keyboard.press('Alt+0');check('Alt0可选择诸子百家',await page.evaluate(()=>J7.state.theme==='baijia'));");
 }
 if(file.includes('previews'))s=s.replaceAll('previews:24','previews:30');
 if(file.includes('effects'))s=s.replaceAll('#theme=yijing','#theme=pantheon');
 if(file.includes('gallery'))s=s.replaceAll('!== 8','!== 10').replaceAll("['pantheon','yijing']","['pantheon','shanshui']");
 await writeFile(file,s);
}
console.log('Ten-theme QA, three new-skin audits and thirty preview checks prepared.');
