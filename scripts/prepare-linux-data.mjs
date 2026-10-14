/** Offline conversion of a verified Windows backup. Never starts schedulers or agents. */
import {readFile,readdir,lstat} from 'node:fs/promises';
import {createHash,createDecipheriv,createCipheriv,randomBytes} from 'node:crypto';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../apps/api/dist/store.js';
import {IdentityRuntime} from '../apps/api/dist/runtime/identity.js';
import {VoiceRuntime} from '../apps/api/dist/runtime/voice.js';
import {engineSchema} from '../apps/api/dist/runtime/voice-adapter.js';
import {PLATFORM_BUILD} from '../apps/api/dist/runtime/cluster-runtime.js';
export async function prepareLinuxData(dataDir,manifestFile,{python='/opt/jarvis/venv/bin/python'}={}){
 const manifestBytes=await readFile(manifestFile),manifest=JSON.parse(manifestBytes);
 if(manifest.version!==1||manifest.build!==PLATFORM_BUILD||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Invalid migration manifest');
 const keyBefore=await readFile(join(dataDir,'runtime/voice-master.key'));
 if(keyBefore.length!==32)throw Error('Original voice key is required');
 const allowed=new Set();
 for(const item of manifest.files){const file=resolve(dataDir,item.path);if(!item.path||item.path.startsWith('/')||item.path.includes('\\')||relative(dataDir,file).startsWith('..')||allowed.has(item.path))throw Error('Unsafe manifest path');allowed.add(item.path);const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size!==item.bytes)throw Error('Invalid backup entry');if(createHash('sha256').update(await readFile(file)).digest('hex')!==item.sha256)throw Error('Backup SHA256 mismatch');}
 const walk=async(dir)=>{for(const name of await readdir(dir)){const file=join(dir,name),info=await lstat(file);if(info.isSymbolicLink())throw Error('Linked data is not allowed');if(info.isDirectory())await walk(file);else if(!allowed.has(relative(dataDir,file).split('\\').join('/')))throw Error('Unexpected file outside manifest');}};
 await walk(dataDir);
 for(const file of ['jarvis.db','execution/execution.sqlite']){const db=new DatabaseSync(join(dataDir,file),{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Database integrity failed');}finally{db.close();}}
 const old=String(manifest.originalDataDir).replaceAll('\\','/').replace(/\/$/,'');
 if(!/^[A-Za-z]:\//.test(old))throw Error('Expected explicit Windows source directory');
 const mapPath=value=>{if(typeof value!=='string')return value;const normalized=value.replaceAll('\\','/');return normalized.startsWith(old+'/')?join(dataDir,normalized.slice(old.length+1)):value;};
 let remapped=0;
 const mapObject=(value)=>{if(Array.isArray(value))return value.map(mapObject);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>{const next=typeof v==='string'&&/path|directory|file$/i.test(k)?mapPath(v):mapObject(v);if(next!==v&&typeof v==='string')remapped++;return[k,next];}));return value;};
 const db=new DatabaseSync(join(dataDir,'jarvis.db'));
 try{db.exec('BEGIN IMMEDIATE');
  for(const row of db.prepare('SELECT id,sessionPath FROM conversations').all()){const next=mapPath(row.sessionPath);if(next!==row.sessionPath){db.prepare('UPDATE conversations SET sessionPath=? WHERE id=?').run(next,row.id);remapped++;}}
  for(const row of db.prepare('SELECT position,json FROM v1_documents').all()){const value=JSON.parse(row.json),next=JSON.stringify(mapObject(value));if(next!==row.json)db.prepare('UPDATE v1_documents SET json=? WHERE position=?').run(next,row.position);}
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
  if(tables.has('runtime_voice_jobs'))for(const row of db.prepare('SELECT id,audio_file FROM runtime_voice_jobs WHERE audio_file IS NOT NULL').all()){const next=mapPath(row.audio_file);if(next!==row.audio_file){db.prepare('UPDATE runtime_voice_jobs SET audio_file=? WHERE id=?').run(next,row.id);remapped++;}}
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
 // Decode with the original key and replace only known local Windows commands BEFORE
 // VoiceRuntime validates executable paths using Linux isAbsolute. HTTP credentials remain intact.
 const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
 const localConfig=kind=>kind==='asr'?{adapter:'command',executable:python,args:[join(root,'apps/api/resources/voice/asr_faster_whisper.py'),'--input','{input}','--output','{output}','--model','{model}','--language','{language}'],model:join(dataDir,'runtime/models/whisper-tiny'),language:'zh',format:'wav',timeoutMs:180000}:{adapter:'command',executable:python,args:[join(root,'apps/api/resources/voice/tts_espeak.py'),'--text-file','{textFile}','--output','{output}','--language','{language}','--speed','{speed}'],model:'espeak-ng-offline-fallback',language:'zh',format:'wav',timeoutMs:60000};
 const configurationDb=new DatabaseSync(join(dataDir,'jarvis.db'));
 try{configurationDb.exec('BEGIN IMMEDIATE');
  for(const row of configurationDb.prepare('SELECT kind,config FROM runtime_voice_engines').all()){
   const encoded=JSON.parse(row.config),decoder=createDecipheriv('aes-256-gcm',keyBefore,Buffer.from(encoded.nonce,'base64'));decoder.setAuthTag(Buffer.from(encoded.tag,'base64'));
   const original=JSON.parse(Buffer.concat([decoder.update(Buffer.from(encoded.value,'base64')),decoder.final()]).toString('utf8'));
   if(original.adapter!=='command'){engineSchema.parse(original);continue;}
   if(!['asr','tts'].includes(row.kind))throw Error('Unknown local voice engine');
   const value=engineSchema.parse(localConfig(row.kind)),nonce=randomBytes(12),encoder=createCipheriv('aes-256-gcm',keyBefore,nonce),bytes=Buffer.concat([encoder.update(JSON.stringify(value),'utf8'),encoder.final()]);
   configurationDb.prepare('UPDATE runtime_voice_engines SET config=?,updated_at=? WHERE kind=?').run(JSON.stringify({nonce:nonce.toString('base64'),tag:encoder.getAuthTag().toString('base64'),value:bytes.toString('base64')}),new Date().toISOString(),row.kind);
  }configurationDb.exec('COMMIT');
 }catch(e){configurationDb.exec('ROLLBACK');throw e;}finally{configurationDb.close();}
 const store=new Store(dataDir),identity=new IdentityRuntime(store,{memberExists:()=>false,memberProfile:()=>undefined});let voice;
 try{voice=new VoiceRuntime(dataDir,identity,{defaultLocalTts:false});
  const asr=voice.getConfig('asr');if(!asr||asr.adapter==='command')voice.configure('asr',{adapter:'command',executable:python,args:[join(root,'apps/api/resources/voice/asr_faster_whisper.py'),'--input','{input}','--output','{output}','--model','{model}','--language','{language}'],model:join(dataDir,'runtime/models/whisper-tiny'),language:'zh',format:'wav',timeoutMs:180000});
  const tts=voice.getConfig('tts');if(!tts||tts.adapter==='command')voice.configure('tts',{adapter:'command',executable:python,args:[join(root,'apps/api/resources/voice/tts_espeak.py'),'--text-file','{textFile}','--output','{output}','--language','{language}','--speed','{speed}'],model:'espeak-ng-offline-fallback',language:'zh',format:'wav',timeoutMs:60000});
 }finally{if(voice)await voice.close();identity.close();store.close();}
 if(!keyBefore.equals(await readFile(join(dataDir,'runtime/voice-master.key'))))throw Error('Original voice key changed');
 for(const file of ['jarvis.db','execution/execution.sqlite']){const db=new DatabaseSync(join(dataDir,file),{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Converted database integrity failed');}finally{db.close();}}
 return {batchId:manifest.batchId,snapshotAt:manifest.snapshotAt,verifiedAt:new Date().toISOString(),build:PLATFORM_BUILD,verified:true,businessIntegrity:'ok',executionIntegrity:'ok',filesChecked:manifest.files.length,manifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),voiceKeyPreserved:true,remappedPaths:remapped};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=await prepareLinuxData(resolve(process.argv[2]),resolve(process.argv[3]));const{remappedPaths,...snapshot}=result;console.log(JSON.stringify({snapshot,remappedPaths}));}
