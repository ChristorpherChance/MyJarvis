import {readFile,writeFile,appendFile} from 'node:fs/promises';
const js=new URL('../prototype-v12/cinematic.js',import.meta.url);
let text=await readFile(js,'utf8');
text=text.replace("?saved.lastLight:'hero'","?saved.lastLight:'baijia'");
await writeFile(js,text,'utf8');
await appendFile(new URL('../prototype-v12/layout.css',import.meta.url),`\n/* The Avengers roster uses a panorama on the family board. */
html[data-j7-theme="hero"] .vm5-energy-mini.j7-board-core{width:320px;height:210px}
@media(max-width:760px){html[data-j7-theme="hero"] .vm5-energy-mini.j7-board-core{width:300px;height:185px}}
`,'utf8');
console.log('Light-mode fallback and roster board proportions corrected.');
