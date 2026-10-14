/** Read-only local browser profiling of the independent R27 public candidate. */
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdtemp,cp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=resolve('.jarvis-dev/workspaces/msf-repair-r27/source'),temp=await mkdtemp(join(tmpdir(),'jarvis-r27-owned-profile-')),copy=join(temp,'source');
await cp(source,copy,{recursive:true});await mkdir(join(copy,'doc/evidence'),{recursive:true});
const htmlSHA=sha(await readFile(join(copy,'doc/msf-prototype.html')));
let observedHTML=await readFile(join(copy,'doc/msf-prototype.html'),'utf8');const instrumentation=[
 ['const DEV_READONLY_CANONICAL=','window.__R27_METRICS={canonicalCalls:0,canonicalHits:0,canonicalMisses:0,canonicalEvictions:0,canonicalKeyChars:0,maxCanonicalKeyChars:0,hashCalls:0,hashHits:0,maxHashInputChars:0,transactions:0,unchangedTransactions:0,maxCommittedJSONChars:0,draftJSONChars:0,renderCalls:0,renderMs:0,planGateCalls:0,planGateMs:0,inputCalls:0,inputMs:0};\nconst DEV_READONLY_CANONICAL='],
 ['const key=reader(false);let json=content.get(key);','const key=reader(false);__R27_METRICS.canonicalCalls++;__R27_METRICS.canonicalKeyChars+=key.length;__R27_METRICS.maxCanonicalKeyChars=Math.max(__R27_METRICS.maxCanonicalKeyChars,key.length);let json=content.get(key);if(json===undefined)__R27_METRICS.canonicalMisses++;else __R27_METRICS.canonicalHits++;'],
 ['const old=content.keys().next().value;chars-=key.length', 'NEVER_MATCH'],
 ['const old=content.keys().next().value;chars-=old.length+content.get(old).length;', '__R27_METRICS.canonicalEvictions++;const old=content.keys().next().value;chars-=old.length+content.get(old).length;'],
 ['if(DEV_CONTENT_HASH_CACHE.has(s)){','__R27_METRICS.hashCalls++;__R27_METRICS.maxHashInputChars=Math.max(__R27_METRICS.maxHashInputChars,s.length);if(DEV_CONTENT_HASH_CACHE.has(s)){__R27_METRICS.hashHits++;'],
 ['const currentRaw=raw,currentRawJSON=rawJSON,', '__R27_METRICS.transactions++;__R27_METRICS.maxCommittedJSONChars=Math.max(__R27_METRICS.maxCommittedJSONChars,rawJSON.length);__R27_METRICS.draftJSONChars+=rawJSON.length;const currentRaw=raw,currentRawJSON=rawJSON,'],
 ['if(publishedJSON!==currentRawJSON){', 'if(publishedJSON===currentRawJSON)__R27_METRICS.unchangedTransactions++;if(publishedJSON!==currentRawJSON){']
];for(const [before,after]of instrumentation){if(after==='NEVER_MATCH')continue;if(observedHTML.split(before).length!==2)throw Error('OBSERVATIONAL_COUNTER_ANCHOR_NOT_UNIQUE');observedHTML=observedHTML.replace(before,after);}await writeFile(join(copy,'doc/msf-prototype.html'),observedHTML);const instrumentedHTMLSHA256=sha(observedHTML);
process.env.CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe';
const require=createRequire(join(copy,'probe.cjs')),{launch,url}=require('./doc/tests/browser.cjs'),helpers=require('./doc/tests/design-helpers.cjs');
const browser=await launch();let result={kind:'software-factory-r27-local-clock-cpu-profile',candidateHTMLSHA256:htmlSHA,instrumentedHTMLSHA256,observationalCountersOnly:true,acceptanceEvidence:false,observedAt:new Date().toISOString(),rawBrowserStateExported:false,modelsInvoked:false};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),clockRows=[];
 await page.addInitScript(()=>{window.__R27RealNow=performance.now.bind(performance);});let t=Date.now();await page.goto(url);await page.evaluate(()=>{for(const [name,count,time]of [['render','renderCalls','renderMs'],['devPlanGate','planGateCalls','planGateMs'],['resolveDevInputs','inputCalls','inputMs']]){const original=window[name];window[name]=function(){const start=__R27RealNow();try{return original.apply(this,arguments);}finally{__R27_METRICS[count]++;__R27_METRICS[time]+=__R27RealNow()-start;}};}});result.navigationMs=Date.now()-t;t=Date.now();await helpers.prepareDesign(page);result.prepareDesignMs=Date.now()-t;t=Date.now();await helpers.startAuto(page);result.startAutoMs=Date.now()-t;
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
 const count=Number(process.argv[2]||3);if(!Number.isInteger(count)||count<1||count>130)throw Error('PROFILE_STEP_BOUND');
 for(let step=0;step<count;step++){t=Date.now();await page.clock.runFor(6000);const counters=await page.evaluate(()=>({status:S.dev.autopilot.run?.status,phase:S.dev.autopilot.run?.phase,currentTaskId:S.dev.autopilot.run?.currentTaskId,done:(S.dev.tasks||[]).filter(x=>x.col==='done').length,taskCount:S.dev.tasks.length}));clockRows.push({step,virtualMs:6000,wallMs:Date.now()-t,...counters});console.log(JSON.stringify({type:'profile.clock',...clockRows.at(-1)}));if(['awaiting-transfer','blocked','stopped'].includes(counters.status))break;}
 const {profile}=await cdp.send('Profiler.stop');await cdp.detach();
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map();for(const node of profile.nodes)for(const id of node.children||[])parents.set(id,node.id);
 const samples=new Map();for(const id of profile.samples||[])samples.set(id,(samples.get(id)||0)+1);
 const top=[...samples].sort((a,b)=>b[1]-a[1]).slice(0,35).map(([id,n])=>{const node=nodes.get(id),parent=nodes.get(parents.get(id));return{functionName:node.callFrame.functionName||'(anonymous)',line:node.callFrame.lineNumber+1,samples:n,parentFunctionName:parent?.callFrame.functionName||'(anonymous)',parentLine:(parent?.callFrame.lineNumber??-1)+1};});
 const selfByFunction=new Map(),inclusiveByFunction=new Map();for(const [id,n] of samples){const visited=new Set();let current=id;while(current){const node=nodes.get(current),key=(node.callFrame.functionName||'(anonymous)')+':'+(node.callFrame.lineNumber+1);if(current===id)selfByFunction.set(key,(selfByFunction.get(key)||0)+n);if(!visited.has(key)){inclusiveByFunction.set(key,(inclusiveByFunction.get(key)||0)+n);visited.add(key);}current=parents.get(current);}}
 const group=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,35).map(([functionAndLine,samples])=>({functionAndLine,samples}));
 const metrics=await page.evaluate(()=>Object.fromEntries(Object.entries(__R27_METRICS).map(([k,v])=>[k,typeof v==='number'?Math.round(v*1000)/1000:v])));result={...result,metrics,clockRows,profileDurationMs:(profile.endTime-profile.startTime)/1000,totalSamples:profile.samples?.length||0,topFunctions:top,selfFunctions:group(selfByFunction),inclusiveFunctions:group(inclusiveByFunction)};
}finally{await browser.close();}
await mkdir('artifacts/software-factory/repair-r27',{recursive:true});const p='artifacts/software-factory/repair-r27/prototype-local-cpu-'+Date.now()+'.json';const raw=JSON.stringify(result,null,2)+'\n';await writeFile(p,raw,{flag:'wx'});console.log(JSON.stringify({path:p,sha256:sha(raw),top:result.inclusiveFunctions?.slice(0,16),self:result.selfFunctions?.slice(0,10)}));
