import {cp,copyFile,mkdir,rename,rm} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const web=resolve(dirname(fileURLToPath(import.meta.url)),'../apps/web');
const staging=resolve(web,'.dist-staging'),dist=resolve(web,'dist');
if(!staging.startsWith(web+sep)||staging===web||!dist.startsWith(web+sep))throw new Error('Invalid frontend build paths');
await mkdir(dist,{recursive:true});
// Keep existing hashed chunks available for browsers using the previous document.
await cp(staging,dist,{recursive:true,filter:source=>source!==resolve(staging,'index.html')});
await copyFile(resolve(staging,'index.html'),resolve(dist,'.index-next.html'));
await rename(resolve(dist,'.index-next.html'),resolve(dist,'index.html'));
await rm(staging,{recursive:true,force:true});
console.log('Frontend assets promoted; existing data and active browser chunks preserved.');
