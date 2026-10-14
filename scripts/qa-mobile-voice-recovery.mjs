const expectedClientBuild=process.argv.find(a=>a.startsWith('--client-build='))?.slice(15)||'20261009-voice-capture-r15';
/** Actual RoomVoice UI with synthetic browser audio and isolated local API fixtures.
 * No login cookie, production API, physical microphone, speaker, or model is used.
 * Run: node scripts/qa-mobile-voice-recovery.mjs [--compiled] [--handoff-only]
 */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {extname,resolve,sep} from 'node:path';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const compiled=process.argv.includes('--compiled'),handoffOnly=process.argv.includes('--handoff-only'),output=resolve('artifacts/mobile-voice-recovery/'+(compiled?'compiled-r15':'source-r15')+(handoffOnly?'-handoff':''));
const checks=[],pageErrors=[],unexpectedRequests=[],requests=[],snapshots=[];
let browser,vite,server,origin,currentPage,failure,remoteCalls=0;
await mkdir(output,{recursive:true});

function wav(){const b=Buffer.alloc(3244);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(3200,40);return b;}
function pcmMarkers(body){
 assert.equal(body.subarray(0,4).toString(),'RIFF');assert.equal(body.subarray(8,12).toString(),'WAVE');
 assert.equal(body.readUInt32LE(24),16000);assert.equal(body.readUInt16LE(34),16);assert.equal(body.readUInt32LE(40),body.length-44);
 const counts={firstUser:0,secondUser:0,tts:0,other:0,silence:0},markers=new Map([[Math.round(.08*32767),'firstUser'],[Math.round(.11*32767),'secondUser'],[Math.round(.24*32767),'tts'],[0,'silence']]);
 for(let at=44;at<body.length;at+=2)counts[markers.get(body.readInt16LE(at))||'other']++;
 return counts;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function anonymousDiagnostic(body){
 const fields=['clientBuild','mode','phase','contextState','trackState','muted','trackMuted','capture'],captureFields=['frames','lastFrameAgeMs','rms','peak','noiseFloor','threshold','active','lastOutcome','durationMs'];
 assert(body&&typeof body==='object'&&!Array.isArray(body));assert(Object.keys(body).every(key=>fields.includes(key)),'Diagnostics must not contain text, audio, member identifiers, or private data');
 assert(body.capture&&typeof body.capture==='object'&&!Array.isArray(body.capture)&&Object.keys(body.capture).every(key=>captureFields.includes(key)),'Capture diagnostics must contain only anonymous numerical state');
 assert(body.clientBuild===expectedClientBuild,'Unexpected diagnostic client build');
 assert(['direct','standby','single','paused'].includes(body.mode),'Invalid anonymous mode');
 assert(['idle','preparing','listening','transcribing','thinking','speaking','awaiting-playback','paused','error'].includes(body.phase),'Invalid anonymous phase');
 assert(['running','suspended','interrupted','closed','none'].includes(body.contextState),'Invalid anonymous context state');
 assert(['live','ended','none'].includes(body.trackState),'Invalid anonymous track state');
 assert.equal(typeof body.muted,'boolean');if(body.trackMuted!==undefined)assert.equal(typeof body.trackMuted,'boolean');
 assert.equal(typeof body.capture.active,'boolean');
 assert(Number.isSafeInteger(body.capture.frames)&&body.capture.frames>=0,'Invalid anonymous frame count');
 assert(['pending','speech','silence','interrupted','error','none'].includes(body.capture.lastOutcome),'Invalid anonymous capture outcome');
 for(const field of ['lastFrameAgeMs','durationMs','rms','peak','noiseFloor','threshold']){
  const value=body.capture[field];if(value===undefined)continue;
  assert(typeof value==='number'&&Number.isFinite(value)&&value>=0,'Anonymous metric must be a finite nonnegative number');
  if(['rms','peak','noiseFloor','threshold'].includes(field))assert(value<=1,'Anonymous level must be within 0..1');
 }
 return body;
}

// Only the browser device boundary is replaced. BrowserMicSession,
// BrowserMicCapture, endpointing, RoomAudioPlayer, and RoomVoice run unchanged.
function syntheticDevices(){
 const qa=window.__qaMic={calls:0,failures:0,framesEnabled:true,speechUntil:0,contexts:[],tracks:[],workletModules:[],plays:0,voiceSegments:[],playbackTimeline:[],handoffPlan:[],playbackMs:60,emittedSamples:{firstUser:0,secondUser:0,tts:0},mixedFrames:0,outputMarker:false};
 class Track extends EventTarget{readyState='live';enabled=true;muted=false;stops=0;stop(){if(this.readyState!=='ended'){this.stops++;this.readyState='ended';}}}
 class Node{connect(){return this;}disconnect(){}}
 class Context extends EventTarget{
  state='suspended';destination=new Node();sampleRate=16000;createdAt=performance.now();
  get currentTime(){return (performance.now()-this.createdAt)/1000;}
  audioWorklet={addModule:async url=>{qa.workletModules.push(url);}};
  constructor(){super();qa.contexts.push(this);}
  resume(){this.state='running';this.dispatchEvent(new Event('statechange'));return Promise.resolve();}
  close(){this.state='closed';this.dispatchEvent(new Event('statechange'));return Promise.resolve();}
  createMediaStreamSource(){return new Node();}
  createGain(){const node=new Node();node.gain={value:1};return node;}
  createAnalyser(){const node=new Node();node.fftSize=1024;node.getFloatTimeDomainData=values=>values.fill(0);return node;}
 }
 class Worklet extends Node{
  // The production worklet emits 1,600 samples at 16 kHz every 100ms.
  constructor(context){super();this.port={onmessage:null,close:()=>clearInterval(timer)};const timer=setInterval(()=>{if(qa.framesEnabled&&context.state==='running'&&this.port.onmessage){const data=new Float32Array(1600),endAt=performance.now();let users=0,tts=0;for(let i=0;i<data.length;i++){const at=endAt-100+i/16,user=qa.voiceSegments.find(s=>at>=s.start&&at<s.end);if(user){data[i]=user.amplitude;users++;if(user.key)qa.emittedSamples[user.key]++;}else if(qa.outputMarker&&qa.playbackTimeline.some(p=>at>=p.start&&(p.end===null||at<p.end))){data[i]=.24;tts++;qa.emittedSamples.tts++;}}if(users&&tts)qa.mixedFrames++;this.port.onmessage({data:{samples:data.buffer,endTime:(endAt-context.createdAt)/1000}});}},100);}
 }
 Object.defineProperty(window,'AudioContext',{configurable:true,value:Context});
 Object.defineProperty(window,'AudioWorkletNode',{configurable:true,value:Worklet});
 Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{qa.calls++;if(qa.failures>0){qa.failures--;throw new DOMException('Fixture microphone permission denied','NotAllowedError');}const track=new Track();qa.tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]};}});
 qa.speak=(duration=1200,amplitude=.08,key)=>{const start=performance.now();qa.speechUntil=start+duration;qa.voiceSegments.push({start,end:start+duration,amplitude,key});};
 qa.armHandoff=()=>{qa.handoffPlan=[{duration:250,amplitude:.08,key:'firstUser'},{duration:250,amplitude:.11,key:'secondUser'}];qa.outputMarker=true;qa.playbackMs=320;};
 qa.suspend=()=>{const context=qa.contexts.findLast(c=>c.state==='running');if(!context)throw Error('No running fixture context');context.state='suspended';context.dispatchEvent(new Event('statechange'));};
 qa.endTrack=()=>{const track=qa.tracks.findLast(t=>t.readyState==='live');if(!track)throw Error('No live fixture track');track.readyState='ended';track.dispatchEvent(new Event('ended'));};
 qa.snapshot=()=>({calls:qa.calls,contexts:qa.contexts.map(c=>c.state),tracks:qa.tracks.map(t=>({state:t.readyState,stops:t.stops})),workletModules:qa.workletModules,plays:qa.plays,voiceSegments:qa.voiceSegments,playbackTimeline:qa.playbackTimeline,emittedSamples:qa.emittedSamples,mixedFrames:qa.mixedFrames});
 const blobs=new Map(),createObjectURL=URL.createObjectURL.bind(URL),revokeObjectURL=URL.revokeObjectURL.bind(URL);
 URL.createObjectURL=blob=>{const url=createObjectURL(blob);blobs.set(url,blob.size);return url;};URL.revokeObjectURL=url=>{blobs.delete(url);revokeObjectURL(url);};
 const playback=new WeakMap();
 Object.defineProperty(HTMLMediaElement.prototype,'paused',{configurable:true,get(){return playback.get(this)?.paused??true;}});
 Object.defineProperty(HTMLMediaElement.prototype,'ended',{configurable:true,get(){return playback.get(this)?.ended??false;}});
 HTMLMediaElement.prototype.load=function(){};
 HTMLMediaElement.prototype.pause=function(){const previous=playback.get(this)||{generation:0};playback.set(this,{...previous,generation:previous.generation+1,paused:true});};
 HTMLMediaElement.prototype.play=function(){qa.plays++;const generation=(playback.get(this)?.generation||0)+1,isTts=blobs.get(this.src)===3244,timeline=isTts?{start:performance.now(),end:null}:null;if(timeline)qa.playbackTimeline.push(timeline);playback.set(this,{generation,paused:false,ended:false});setTimeout(()=>{if(playback.get(this)?.generation!==generation)return;this.dispatchEvent(new Event('playing'));},0);setTimeout(()=>{if(playback.get(this)?.generation!==generation)return;if(timeline)timeline.end=performance.now();playback.set(this,{generation,paused:true,ended:true});this.dispatchEvent(new Event('ended'));if(isTts&&qa.handoffPlan.length){const next=qa.handoffPlan.shift();qa.speak(next.duration,next.amplitude,next.key);}},isTts?qa.playbackMs:60);return Promise.resolve();};
 if(window.speechSynthesis)window.speechSynthesis.speak=()=>{throw Error('Browser speech synthesis is forbidden in this QA');};
 window.SpeechRecognition=window.webkitSpeechRecognition=function(){throw Error('Browser speech recognition is forbidden in this QA');};
}

