import {readFile,writeFile,mkdir} from 'node:fs/promises';
await mkdir('prototype-v10',{recursive:true});
let cine=await readFile('prototype-v9/cinematic.js','utf8');
cine=cine.replace("基地舱室。'}","基地舱室。'},\n  {id:'yijing',name:'太初问道',short:'中国易经',en:'TAIJI / WISDOM',number:'07',tone:'light',accent:'#176d62',secondary:'#ba463c',surface:'#f4f0e6',text:'#242e2b',subtitle:'阴阳玉盘 · 八卦环 · 宣纸与山水',description:'墨色与青玉相映，阴阳玉盘随你的声音流转；把知识、家人和日常事务安放在清晰宁静的东方书院里。'},\n  {id:'pantheon',name:'万神穹庭',short:'西方众神',en:'PANTHEON / CELESTIAL',number:'08',tone:'dark',accent:'#c6b5ff',secondary:'#ead8a1',surface:'#151226',text:'#f0edf8',subtitle:'天穹神殿 · 星座徽记 · 靛紫与月光',description:'悬浮柱廊守护月光水晶，星座与诸神徽记响应你的声音；以高贵而清楚的神殿仪表组织陪伴、探索与每项工作。'}");
cine=cine.replaceAll('六套','八套').replaceAll('六种世界','八种世界').replaceAll('电影灵感','主题').replaceAll('CINEMATIC COLLECTION','VISUAL WORLDS').replace("key='jarvis-v9-cinematic-preferences'","key='jarvis-v10-cinematic-preferences'").replace("localStorage.getItem(key)||localStorage.getItem('jarvis-v8-cinematic-preferences')","localStorage.getItem(key)||localStorage.getItem('jarvis-v9-cinematic-preferences')||localStorage.getItem('jarvis-v8-cinematic-preferences')").replace("sup.textContent='V9'","sup.textContent='V10'");
cine=cine.replace("scene:'chat',layer:null","lastLight:designs.some(d=>d.id===saved.lastLight&&d.tone==='light')?saved.lastLight:'hero',scene:'chat',layer:null");
cine=cine.replace("if(design().tone==='dark')state.lastDark=state.theme;","if(design().tone==='dark')state.lastDark=state.theme;else state.lastLight=state.theme;");
cine=cine.replace('lastDark:state.lastDark,choice:state.choice','lastDark:state.lastDark,lastLight:state.lastLight,choice:state.choice');
cine=cine.replace("if(design().tone==='dark')state.lastDark=id;palette()","if(design().tone==='dark')state.lastDark=id;else state.lastLight=id;palette()");
cine=cine.replace("apply(design().tone==='dark'?'hero':state.lastDark)","apply(design().tone==='dark'?state.lastLight:state.lastDark)");
cine=cine.replace("muted:d.id==='interstellar'?","muted:d.id==='yijing'?'#63736b':d.id==='pantheon'?'#b6aed0':d.id==='interstellar'?");
await writeFile('prototype-v10/cinematic.js',cine);
let layout=await readFile('prototype-v9/layout.css','utf8');
layout=layout.replaceAll('Six independent','Eight independent').replaceAll('Six themes','Eight themes').replace('html[data-j7-theme]:not([data-j7-theme="hero"])','html[data-j7-theme][data-j7-tone="dark"]').replace('repeat(3,minmax(0,1fr))}}','repeat(4,minmax(0,1fr))}}').replace('grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;width:100%','grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;width:100%');
layout=layout.replace('(max-width:1080px)','(max-width:1250px)');
layout+='\n/* Eight direct theme choices; no extra row on the voice-first phone layout. */\n@media(min-width:761px) and (max-width:1500px){html[data-j7-theme] .j7-film-switch button{font-size:11px;padding:7px 9px;gap:5px}}\n@media(max-width:760px){html[data-j7-theme] .j7-film-switch button{padding:5px 3px;gap:3px;font-size:9px}}\nhtml[data-j7-theme="pantheon"] .vm5-energy-mini.j7-board-core{width:300px;height:190px}\n@media(max-width:760px){html[data-j7-theme="pantheon"] .vm5-energy-mini.j7-board-core{width:260px;height:165px}}\n';
await writeFile('prototype-v10/layout.css',layout);
let build=await readFile('scripts/build-prototype-v9.mjs','utf8');
build=build.replace("names=['stark','matrix','hero','jaeger','interstellar','mars']","names=['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon']");
build=build.replace("const dir=n=>['interstellar'","const dir=n=>['yijing','pantheon'].includes(n)?'prototype-v10/':['interstellar'");
build=build.replaceAll('prototype-v9/layout','prototype-v10/layout').replaceAll('prototype-v9/theme-polish','prototype-v10/theme-polish').replaceAll('prototype-v9/cinematic','prototype-v10/cinematic').replaceAll('artifacts/prototype-v9-qa','artifacts/prototype-v10-qa').replaceAll('prototype-v9/build-manifest','prototype-v10/build-manifest');
build=build.replaceAll('贾维斯 V9 · 六套主题与全平台交互原型','贾维斯 V10 · 八套主题与全平台交互原型').replaceAll('贾维斯V9.0 · 六套主题与全平台交互原型.html','贾维斯V10.0 · 八套主题与全平台交互原型.html').replaceAll('探索贾维斯 V9','探索贾维斯 V10').replaceAll('Jarvis-V9-','Jarvis-V10-').replaceAll('jarvis-v9-inline','jarvis-v10-inline');
await writeFile('scripts/build-prototype-v10.mjs',build);
const filename='贾维斯V10.0 · 八套主题与全平台交互原型.html';
for(const name of ['capture-prototype-v9.cjs','capture-prototype-v9-effects.cjs','capture-prototype-v9-gallery.cjs']){
 let s=await readFile('scripts/'+name,'utf8');s=s.replaceAll('贾维斯V9.0 · 六套主题与全平台交互原型.html',filename).replaceAll('prototype-v9-qa','prototype-v10-qa').replaceAll("['stark','matrix','hero','jaeger','interstellar','mars']","['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon']").replaceAll('count() !== 6','count() !== 8');
 await writeFile('scripts/'+name.replace('v9','v10'),s);
}
await mkdir('artifacts/prototype-v10-qa/previews',{recursive:true});
// Existing six previews provide a complete first comparison while the two new views are captured.
for(const t of ['stark','matrix','hero','jaeger','interstellar','mars'])for(const v of ['chat','overview','screen'])await writeFile('artifacts/prototype-v10-qa/previews/'+t+'-'+v+'.jpg',await readFile('artifacts/prototype-v9-qa/previews/'+t+'-'+v+'.jpg'));
console.log('V10 eight-theme coordinator, layout, preferences and build ready.');
