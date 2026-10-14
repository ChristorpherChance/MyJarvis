import {readFile,writeFile} from 'node:fs/promises';
const file='prototype-v11/layout.css';
let css=await readFile(file,'utf8');
const count=(css.match(/hten/g)||[]).length;
css=css.replaceAll('hten','height').replaceAll('wten','weight');
await writeFile(file,css);console.log(JSON.stringify({restoredDimensionTokens:count}));
