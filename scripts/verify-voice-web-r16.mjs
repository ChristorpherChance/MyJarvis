/**
 * Explicit post-release production verification. Prepared without execution.
 * node scripts/verify-voice-web-r16.mjs --execute [--build=20261010-voice-web-r16]
 * Five synthetic, independent turns only. Cookie and text stay in memory.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {request} from 'node:https';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {primary,python} from './managed-server-client.mjs';

if(!process.argv.includes('--execute')){
 console.log('Prepared. Requires --execute after the expected release is online. No connection or model request was made.');
 process.exit(0);
}
const expectedBuild=process.argv.find(a=>a.startsWith('--build='))?.slice(8)||'20261010-voice-web-r16',origin='https://192.168.10.112:3140',runId=randomUUID(),startedAt=new Date().toISOString(),titlePrefix='R16 validation '+runId+' ',output=resolve('artifacts/voice-web-r16-production/'+runId);
const turns=[],created=[],cleanupErrors=[];let cookie='',ca,build='',failure,revoked=false,modelRequests=0,removed=0;
function ensure(value,code){if(!value)throw Error(code);}
function storeOperation(code){
 // Never relay subprocess stderr: it may quote a command containing the cookie.
 return primary(python({code},'import subprocess\nr=subprocess.run(["/opt/jarvis/node/bin/node","--input-type=module","-e",p["code"]],cwd="/opt/jarvis/current",capture_output=True,text=True)\nif r.returncode: raise RuntimeError("PRIVATE_MAINTENANCE_OPERATION_FAILED")\nprint(r.stdout)\n'));
}
function localError(error){const value=String(error?.message||'VERIFICATION_FAILED');return /^[A-Z][A-Z0-9_ :.-]{0,180}$/.test(value)?value:'VERIFICATION_FAILED';}
function safeUrl(raw){
 try{const u=new URL(raw.replace(/[.,;。；，!！]+$/g,''));if(!['http:','https:'].includes(u.protocol)||u.username||u.password||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(u.hostname))return null;u.hash='';return u.href;}catch{return null;}
}
function urls(text){return [...new Set((text.match(/https?:\/\/[^\s<>"'\x60)\]]+/g)||[]).map(safeUrl).filter(Boolean))];}
function api(path,body,method=body===undefined?'GET':'POST',timeoutMs=20000){
 return new Promise((resolveRequest,reject)=>{
  const raw=body===undefined?undefined:JSON.stringify(body);let size=0,bytes=[];
  const req=request(origin+path,{method,ca,headers:{cookie:'jarvis_session='+cookie,...(raw===undefined?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)})}},res=>{
   res.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){req.destroy(Error('JSON_RESPONSE_TOO_LARGE'));return;}bytes.push(chunk);});
   res.on('error',reject);res.on('end',()=>{try{ensure(res.statusCode>=200&&res.statusCode<300,'API_HTTP_'+res.statusCode);resolveRequest(JSON.parse(Buffer.concat(bytes).toString('utf8')));}catch(error){reject(error);}});
  });
  const timer=setTimeout(()=>req.destroy(Error('API_TIMEOUT')),timeoutMs);req.on('close',()=>clearTimeout(timer));req.once('error',reject);req.end(raw);
 });
}
function stream(id,input){
 return new Promise((resolveStream,reject)=>{
  const raw=JSON.stringify(input),start=performance.now(),decoder=new TextDecoder(),record={events:[],toolNames:[],routes:[],firstDeltaMs:null,firstSpeechMs:null,transitionMs:null,doneMs:null,speechCount:0,status:'pending'},seenTools=new Set();let buffer='',bytes=0,publicText='',approvedText='',transitionText='',done;
  const event=(name,data)=>{
   const atMs=Math.round((performance.now()-start)*10)/10,index=record.events.length;
   if(['route','delta','speech','transition','done','tool','error'].includes(name))record.events.push({event:name,atMs,index});
   if(name==='route'){ensure(['fast','advanced'].includes(data.tier),'INVALID_ROUTE');record.routes.push({tier:data.tier,reason:String(data.reason||'').slice(0,100),provider:String(data.provider||'').slice(0,180),model:String(data.model||'').slice(0,180),...(data.fallback?{fallback:String(data.fallback).slice(0,180)}:{}),atMs});}
   if(name==='tool'&&/^[a-zA-Z0-9_-]{1,100}$/.test(data.name)){seenTools.add(data.name);record.toolNames=[...seenTools];record.events.at(-1).name=data.name;record.events.at(-1).state=['running','complete','failed'].includes(data.state)?data.state:'unknown';}
   if(name==='delta'&&typeof data.text==='string'){record.firstDeltaMs??=atMs;publicText+=data.text;}
   if(name==='speech'){ensure(data.approved===true&&data.sequence===record.speechCount&&typeof data.text==='string','UNAPPROVED_SPEECH');record.firstSpeechMs??=atMs;record.speechCount++;approvedText+=data.text;}
   if(name==='transition'){ensure(data.approved===true&&data.sequence===0&&!transitionText&&typeof data.text==='string'&&data.text.length<=180,'INVALID_TRANSITION');record.transitionMs=atMs;transitionText=data.text;}
   if(name==='error')throw Error('FAMILY_STREAM_ERROR');
   if(name==='done'){
    ensure(!done&&data.status==='complete'&&typeof data.message?.content==='string','INCOMPLETE_FAMILY_TURN');done=data;record.doneMs=atMs;publicText=data.message.content;
    const speech=data.speech;ensure(speech&&['incremental','final'].includes(speech.mode),'MISSING_SPEECH_RECEIPT');ensure(speech.mode!=='incremental'||speech.segments===record.speechCount&&speech.text===approvedText,'SPEECH_RECEIPT_MISMATCH');ensure(speech.mode!=='final'||record.speechCount===0,'FINAL_MODE_EMITTED_SPEECH');
    ensure(data.transition?.segments===(transitionText?1:0)&&data.transition.text===transitionText,'TRANSITION_RECEIPT_MISMATCH');
    record.done={status:data.status,speech:{mode:speech.mode,segments:speech.segments,textChars:speech.text?.length??0},transition:{segments:data.transition.segments,textChars:data.transition.text.length}};record.status='complete';
   }
  };
  const req=request(origin+'/api/runtime/family/conversations/'+id+'/messages',{method:'POST',ca,headers:{cookie:'jarvis_session='+cookie,Accept:'text/event-stream','Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)}},res=>{
   if(res.statusCode!==200||!res.headers['content-type']?.includes('text/event-stream')){res.resume();return reject(Error('SSE_HTTP_'+res.statusCode));}
   res.on('data',chunk=>{
    try{bytes+=chunk.length;ensure(bytes<=2*1024*1024,'SSE_TOO_LARGE');buffer+=decoder.decode(chunk,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,end);buffer=buffer.slice(end+2);const name=packet.split('\n').find(line=>line.startsWith('event:'))?.slice(6).trim(),data=packet.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(name&&data)event(name,JSON.parse(data));}}catch(error){req.destroy(error);}
   });
   res.once('error',reject);res.once('end',()=>{try{ensure(done&&record.status==='complete','SSE_MISSING_DONE');record.sourceURLs=urls(publicText);record.totalMs=Math.round(performance.now()-start);resolveStream({record,publicText});}catch(error){reject(error);}});
  });
  // Absolute deadline; SSE heartbeats cannot extend the 150-second allowance.
  const timer=setTimeout(()=>req.destroy(Error('TURN_TIMEOUT')),150000);req.on('close',()=>clearTimeout(timer));req.once('error',reject);req.end(raw);
 });
}
// Serialized and run remotely. Only this run's owned news tool metadata leaves RAM.
async function privateNewsReader(p){
 const {Store}=await import('./apps/api/dist/store.js'),{readFile,realpath,lstat}=await import('node:fs/promises'),{resolve,join,sep}=await import('node:path'),s=new Store('/var/lib/jarvis/data');
 const check=ok=>{if(!ok)throw Error('PRIVATE_SYNTHETIC_PROVENANCE_FAILED');};
 try{
  check(/^[0-9a-f-]{36}$/i.test(p.id));const c=s.getConversation('server-admin',p.id);check(c&&c.actorId==='server-admin'&&c.memberId==='me'&&c.title===p.title&&c.title.startsWith('R16 validation '+p.runId+' ')&&Date.parse(c.createdAt)>=Date.parse(p.startedAt)-5000&&c.sessionPath);
  const root=await realpath('/var/lib/jarvis/data/pi/sessions'),allowed=join(root,'server-admin',p.id),folder=await realpath(allowed);check(folder===resolve(allowed));
  const target=await realpath(c.sessionPath);check(target.startsWith(folder+sep)&&target.endsWith('.jsonl')&&target===resolve(c.sessionPath));const stat=await lstat(target);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=2*1024*1024);
  const items=[],toolResults=[];for(const line of (await readFile(target,'utf8')).split('\n')){
   if(!line.trim())continue;const entry=JSON.parse(line),m=entry.type==='message'?entry.message:null;if(m?.role!=='toolResult'||m.toolName!=='jarvis_news')continue;
   toolResults.push({toolName:'jarvis_news',failed:m.isError===true});if(m.isError)continue;
   for(const part of m.content??[]){if(part.type!=='text'||typeof part.text!=='string')continue;let body;try{body=JSON.parse(part.text);}catch{continue;}if(!Array.isArray(body.items))continue;
    for(const item of body.items){if(typeof item.url!=='string')continue;items.push({url:item.url,fetchedAt:typeof item.fetchedAt==='string'?item.fetchedAt:body.fetchedAt,sourcePublishedAt:typeof item.sourcePublishedAt==='string'?item.sourcePublishedAt:null});}
   }
  }
  process.stdout.write(JSON.stringify({toolResults,items}));
 }finally{s.close();}
}
function syntheticNewsProvenance(id,title){
 ensure(/^[0-9a-f-]{36}$/i.test(id)&&title===titlePrefix+'news','INVALID_SYNTHETIC_SCOPE');
 const payload=JSON.stringify({id,title,startedAt,runId});
 return JSON.parse(storeOperation('('+privateNewsReader.toString()+')('+payload+').catch(()=>{process.exitCode=1;})'));
}
const cases=[
 {name:'english',language:'en',text:'Hello.',greeting:/\b(hello|hi|how|welcome|you)\b/i},
 {name:'french',language:'fr',text:'Bonjour.',greeting:/\b(bonjour|salut|vous|je|comment|bienvenue)\b/i},
 {name:'german',language:'de',text:'Hallo.',greeting:/\b(hallo|guten|ich|dir|dich|wie|willkommen)\b/i},
 {name:'comparison',language:'zh',text:'请比较本地 NAS 与云端备份的方案，给出三点权衡和一条建议；只讨论合成家庭场景，不执行任何操作。'},
 {name:'news',language:'zh',text:'请使用 jarvis_news 查询已配置官方新闻源最近72小时的一条更新，给出真实来源 HTTP(S) URL 和来源报告的发布时间。没有结果就明确说明。请勿调用其他联网工具，不要伪造来源。'}
];
try{
 await mkdir(output,{recursive:true});ca=await readFile('artifacts/linux-deployment/jarvis-lan-ca.crt');
 cookie=storeOperation("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{process.stdout.write(s.createLogin());}finally{s.close();}");ensure(/^[A-Za-z0-9_-]{43}$/.test(cookie),'INVALID_MAINTENANCE_SESSION');
 const health=await api('/api/health');build=health.build;ensure(build===expectedBuild&&health.status==='ok','EXPECTED_BUILD_NOT_ONLINE');
 for(const spec of cases){
  const turn={name:spec.name,language:spec.language,status:'failed'};turns.push(turn);let id;
  try{
   const title=titlePrefix+spec.name,conversation=await api('/api/runtime/family/conversations',{title});id=conversation.id;ensure(/^[0-9a-f-]{36}$/i.test(id),'INVALID_SYNTHETIC_CONVERSATION');created.push(id);ensure(modelRequests<5,'MODEL_REQUEST_LIMIT');modelRequests++;
   const result=await stream(id,{text:spec.text,voiceLanguage:spec.language,voiceMode:true,cloudConsent:true});Object.assign(turn,result.record);
   ensure(turn.routes.length===1,'ROUTE_METADATA_MISSING');
   if(spec.greeting){ensure(spec.greeting.test(result.publicText),'RESPONSE_LANGUAGE_CHECK_FAILED');ensure(turn.routes[0].tier==='fast','GREETING_NOT_FAST');ensure(turn.done.speech.mode==='incremental'&&turn.speechCount>0,'GREETING_NOT_INCREMENTAL');const speechIndex=turn.events.findIndex(e=>e.event==='speech'),doneIndex=turn.events.findIndex(e=>e.event==='done');ensure(speechIndex>=0&&speechIndex<doneIndex,'FIRST_SPEECH_NOT_BEFORE_DONE');turn.languageCheck=true;}
   if(spec.name==='comparison'){
    ensure(turn.routes[0].tier==='advanced','COMPARISON_NOT_ADVANCED');const transitionIndex=turn.events.findIndex(e=>e.event==='transition'),deltaIndex=turn.events.findIndex(e=>e.event==='delta');
    // A fast final may suppress the waiting acknowledgement. Every emitted
    // acknowledgement must precede final text; provider failure is never faked.
    ensure(transitionIndex<0||deltaIndex>transitionIndex,'TRANSITION_AFTER_FINAL_DELTA');turn.transitionObserved=transitionIndex>=0;turn.transitionBeforeDelta=transitionIndex>=0?true:null;
   }
   if(spec.name==='news'){
    ensure(turn.toolNames.includes('jarvis_news'),'NEWS_TOOL_NOT_OBSERVED');ensure(turn.toolNames.every(name=>name==='jarvis_news'),'UNEXPECTED_TOOL_DURING_NEWS');
    const proof=syntheticNewsProvenance(id,title),verified=proof.items.map(item=>({...item,url:safeUrl(item.url)})).filter(item=>item.url),allowed=new Set(verified.map(item=>item.url));
    ensure(proof.toolResults.some(t=>!t.failed),'NEWS_TOOL_DID_NOT_COMPLETE');ensure(verified.length>0&&turn.sourceURLs.length>0,'NEWS_HAS_NO_VERIFIABLE_SOURCE');ensure(turn.sourceURLs.every(url=>allowed.has(url)),'FINAL_URL_NOT_RETURNED_BY_NEWS_TOOL');turn.sourceProvenance=verified;turn.finalSourcesVerified=true;
   }
   turn.status='passed';
  }catch(error){turn.status='failed';turn.error=localError(error);if(id)await api('/api/runtime/family/conversations/'+id+'/abort',{}).catch(()=>{});}
 }
 ensure(turns.length===5&&turns.every(t=>t.status==='passed'),'ONE_OR_MORE_SYNTHETIC_TURNS_FAILED');
}catch(error){failure=localError(error);process.exitCode=1;}
finally{
 for(const id of created){try{await api('/api/runtime/family/memory/conversations/'+id,undefined,'DELETE');removed++;}catch(error){cleanupErrors.push(localError(error));}}
 if(cookie){try{storeOperation("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{s.deleteLogin("+JSON.stringify(cookie)+");if(s.validateLogin("+JSON.stringify(cookie)+"))throw Error('LOGIN_REVOCATION_FAILED');}finally{s.close();}");revoked=true;}catch{cleanupErrors.push('LOGIN_REVOCATION_FAILED');}cookie='';}
 if(cleanupErrors.length){failure??='SYNTHETIC_CLEANUP_FAILED';process.exitCode=1;}
 const report={startedAt,completedAt:new Date().toISOString(),status:failure?'failed':'passed',build,expectedBuild,turns,modelRequests,maximumModelRequests:5,perTurnTimeoutMs:150000,syntheticConversationsCreated:created.length,syntheticConversationsRemoved:removed,maintenanceLoginRevoked:revoked,cleanupErrors,configurationWrites:0,voicePreferenceWrites:0,rawAudioStored:false,privateTextStoredInReport:false,failure};
 await mkdir(output,{recursive:true});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build,turns:turns.map(t=>({name:t.name,status:t.status,error:t.error,transitionObserved:t.transitionObserved})),modelRequests,removed,maintenanceLoginRevoked:revoked,cleanupErrors,report:resolve(output,'report.json')}));
}
