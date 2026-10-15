const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {buildSync}=require('esbuild');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-material-processing-client-'));
function bundle(entry,name){const file=path.join(temp,name+'.cjs');buildSync({entryPoints:[path.resolve(entry)],bundle:true,platform:'node',format:'cjs',outfile:file,logLevel:'silent'});return require(file)}
const client=bundle('apps/web/src/features/operations/inbox-material-client.ts','client');
const intents=bundle('apps/web/src/features/operations/inbox-material-intents.ts','intents');
class MemoryStorage{entries=new Map();get length(){return this.entries.size}key(i){return [...this.entries.keys()][i]??null}getItem(k){return this.entries.get(k)??null}setItem(k,v){this.entries.set(k,String(v))}removeItem(k){this.entries.delete(k)}}
global.localStorage=new MemoryStorage();global.location={origin:'https://processing.test'};
const response=data=>new Response(JSON.stringify({requestId:'qa',version:1,data,events:[]}),{status:200,headers:{'Content-Type':'application/json'}});
const actor='real-owner',assetId=crypto.randomUUID(),name='asset:'+assetId;
let checks=0;
async function check(label,fn){await fn();checks++;console.log('PASS '+label)}
(async()=>{
 await check('an uncertain processing command survives reload with exact original consent, language and revision',async()=>{
  const intent={kind:'process',assetId,input:{commandId:crypto.randomUUID(),expectedVersion:2,operation:'transcribe',cloudConsent:false,language:'auto'}};
  intents.saveMaterialIntent(actor,name,intent);let sent;
  global.fetch=async(_url,init)=>{sent=JSON.parse(init.body);throw new TypeError('reply lost')};
  await assert.rejects(client.processInboxMaterial(assetId,intent.input),/reply lost/);
  const restored=intents.getMaterialIntent(actor,name);assert.deepEqual(restored,intent);assert.deepEqual(sent,intent.input);
  assert.throws(()=>intents.saveMaterialIntent(actor,name,{...intent,input:{...intent.input,cloudConsent:true}}),/没有发送/);
  assert.throws(()=>intents.saveMaterialIntent(actor,name,{...intent,input:{...intent.input,expectedVersion:3}}),/没有发送/);
  assert.equal(intents.getMaterialIntent('different-owner',name),null);
  intents.removeMaterialIntent(actor,name,{...intent,input:{...intent.input,commandId:crypto.randomUUID()}});assert.deepEqual(intents.getMaterialIntent(actor,name),intent);
  intents.removeMaterialIntent(actor,name,intent);assert.equal(intents.getMaterialIntent(actor,name),null);
 });
 await check('process and review calls preserve server results and never forge extracted text or a reviewed state',async()=>{
  const calls=[],machine={text:'识别原文',sourceSha256:'source-sha',textSha256:'machine-sha',reviewRequired:true},result={id:assetId,revision:4,extraction:machine,processing:{status:'failed',error:{message:'引擎尚未配置'}}};
  global.fetch=async(url,init)=>{calls.push({url,init});return response(result)};
  const process={commandId:crypto.randomUUID(),expectedVersion:2,operation:'extract',cloudConsent:false,language:'zh'};
  const received=await client.processInboxMaterial(assetId,process);assert.equal(received.processing.status,'failed');assert.equal(received.textReview,undefined);assert.deepEqual(received.extraction,machine);assert.match(calls[0].url,/\/process$/);assert.deepEqual(JSON.parse(calls[0].init.body),process);
  const review={commandId:crypto.randomUUID(),expectedVersion:4,text:'人工核对后的文字\n保留换行'};
  await client.reviewInboxMaterialText(assetId,review);assert.match(calls[1].url,/\/text-review$/);assert.deepEqual(JSON.parse(calls[1].init.body),review);assert.equal(calls[1].init.credentials,'same-origin');
 });
 await check('web extraction is an explicit fixed-asset request and retains its source URL and scope',async()=>{
  const input={id:crypto.randomUUID(),url:'https://allowed.example/article#source',scope:'private'},intent={kind:'link',input};
  intents.saveMaterialIntent(actor,'link:draft-1',intent);let sent;
  global.fetch=async(url,init)=>{sent={url,body:JSON.parse(init.body)};return response({id:input.id,status:'failed',processing:{status:'failed',error:{message:'该网站尚未获准'}}})};
  const result=await client.extractInboxLink(input);assert.equal(result.status,'failed');assert.equal(sent.url,'/api/v1/inbox-materials/links/extract');assert.deepEqual(sent.body,input);assert.deepEqual(intents.getMaterialIntent(actor,'link:draft-1'),intent);
  for(const url of ['javascript:alert(1)','https://name:password@example.com/'])assert.throws(()=>intents.saveMaterialIntent(actor,'unsafe:'+url,{kind:'link',input:{...input,url}}),/没有发送/);
 });
 await check('blocked storage, corrupt intents and extra sensitive fields fail before HTTP',()=>{
  const base={kind:'process',assetId,input:{commandId:crypto.randomUUID(),expectedVersion:2,operation:'extract'}};
  assert.throws(()=>intents.saveMaterialIntent(actor,'bad-extra',{...base,input:{...base.input,cookie:'must-not-persist'}}),/没有发送/);
  assert.throws(()=>intents.saveMaterialIntent(actor,'bad-version',{...base,input:{...base.input,expectedVersion:0}}),/没有发送/);
  const working=localStorage;global.localStorage=new MemoryStorage();localStorage.setItem=()=>{throw new Error('quota')};assert.throws(()=>intents.saveMaterialIntent(actor,name,base),/没有发送/);global.localStorage=working;
  const key='jarvis-inbox-material-intent-v1:'+encodeURIComponent(actor)+':'+encodeURIComponent('corrupt');localStorage.setItem(key,'{bad');assert.throws(()=>intents.getMaterialIntent(actor,'corrupt'),/无法恢复/);localStorage.removeItem(key);
 });
 await check('human corrections are durable candidates and ending a session clears intents without unrelated preferences',()=>{
  const review={kind:'review',assetId,input:{commandId:crypto.randomUUID(),expectedVersion:5,text:'校正文候选'}};intents.saveMaterialIntent(actor,name,review);assert.deepEqual(intents.getMaterialIntent(actor,name),review);
  localStorage.setItem('appearance-preference','retain');intents.clearMaterialIntents();assert.equal(intents.getMaterialIntent(actor,name),null);assert.equal(intents.getMaterialIntent(actor,'link:draft-1'),null);assert.equal(localStorage.getItem('appearance-preference'),'retain');
  assert.match(client.materialStatus({mediaKind:'audio',extraction:{text:'候选'}}),/待核对/);assert.match(client.materialStatus({mediaKind:'audio',textReview:{text:'校正'}}),/校正文字已保存/);
 });
 console.log(checks+' material processing client checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
