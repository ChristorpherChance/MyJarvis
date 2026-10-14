import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readdir,readFile,writeFile,rm,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {createHash,createCipheriv,randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApp} from '../apps/api/dist/app.js';
import {PLATFORM_BUILD} from '../apps/api/dist/runtime/cluster-runtime.js';
import {prepareLinuxData} from './prepare-linux-data.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('verified offline migration preserves credentials and original voice key; corrupt or extra files fail before conversion',async t=>{
 if(process.platform!=='linux'){t.skip('Linux offline migration fixture');return;}
 const root=await mkdtemp(join(tmpdir(),'jarvis-linux-migration-')),data=join(root,'source'),backup=join(root,'backup'),target=join(root,'restore');
 try{
 const pi={initialize:async()=>{},dispose:async()=>{},health:()=>({configured:false}),getSettings:async()=>({configured:false})};
 const runtime=await createApp({dataDir:data,pi,pythonExecutable:'/no-python-fixture'});
 const setup=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'migration-fixture-password'}});assert.equal(setup.statusCode,200);
 runtime.voice.configure('tts',{adapter:'command',executable:'/usr/bin/false',args:[],model:'windows-sapi'});
 // Reproduce actual saved Windows configuration, including its Windows absolute executable.
 const key=await readFile(join(data,'runtime/voice-master.key')),nonce=randomBytes(12),encoder=createCipheriv('aes-256-gcm',key,nonce);
 const bytes=Buffer.concat([encoder.update(JSON.stringify({adapter:'command',executable:'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',args:[],model:'windows-sapi',voice:'',language:'zh',format:'wav',timeoutMs:60000}),'utf8'),encoder.final()]);
 runtime.identity.db.prepare('UPDATE runtime_voice_engines SET config=? WHERE kind=?').run(JSON.stringify({nonce:nonce.toString('base64'),tag:encoder.getAuthTag().toString('base64'),value:bytes.toString('base64')}),'tts');
 const cookie=String(setup.headers['set-cookie']).split(';')[0];
 const conversation=(await runtime.app.inject({method:'POST',url:'/api/chat/conversations',headers:{cookie},payload:{memberId:'owner'}})).json();
 runtime.store.db.prepare('UPDATE conversations SET sessionPath=? WHERE id=?').run('D:/fixture/.jarvis/pi/session.jsonl',conversation.id);
 await mkdir(join(data,'pi'),{recursive:true});await writeFile(join(data,'pi/session.jsonl'),'fixture original transcript');
 await runtime.app.close();
 await promisify(execFile)(process.execPath,[resolve('scripts/backup.mjs'),backup],{env:{...process.env,JARVIS_DATA_DIR:data}});
 await cp(backup,target,{recursive:true});
 const files=[];async function walk(dir){for(const name of await readdir(dir,{withFileTypes:true})){const file=join(dir,name.name);if(name.isDirectory())await walk(file);else{const bytes=await readFile(file);files.push({path:relative(target,file),bytes:bytes.length,sha256:hash(bytes)});}}}await walk(target);
 const manifest={version:1,batchId:'migration-fixture',snapshotAt:new Date().toISOString(),build:PLATFORM_BUILD,originalDataDir:'D:/fixture/.jarvis',files},file=join(root,'transfer.json');await writeFile(file,JSON.stringify(manifest));
 const before=await readFile(join(data,'runtime/voice-master.key'));
 await writeFile(join(target,'pi/session.jsonl'),'corrupt');await assert.rejects(prepareLinuxData(target,file),/entry|SHA256/);assert.deepEqual(await readFile(join(target,'runtime/voice-master.key')),before);
 await cp(join(backup,'pi/session.jsonl'),join(target,'pi/session.jsonl'));await writeFile(join(target,'unexpected.txt'),'extra');await assert.rejects(prepareLinuxData(target,file),/Unexpected/);await rm(join(target,'unexpected.txt'));
 const result=await prepareLinuxData(target,file);assert.equal(result.voiceKeyPreserved,true);assert.equal(result.businessIntegrity,'ok');assert.equal(result.remappedPaths,1);assert.deepEqual(await readFile(join(target,'runtime/voice-master.key')),before);assert.deepEqual(await readFile(join(data,'runtime/voice-master.key')),before);
 const restored=await createApp({dataDir:target,pi,pythonExecutable:'/no-python-fixture'});try{
  assert.equal((await restored.app.inject({method:'POST',url:'/api/auth/login',payload:{password:'migration-fixture-password'}})).statusCode,200);
  assert.equal(restored.store.db.prepare('SELECT sessionPath FROM conversations WHERE id=?').get(conversation.id).sessionPath,join(target,'pi/session.jsonl'));
  assert.equal(restored.voice.getConfig('tts').model,'espeak-ng-offline-fallback');
 }finally{await restored.app.close();}
 }finally{assert(resolve(root).startsWith(resolve(tmpdir())+'/jarvis-linux-migration-'));await rm(root,{recursive:true,force:true});}
});
