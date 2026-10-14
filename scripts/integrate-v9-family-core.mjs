import {readFile,writeFile} from 'node:fs/promises';
const path='prototype-v9/cinematic.js';let s=await readFile(path,'utf8');
if(!s.includes("document.querySelector('.vm5-energy-mini')")){
 s=s.replace("||document.querySelector('.j7-home-visual');if(!host)return;host.classList.add('j7-core-holder');","||document.querySelector('.j7-home-visual')||document.querySelector('.vm5-energy-mini');if(!host)return;host.classList.add('j7-core-holder');if(host.matches('.vm5-energy-mini'))host.classList.add('j7-board-core');");
 s=s.replace("host.classList.contains('j7-home-visual')?'ready'","(host.classList.contains('j7-home-visual')||host.classList.contains('j7-board-core'))?'ready'");
 s=s.replace("if(U.route==='overview')mountVisual()","if(U.route==='overview'||U.route==='screen')mountVisual()");
 await writeFile(path,s);
}
console.log('Family board uses the active cinematic core.');
