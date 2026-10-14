import {readFile,writeFile,mkdir} from 'node:fs/promises';
await mkdir('prototype-v9',{recursive:true});
let cine=await readFile('prototype-v8/cinematic.js','utf8');
cine=cine.replace("构成一座为你待命的机甲驾驶舱。'}","构成一座为你待命的机甲驾驶舱。'},\n  {id:'interstellar',name:'星际探索舱',short:'星际穿越',en:'ENDURANCE / GRAVITY',number:'05',tone:'dark',accent:'#e7e1d5',secondary:'#b99262',surface:'#151515',text:'#eee7dc',subtitle:'引力光环 · 深空观测 · 象牙白仪表',description:'在宁静的深空观测舱里，让引力光环随声音起伏；细白仪表与铜金航迹连接你的知识、家人和每一项探索。'},\n  {id:'mars',name:'火星栖居计划',short:'火星移民',en:'ARES / HABITAT',number:'06',tone:'dark',accent:'#e8a17b',secondary:'#d8c6a0',surface:'#191513',text:'#f0e5d6',subtitle:'火星地形 · 栖居网络 · 赤陶与沙色',description:'把日常放进一座有温度的火星基地：轨道上的星球、聚落与生命保障信号回应你的声音，每个板块都像一座井然有序的基地舱室。'}");
cine=cine.replaceAll('四套','六套').replaceAll('四种世界','六种世界').replaceAll("key='jarvis-v8-cinematic-preferences'","key='jarvis-v9-cinematic-preferences'").replace("localStorage.getItem(key)||localStorage.getItem('jarvis-v7-cinematic-preferences')","localStorage.getItem(key)||localStorage.getItem('jarvis-v8-cinematic-preferences')||localStorage.getItem('jarvis-v7-cinematic-preferences')").replace("sup.textContent='V8'","sup.textContent='V9'");
cine=cine.replace("muted:d.tone==='dark'?'#91a8b5':'#64758a'","muted:d.id==='interstellar'?'#b0a99e':d.id==='mars'?'#b9a89a':d.tone==='dark'?'#91a8b5':'#64758a'");
await writeFile('prototype-v9/cinematic.js',cine);
let layout=await readFile('prototype-v8/layout.css','utf8');
layout=layout.replace('Four independent','Six independent').replace('repeat(4,minmax(0,1fr))','repeat(3,minmax(0,1fr))').replace('grid-template-columns:repeat(2,minmax(0,1fr));gap:3px;width:100%','grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;width:100%');
layout+='\n/* Six themes remain directly reachable without displacing voice controls. */\n@media(min-width:761px) and (max-width:1500px){html[data-j7-theme] .j7-film-switch i{display:none}html[data-j7-theme] .j7-film-switch button{padding:7px 11px;gap:6px;font-size:12px}html[data-j7-theme] .j7-film-bar{gap:12px;flex-wrap:nowrap}}\n@media(min-width:761px) and (max-width:1080px){html[data-j7-theme] .j7-film-bar{flex-wrap:wrap}html[data-j7-theme] .j7-film-switch button{font-size:11px;padding:7px 9px}}\n@media(max-width:760px){html[data-j7-theme] .j7-film-switch button{padding:5px 4px;gap:4px;font-size:10px}html[data-j7-theme] .j7-film-switch small{font-size:8px}}\n';
await writeFile('prototype-v9/layout.css',layout);
const filename='贾维斯V9.0 · 六套主题与全平台交互原型.html';
for(const name of ['qa-prototype-v8.cjs','qa-prototype-v8-interactions.cjs','capture-prototype-v8.cjs','capture-prototype-v8-effects.cjs','capture-prototype-v8-gallery.cjs']){
 let s=await readFile('scripts/'+name,'utf8');
 s=s.replaceAll('贾维斯V8.0 · 四套电影灵感与对话特效原型.html',filename).replaceAll('prototype-v8-qa','prototype-v9-qa').replaceAll("['stark','matrix','hero','jaeger']","['stark','matrix','hero','jaeger','interstellar','mars']").replaceAll('四种不同','六种不同').replaceAll('首屏四风格','首屏六风格').replaceAll('四方案对比','六方案对比').replaceAll('count()===4','count()===6').replaceAll('[i%4]','[i%6]');
 await writeFile('scripts/'+name.replace('v8','v9'),s);
}
console.log('V9 coordinator, layout and QA scaffold ready.');
