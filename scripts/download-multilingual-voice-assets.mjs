/** Public pinned data only; validates size, upstream hash and immutable Git blob metadata. */
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,stat,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {join} from 'node:path';
import {publicAssetFetch,closePublicAssetFetch} from './public-voice-asset-fetch.mjs';
const manifest=JSON.parse(await readFile('config/voice-multilingual-assets.json','utf8')),root='artifacts/multilingual-voice/models';
async function digest(path){const sha=createHash('sha256');let size=0;for await(const part of createReadStream(path)){sha.update(part);size+=part.length;}return {sha256:sha.digest('hex'),size};}
async function valid(path,item){try{const actual=await digest(path);if(actual.size!==item.size)return false;if(item.sha256)return actual.sha256===item.sha256;const bytes=await readFile(path),git=createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');return git===item.gitBlob;}catch{return false;}}
async function download(item,directory){
 await mkdir(directory,{recursive:true});const target=join(directory,item.name??item.file),partial=target+'.partial';
 if(await valid(target,item)){console.log((item.name??item.file)+' verified');return await digest(target);}
 for(let attempt=0;attempt<5;attempt++){
  const existing=(await stat(partial).catch(()=>({size:0}))).size;if(existing>item.size)await rm(partial,{force:true});
  const offset=existing<=item.size?existing:0;
  if(offset===item.size)break;
  try{
   const transferControl=new AbortController();let stallTimer=setTimeout(()=>transferControl.abort(),45000);const activity=()=>{clearTimeout(stallTimer);stallTimer=setTimeout(()=>transferControl.abort(),45000);};
   const url=item.assetId?`https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/assets/${item.assetId}?download=1&ts=${Date.now()}`:item.url+'?download=true&ts='+Date.now();
   let response;try{response=await publicAssetFetch(url,{headers:{...(item.assetId?{Accept:'application/octet-stream'}:{}),...(offset?{Range:`bytes=${offset}-`}:{})},signal:AbortSignal.any([AbortSignal.timeout(300000),transferControl.signal])});}catch(error){clearTimeout(stallTimer);throw error;}
   if(!response.ok||response.headers.get('content-type')?.includes('application/json'))throw Error('Public asset response '+response.status);
   const resume=offset>0&&response.status===206&&response.headers.get('content-range')?.startsWith(`bytes ${offset}-`);
   const stream=Readable.fromWeb(response.body);stream.on('data',activity);try{await pipeline(stream,createWriteStream(partial,{flags:resume?'a':'w'}));}finally{clearTimeout(stallTimer);}
   console.log((item.name??item.file)+' transfer '+(await stat(partial)).size+'/'+item.size);
   if((await stat(partial)).size===item.size)break;
  }catch(error){console.log((item.name??item.file)+' transfer retry '+(attempt+1));if(attempt===4)throw error;}
 }
 if(!await valid(partial,item))throw Error('Pinned model verification failed '+(item.name??item.file));await rename(partial,target);return await digest(target);
}
try{
 // Three independent 67 MB voices and one immutable multilingual recognizer.
 await Promise.all(manifest.piper.map(item=>download({...item,name:item.file},root)));
 for(const item of manifest.whisper.files){const actual=await download(item,join(root,manifest.whisper.directory));item.sha256=actual.sha256;}
 await writeFile('config/voice-multilingual-assets.json',JSON.stringify(manifest,null,2)+'\n');await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('All multilingual assets verified; production unchanged.');
}finally{await closePublicAssetFetch();}
