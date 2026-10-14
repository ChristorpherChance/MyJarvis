/** Public upstream metadata only. Pins every model before installation or inference. */
import {mkdir,writeFile} from 'node:fs/promises';
import {publicAssetFetch,closePublicAssetFetch} from './public-voice-asset-fetch.mjs';
const fetchJson=async url=>{const response=await publicAssetFetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Public model metadata '+response.status);return response.json();};
const hf=await fetchJson('https://huggingface.co/api/models/Systran/faster-whisper-small/revision/main?blobs=true');
const files=['model.bin','config.json','tokenizer.json','vocabulary.txt'].map(name=>{const item=hf.siblings.find(s=>s.rfilename===name);if(!item)throw Error('Whisper required file missing');return {name,size:item.size,sha256:item.lfs?.sha256,gitBlob:item.blobId,url:`https://huggingface.co/Systran/faster-whisper-small/resolve/${hf.sha}/${name}`};});
const github=await fetchJson('https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/tts-models');
const piper=[['en','vits-piper-en_US-lessac-medium'],['fr','vits-piper-fr_FR-siwis-medium'],['de','vits-piper-de_DE-thorsten-medium']].map(([language,name])=>{const asset=github.assets.find(a=>a.name===name+'.tar.bz2');if(!asset?.digest?.startsWith('sha256:'))throw Error('Piper official digest unavailable '+name);return {language,name,file:asset.name,size:asset.size,sha256:asset.digest.slice(7),assetId:asset.id,url:asset.browser_download_url};});
const manifest={revision:'20261010-multilingual-r1',whisper:{repository:'Systran/faster-whisper-small',revision:hf.sha,directory:'faster-whisper-small',device:'cpu',computeType:'int8',files},piper,dependencies:{'faster-whisper':'1.2.1','ctranslate2':'4.6.0','sherpa-onnx':'1.13.8','numpy':'2.2.6','av':'19.0.0'}};
await mkdir('config',{recursive:true});await writeFile('config/voice-multilingual-assets.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
await closePublicAssetFetch();
