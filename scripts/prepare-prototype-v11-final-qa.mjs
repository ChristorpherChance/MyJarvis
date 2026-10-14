import {readFile,writeFile} from 'node:fs/promises';
const file='scripts/qa-prototype-v11.cjs';let s=await readFile(file,'utf8');
s=s.replaceAll('const mic=await page.locator','await page.evaluate(()=>window.scrollTo(0,0));const mic=await page.locator');
await writeFile(file,s);console.log('Primary-control measurements reset document scroll.');