async function fixtureContext(name,options={}){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 let speechJobs=0,audioJobs=0;
 await context.addInitScript(syntheticDevices);
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(['http:','https:'].includes(url.protocol)&&url.origin!==origin){remoteCalls++;return route.abort();}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const path=url.pathname,method=request.method(),entry={scenario:name,path,method};
  if(path.endsWith('/audio')&&method==='POST'){
   const body=request.postDataBuffer();entry.bytes=body?.length||0;entry.wakeCheck=request.headers()['x-jarvis-wake-check']||null;entry.wav=body?.subarray(0,4).toString()==='RIFF';if(options.handoff)entry.pcm=pcmMarkers(body);
  }
  requests.push(entry);
  const json=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
  if(path==='/api/runtime/identity/state')return json({authenticated:true,profile:{id:'qa-member',name:'隔离验收',wakeWord:'贾维斯'}});
  if(path==='/api/runtime/voice/state'){if(options.handoff){entry.delayMs=1000;await wait(entry.delayMs);}return json({guard:{remainingSeconds:3600,quietHoursActive:false}});}
  if(path==='/api/runtime/voice/catalog')return json({selectedVoiceId:'profile-default',items:[{id:'profile-default',name:'合成验收声音',gender:'male',language:'zh',latency:'fast',note:'本地测试替身',available:true}],nativeVoices:0,cloning:{available:false,note:'隔离验收'}});
  if(path==='/api/runtime/notifications/preferences')return json({profileId:'qa-member',revision:1,values:{enabled:false,categories:{},channels:{inApp:false,browser:false,roomVoice:false}},capabilities:{}});
  if(path==='/api/runtime/family/conversations'&&method==='POST')return json({id:'qa-conversation'});
  if(path==='/api/runtime/voice/sessions'&&method==='POST')return json({id:'qa-session'});
  if(path==='/api/runtime/voice/sessions/qa-session/diagnostics'&&method==='POST'){entry.diagnostic=anonymousDiagnostic(request.postDataJSON());const receivedAt=new Date();return json({accepted:true,receivedAt:receivedAt.toISOString(),expiresAt:new Date(receivedAt.getTime()+3600000).toISOString()});}
  if(path==='/api/runtime/voice/sessions/qa-session/speech')return json({id:'qa-speech-'+(++speechJobs),status:'complete',result:{audioUrl:'/api/runtime/voice/jobs/qa-speech-'+speechJobs+'/audio'}});
  if(path.startsWith('/api/runtime/voice/jobs/qa-speech-')&&path.endsWith('/audio'))return route.fulfill({contentType:'audio/wav',body:wav()});
  if(path==='/api/runtime/voice/sessions/qa-session/audio')return json({id:'qa-asr-'+(++audioJobs),status:'complete',result:{text:'这是合成测试语句',wakeDetected:false}});
  if(path==='/api/runtime/voice/sessions/qa-session/companion')return json({handled:true,detached:true,speech:'已收到合成测试语句。'});
  if(path.endsWith('/playback')){entry.playbackState=request.postDataJSON()?.state;if(options.handoff&&entry.playbackState==='ended'){entry.delayMs=1000;await wait(entry.delayMs);}return json({ok:true});}
  if(path.endsWith('/interrupt')||path.endsWith('/abort')||path==='/api/runtime/family/companion/cancel'||path.endsWith('/cancel')||(path==='/api/runtime/voice/sessions/qa-session'&&method==='DELETE'))return json({ok:true});
  unexpectedRequests.push(entry);return route.fulfill({status:501,contentType:'application/json',body:JSON.stringify({error:{message:'Unexpected isolated QA request'}})});
 });
 const page=await context.newPage();currentPage=page;page.on('pageerror',e=>pageErrors.push({scenario:name,message:e.message}));page.setDefaultTimeout(15000);
 await page.goto(origin+'/?mode=room',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'开始交流',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('.room-controls button')?.disabled);
 await page.getByLabel('等待时偶尔开个玩笑',{exact:true}).uncheck();
 return {context,page};
}
async function check(name,task){if(handoffOnly&&!name.startsWith('250ms '))return;await task();checks.push(name);console.log('PASS '+name);}
const phase=page=>page.locator('.room-core h1');
async function start(page){await page.getByRole('button',{name:'开始交流',exact:true}).click();await page.getByRole('button',{name:'结束交流',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.room-core h1')?.textContent==='交流中，请直接说话');}
const standbyButton=page=>page.getByRole('button',{name:/唤醒待命/,includeHidden:true});
async function stopped(page){await page.waitForFunction(()=>window.__qaMic.contexts.every(c=>c.state==='closed')&&window.__qaMic.tracks.every(t=>t.readyState==='ended'));assert.equal(await standbyButton(page).getAttribute('aria-pressed'),'false');assert.equal(await page.getByRole('button',{name:'结束交流',exact:true}).count(),0);}
async function waitForAudio(name,count){for(let attempt=0;attempt<200;attempt++){const posted=requests.filter(r=>r.scenario===name&&r.path.endsWith('/audio')&&r.method==='POST');if(posted.length>=count)return posted;await wait(100);}throw Error('Expected '+count+' complete synthetic audio uploads in '+name);}
async function recordingDiagnostic(name,mode='direct'){for(let attempt=0;attempt<100;attempt++){const entry=requests.find(r=>r.scenario===name&&r.diagnostic?.mode===mode&&r.diagnostic.phase==='listening'&&r.diagnostic.capture.active);if(entry){assert.equal(entry.diagnostic.clientBuild,expectedClientBuild);assert.equal(entry.diagnostic.contextState,'running');assert.equal(entry.diagnostic.trackState,'live');return entry.diagnostic;}await wait(100);}throw Error('Expected '+mode+' diagnostics from an actual active recording in '+name);}
async function quietAfterStop(page,name){const calls=await page.evaluate(()=>window.__qaMic.calls),before=requests.filter(r=>r.scenario===name&&r.path.endsWith('/audio')&&r.method==='POST').length;await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>window.__qaMic.calls),calls);assert.equal(requests.filter(r=>r.scenario===name&&r.path.endsWith('/audio')&&r.method==='POST').length,before);}
async function saveSnapshot(page,name){const state=await page.evaluate(()=>window.__qaMic.snapshot());snapshots.push({scenario:name,...state});await page.screenshot({path:resolve(output,name+'.png')});}

try{
 if(compiled){
  const base=resolve('apps/web/dist');
  server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(base,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(base+sep))throw Error('Outside local frontend assets');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end('Local QA asset not found');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 }else{
  const {createServer:createVite}=await import('vite');
  vite=await createVite({configFile:resolve('apps/web/vite.config.ts'),root:resolve('apps/web'),server:{host:'127.0.0.1',port:0,strictPort:false,watch:{ignored:['**/.dist-staging/**','**/dist/**']}}});await vite.listen();origin='http://127.0.0.1:'+vite.httpServer.address().port;
 }
 browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 await check('mobile start recovers after getUserMedia permission rejection without retaining a context',async()=>{
  const {context,page}=await fixtureContext('permission-recovery');
  try{await page.evaluate(()=>window.__qaMic.failures=1);await page.getByRole('button',{name:'开始交流',exact:true}).click();await page.getByRole('alert').filter({hasText:'麦克风权限未开启'}).waitFor();await stopped(page);assert.equal(await page.evaluate(()=>window.__qaMic.calls),1);await start(page);assert.equal(await page.evaluate(()=>window.__qaMic.calls),2);await saveSnapshot(page,'permission-recovery');await page.getByRole('button',{name:'结束交流',exact:true}).click();await stopped(page);}finally{await context.close();}
 });
 await check('250ms replies immediately after greeting and reply ended survive delayed guard and receipts without TTS or duplicate audio',async()=>{
  const name='immediate-short-handoff',{context,page}=await fixtureContext(name,{handoff:true});
  try{
   assert.equal(await page.locator('.room-controls').getByRole('button',{name:/唤醒待命/}).count(),0);
   await page.evaluate(()=>window.__qaMic.armHandoff());
   await page.getByRole('button',{name:'开始交流',exact:true}).click();
   const posted=await waitForAudio(name,2);
   assert.equal(posted.length,2);
   await page.waitForFunction(()=>window.__qaMic.playbackTimeline.length===3&&window.__qaMic.playbackTimeline.every(p=>p.end!==null));
   await page.waitForFunction(()=>document.querySelector('.room-core h1')?.textContent==='交流中，请直接说话');
   const state=await page.evaluate(()=>window.__qaMic.snapshot());
   assert.equal(state.voiceSegments.length,2);
   assert(state.emittedSamples.tts>1000);assert(state.mixedFrames>=1);
   for(let round=0;round<2;round++){
    const segment=state.voiceSegments[round],playback=state.playbackTimeline[round],body=posted[round];
    assert.equal(segment.end-segment.start,250);assert(segment.start>=playback.end);assert(segment.start-playback.end<20);
    assert.equal(body.wakeCheck,null);assert.equal(body.wav,true);assert.equal(body.pcm.tts,0);assert.equal(body.pcm.other,0);
    const key=round===0?'firstUser':'secondUser',other=round===0?'secondUser':'firstUser';
    assert.equal(body.pcm[key],state.emittedSamples[key]);assert(body.pcm[key]>=3000);assert.equal(body.pcm[other],0);
   }
   const guardRequests=requests.filter(r=>r.scenario===name&&r.path==='/api/runtime/voice/state'),endedReceipts=requests.filter(r=>r.scenario===name&&r.playbackState==='ended');
   assert(guardRequests.length>=3,'Initial start and both reply turns must exercise the delayed guard');assert(guardRequests.every(r=>r.delayMs===1000));
   assert.equal(endedReceipts.length,3);assert.equal(new Set(endedReceipts.map(r=>r.path)).size,3);assert(endedReceipts.every(r=>r.delayMs===1000));
   const diagnostic=await recordingDiagnostic(name);assert.equal(requests.filter(r=>r.scenario===name&&r.diagnostic?.mode==='standby').length,0);
   await page.waitForTimeout(1500);assert.equal(requests.filter(r=>r.scenario===name&&r.path.endsWith('/audio')&&r.method==='POST').length,2);
   snapshots.push({scenario:name,endedToVoiceMs:state.voiceSegments.map((s,i)=>s.start-state.playbackTimeline[i].end),emittedSamples:state.emittedSamples,mixedFrames:state.mixedFrames,uploadedPcm:posted.map(r=>r.pcm),guardDelayMs:1000,endedReceiptDelayMs:1000,recordingDiagnostic:diagnostic});
   await saveSnapshot(page,name);await page.getByRole('button',{name:'结束交流',exact:true}).click();await stopped(page);
  }catch(error){snapshots.push({scenario:name,failureState:await page.evaluate(()=>window.__qaMic.snapshot()).catch(()=>null)});await page.screenshot({path:resolve(output,name+'-failure.png')}).catch(()=>{});throw error;}finally{await context.close();}
 });
 await check('explicit mobile conversation still sends an ordinary WAV ASR request after 46 real seconds',async()=>{
  const {context,page}=await fixtureContext('continuous-46s');
  try{await start(page);const started=Date.now(),initialSpeechRequests=requests.filter(r=>r.scenario==='continuous-46s'&&r.path.endsWith('/speech')).length;await page.waitForTimeout(46000);assert.equal(requests.filter(r=>r.scenario==='continuous-46s'&&r.path.endsWith('/speech')).length,initialSpeechRequests);assert.equal(requests.filter(r=>r.scenario==='continuous-46s'&&r.path.endsWith('/audio')&&r.method==='POST').length,0);await page.evaluate(()=>window.__qaMic.speak());await page.waitForFunction(()=>document.querySelector('.room-messages article p')?.textContent==='这是合成测试语句');const posted=requests.filter(r=>r.scenario==='continuous-46s'&&r.path.endsWith('/audio')&&r.method==='POST');assert.equal(posted.length,1);assert.equal(posted[0].wakeCheck,null);assert.equal(posted[0].wav,true);assert(posted[0].bytes>1000);snapshots.push({scenario:'continuous-46s',elapsedMs:Date.now()-started,idleSpeechRequests:0,postBytes:posted[0].bytes,wakeCheck:posted[0].wakeCheck});await page.waitForFunction(()=>document.querySelector('.room-core h1')?.textContent==='交流中，请直接说话');await saveSnapshot(page,'continuous-46s');await page.getByRole('button',{name:'结束交流',exact:true}).click();await stopped(page);await quietAfterStop(page,'continuous-46s');}finally{await context.close();}
 });
 await check('explicit wake standby retains its header and the primary Start button switches it into direct conversation',async()=>{
  const {context,page}=await fixtureContext('handsfree-standby');
  try{
   const button=standbyButton(page);await page.locator('details').filter({has:button}).locator('summary').click();await button.click();
   await page.waitForFunction(()=>document.querySelector('.room-core h1')?.textContent==='等待唤醒词');await page.evaluate(()=>window.__qaMic.speak());
   const posted=await waitForAudio('handsfree-standby',1);assert.equal(posted.length,1);assert.equal(posted[0].wakeCheck,'true');assert.equal(posted[0].wav,true);
   assert.equal(requests.filter(r=>r.scenario==='handsfree-standby'&&r.path.endsWith('/companion')).length,0);assert.equal(await page.getByRole('button',{name:'结束交流',exact:true}).count(),0);
   await saveSnapshot(page,'handsfree-standby');
   await start(page);await recordingDiagnostic('handsfree-standby');await page.evaluate(()=>window.__qaMic.speak(250));
   const switched=await waitForAudio('handsfree-standby',2);assert.equal(switched.length,2);assert.equal(switched[1].wakeCheck,null);assert.equal(switched[1].wav,true);
   await page.waitForFunction(()=>document.querySelector('.room-core h1')?.textContent==='交流中，请直接说话');await saveSnapshot(page,'standby-to-direct');
   await page.getByRole('button',{name:'结束交流',exact:true}).click();await stopped(page);
  }finally{await context.close();}
 });
 await check('mobile context suspension and ended microphone track pause and recover through Start',async()=>{
  const {context,page}=await fixtureContext('device-interruption');
  try{await start(page);for(const fault of ['suspend','endTrack']){await page.evaluate(fault=>window.__qaMic[fault](),fault);await page.waitForFunction(()=>document.querySelector('.room-core h1')?.textContent==='收音已暂停，请重新开始');await stopped(page);await quietAfterStop(page,'device-interruption');await saveSnapshot(page,'device-'+fault);await start(page);}assert.equal(await page.evaluate(()=>window.__qaMic.calls),3);await page.getByRole('button',{name:'结束交流',exact:true}).click();await stopped(page);}finally{await context.close();}
 });
 await check('live context with missing worklet frames stops the loop, releases resources, and can restart',async()=>{
  const {context,page}=await fixtureContext('missing-frames');
  try{await start(page);await page.evaluate(()=>window.__qaMic.framesEnabled=false);await page.getByRole('alert').filter({hasText:'收音已暂停'}).waitFor({timeout:7000});await stopped(page);await quietAfterStop(page,'missing-frames');await saveSnapshot(page,'missing-frames');await page.evaluate(()=>window.__qaMic.framesEnabled=true);await start(page);assert.equal(await page.evaluate(()=>window.__qaMic.calls),2);await page.getByRole('button',{name:'结束交流',exact:true}).click();await stopped(page);}finally{await context.close();}
 });
 await check('mobile visibilitychange to hidden releases the microphone and exits automatic listening',async()=>{
  const {context,page}=await fixtureContext('page-hidden');
  try{await start(page);await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>document.querySelector('.room-core h1')?.textContent==='已暂停，点击开始说话');await stopped(page);await quietAfterStop(page,'page-hidden');assert(requests.some(r=>r.scenario==='page-hidden'&&r.path==='/api/runtime/voice/sessions/qa-session'&&r.method==='DELETE'));await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});await quietAfterStop(page,'page-hidden');await saveSnapshot(page,'page-hidden');}finally{await context.close();}
 });
 assert.deepEqual(pageErrors,[]);assert.deepEqual(unexpectedRequests,[]);assert.equal(remoteCalls,0);
}catch(error){failure=error.stack||String(error);console.error(failure);process.exitCode=1;if(currentPage&&!currentPage.isClosed())await currentPage.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});}
finally{
 await browser?.close();await vite?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 const report={at:new Date().toISOString(),status:failure?'failed':'passed',requiredClientBuild:expectedClientBuild,selection:handoffOnly?'handoff-only':'all',compiled,viewport:{width:390,height:844,isMobile:true,hasTouch:true},checks,pageErrors,unexpectedRequests,remoteCalls,requests,snapshots,syntheticVisibilityEvent:true,physicalMicrophones:0,physicalSpeakers:0,productionWrites:false,failure};
 await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:checks.length,output,physicalMicrophones:0,physicalSpeakers:0,productionWrites:false}));
}
