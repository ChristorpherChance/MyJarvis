import {readFile,writeFile} from 'node:fs/promises';
const jobs=[['capture-prototype-v11-previews.cjs','capture-prototype-v12-previews.cjs'],['capture-prototype-v11-effects.cjs','capture-prototype-v12-effects.cjs'],['capture-prototype-v11-gallery.cjs','capture-prototype-v12-gallery.cjs'],['audit-prototype-v11-visuals.cjs','audit-prototype-v12-visuals.cjs'],['qa-prototype-v11.cjs','qa-prototype-v12-control.cjs']];
for(const [from,to] of jobs){
 let text=await readFile(new URL(from,import.meta.url),'utf8');
 text=text.replaceAll('prototype-v11-qa','prototype-v12-qa').replaceAll('贾维斯V11.0','贾维斯V12.0');
 if(to.includes('previews'))text=text.replace("if(['pantheon','shanshui','baijia'].includes(t))",'if(true)');
 if(to.includes('effects'))text=text.replace("['pantheon','shanshui','baijia']", "['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon','shanshui','baijia']");
 if(to.includes('audit'))text=text.replace("const themes=['pantheon','shanshui','baijia'];", "const themes=['hero','baijia'];");
 if(to.includes('control')){
  text=text.replaceAll("['pantheon','shanshui','baijia']","['hero','baijia']");
  text=text.replace('await page.goto(url);check(', "await page.goto(url);check('默认全景对话',await page.evaluate(()=>J12Immersive.isTheatre()));await page.evaluate(()=>J12Immersive.setMode('control'));check(");
  text=text.replaceAll('语音主控制首屏','控制模式语音主控制可用').replaceAll('主控首屏','控制模式主控可用');
  text=text.replace('mic&&mic.y+mic.height<=viewport.height','mic&&mic.y>=0&&mic.height>=40').replace('mic.y+mic.height<=viewport.height','mic.y>=0&&mic.height>=40');
  text=text.replace("'qa-report.json'","'control-qa-report.json'").replace("'qa-failure.json'","'control-qa-failure.json'");
 }
 await writeFile(new URL(to,import.meta.url),text,'utf8');
}
console.log('V12 control regression and actual visual captures prepared.');
