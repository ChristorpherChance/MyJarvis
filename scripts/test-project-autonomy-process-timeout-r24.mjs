/** Infrastructure fixtures only. --linux-proof requires an isolated UID0
 * container with exactly SETUID/SETGID capabilities and trusted executable Node.
 * Never point this proof at a project, host service or model endpoint. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import vm from 'node:vm';
const source=await readFile(new URL('./project-autonomy-fa01-collector.mjs',import.meta.url),'utf8');
const helperSource=source.slice(source.indexOf('export const scopedSupervisorSource'),source.indexOf('\nexport function spawnScopedCommand'));
const scopedSupervisorSource=vm.runInNewContext(helperSource.replace(/^export /,'')+'\nscopedSupervisorSource;');
const body=source.slice(source.indexOf('export function spawnScopedCommand'),source.indexOf('\nasync function stop()'));
function fixture(){
 const child=new EventEmitter(),calls=[],timers=[];
 Object.assign(child,{pid:321,connected:true,send(value,callback){calls.push(['send',value]);callback?.();},disconnect(){calls.push(['disconnect']);this.connected=false;this.emit('disconnect');},unref(){calls.push(['unref']);}});
 const fn=vm.runInNewContext('('+body.replace(/^export /,'')+')',{spawn:(...args)=>{calls.push(['spawn',...args]);return child;},process:{execPath:'/trusted/node'},scopedSupervisorSource,
  need:(value,code)=>{if(!value)throw Error(code);},setTimeout:(fn,ms)=>{timers.push({fn,ms});return 1;},clearTimeout:()=>{}});
 return {run:fn('/fixed/program',['--bounded'],{cwd:'/fixed/source',env:{HOME:'/work/home'}}),child,calls,timers,fn};
}
const ready={type:'supervisor-ready',pid:321,pgid:321,sid:321,uid:1000,gid:1000,startTime:'9876'};
const packet={type:'command-exit',exitCode:0,signal:null};
function supervisorFixture(){
 const p=new EventEmitter(),command=new EventEmitter(),calls=[];
 const fields=['S','11','321','321',...Array(15).fill('0'),'9876'];
 Object.assign(p,{pid:321,argv:['/trusted/node',JSON.stringify({program:'/fixed/program',args:['--bounded'],nodePath:'/approved/image-modules'})],env:{HOME:'/work/home',NODE_CHANNEL_FD:'3',NODE_CHANNEL_SERIALIZATION_MODE:'json'},connected:true,getuid:()=>1000,getgid:()=>1000,cwd:()=>'/fixed/source',send:(value,cb)=>{calls.push(['message',value]);cb?.();},kill:(...args)=>{calls.push(['kill',...args]);},exit:code=>{calls.push(['exit',code]);}});
 vm.runInNewContext(scopedSupervisorSource,{process:p,require:name=>name==='node:fs'?{readFileSync:()=>`321 (node) ${fields.join(' ')}`}:{spawn:(...args)=>{calls.push(['command',...args]);return command;}}});
 return {p,command,calls};
}
if(!process.argv.includes('--linux-proof')){
 test('real command exit is preserved only with ready identity and confirmed supervisor self-group termination',async()=>{const f=fixture();f.child.emit('message',ready);f.child.emit('message',packet);f.child.emit('close',null,'SIGKILL');const r=await f.run.completion;assert.equal(r.exitCode,0);assert.equal(r.stopFailure,false);assert.equal(f.calls[0][3].uid,1000);assert.equal(f.calls[0][3].gid,1000);assert.deepEqual([...f.calls[0][3].stdio],['ignore','ignore','ignore','ipc']);});
 test('nonzero real exit is preserved and never normalized to success',async()=>{const f=fixture();f.child.emit('message',ready);f.child.emit('message',{...packet,exitCode:7});f.child.emit('close',null,'SIGKILL');assert.equal((await f.run.completion).exitCode,7);});
 for(const [name,prepare] of [['premature helper exit',f=>f.child.emit('close',0,null)],['IPC closes without command result',f=>f.child.emit('disconnect')],['wrong live group identity',f=>f.child.emit('message',{...ready,pgid:999})]])test(name+' is an explicit failure',async()=>{const f=fixture();prepare(f);assert.equal((await f.run.completion).stopFailure,true);});
 test('unresponsive stopped helper fails after fixed 5s grace without waiting forever or numeric PID signals',async()=>{const f=fixture();f.child.emit('message',ready);const pending=f.run.requestStop();assert.equal(f.timers[0].ms,5000);assert.deepEqual(JSON.parse(JSON.stringify(f.calls.find(v=>v[0]==='send')[1])),{type:'stop'});f.timers[0].fn();assert.equal((await pending).stopFailure,true);assert.ok(f.calls.some(v=>v[0]==='unref'));assert.ok(f.calls.some(v=>v[0]==='disconnect'));});
 test('stop and close race with a completed command remains idempotent',async()=>{const f=fixture();f.child.emit('message',ready);f.child.emit('message',packet);const pending=f.run.requestStop();f.child.emit('close',null,'SIGKILL');const r=await pending;assert.equal(r.exitCode,0);assert.equal(r.stopFailure,false);await f.run.requestStop();assert.equal(f.calls.filter(v=>v[0]==='send').length,1);});
 test('candidate preload environment is rejected before any spawn',()=>{const f=fixture();assert.throws(()=>f.fn('/fixed/program',[],{env:{NODE_OPTIONS:'--import=/candidate/evil.mjs'}}),/ENV_UNTRUSTED/);assert.equal(f.calls.filter(v=>v[0]==='spawn').length,1);});
 test('supervisor executes original command without IPC/extra FD and restores approved image module path only for command',()=>{const f=supervisorFixture();const call=f.calls.find(v=>v[0]==='command');assert.equal(call[1],'/fixed/program');assert.deepEqual([...call[2]],['--bounded']);assert.deepEqual([...call[3].stdio],['ignore',1,2]);assert.equal(call[3].env.NODE_CHANNEL_FD,undefined);assert.equal(call[3].env.NODE_CHANNEL_SERIALIZATION_MODE,undefined);assert.equal(call[3].env.NODE_PATH,'/approved/image-modules');assert.equal(call[3].uid,1000);assert.equal(call[3].gid,1000);assert.equal(call[3].detached,false);});
 test('fixed stop never accepts a target PID and signals only supervisor own group',()=>{const f=supervisorFixture();f.p.emit('message',{type:'stop',pid:999});assert.equal(f.calls.find(v=>v[0]==='message'&&v[1].type==='supervisor-error')[1].code,'CONTROL_MESSAGE_INVALID');assert.deepEqual(f.calls.find(v=>v[0]==='kill'),['kill',-321,'SIGKILL']);});
 test('actual command exit sends original nonzero state then signals own group',()=>{const f=supervisorFixture();f.command.emit('exit',9,null);assert.equal(f.calls.find(v=>v[0]==='message'&&v[1].type==='command-exit')[1].exitCode,9);assert.deepEqual(f.calls.find(v=>v[0]==='kill'),['kill',-321,'SIGKILL']);});
 test('embedded bounded proof driver parses as actual Python before any remote execution',async()=>{const text=await readFile(new URL('./prove-factory-process-timeout-r24.mjs',import.meta.url),'utf8');const start=text.indexOf('String.raw`')+'String.raw`'.length,end=text.indexOf('`),true,{timeoutMs:',start);assert.ok(start>10&&end>start);const r=spawnSync('python',['-c','import ast,sys;ast.parse(sys.stdin.read())'],{input:text.slice(start,end),encoding:'utf8'});assert.equal(r.status,0,r.stderr);});
}else{
 assert.equal(process.platform,'linux');assert.equal(process.getuid(),0);
 const status=await readFile('/proc/self/status','utf8'),caps=BigInt('0x'+status.match(/^CapEff:\s*([a-f0-9]+)$/m)[1]);
 assert.equal(caps,0xc0n,'proof requires exactly SETUID/SETGID; CAP_KILL and DAC absent');
 assert.equal(process.env.NODE_OPTIONS??'','');
 const {spawnScopedCommand,processCheck}=await import('./project-autonomy-fa01-collector.mjs');
 const checks=[];const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function bounded(promise){return Promise.race([promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('PROOF_UNBOUNDED')),6500);timer.unref();})]);}
 const cleanEnv={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',NODE_OPTIONS:'',NODE_PATH:''};
 let command=spawnScopedCommand(process.execPath,['-e',"if(process.getuid()!==1000||process.getgid()!==1000||process.send||process.env.NODE_CHANNEL_FD||process.env.NODE_CHANNEL_SERIALIZATION_MODE)process.exit(9);process.exit(0)"],{cwd:'/tmp',env:cleanEnv});
 let result=await bounded(command.completion);assert.equal(result.exitCode,0);assert.equal(result.stopFailure,false);checks.push('uid1000-original-command-no-ipc-exit0');
 command=spawnScopedCommand(process.execPath,['-e','process.exit(7)'],{cwd:'/tmp',env:cleanEnv});result=await bounded(command.completion);assert.equal(result.exitCode,7);assert.equal(result.stopFailure,false);checks.push('actual-nonzero-exit7-preserved');
 command=spawnScopedCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:'/tmp',env:cleanEnv});await delay(100);
 assert.throws(()=>process.kill(-command.child.pid,'SIGKILL'),error=>error.code==='EPERM');checks.push('uid0-capdrop-numeric-group-kill-denied');
 const at=Date.now();result=await bounded(command.requestStop());assert.equal(result.stopFailure,false);assert.equal(result.stopped,true);assert.equal(result.signal,'SIGKILL');assert.ok(Date.now()-at<5000);checks.push('bound-ipc-sameuid-self-group-stop-confirmed');
 await assert.rejects(bounded(processCheck('sigstop-proof',process.execPath,['-e',"process.kill(process.ppid,'SIGSTOP');setInterval(()=>{},1000)"],{cwd:'/tmp',childEnv:cleanEnv,timeoutMs:300})),/COLLECTOR_PROCESS_STOP_UNCONFIRMED/);
 const fatalReport=JSON.parse(await readFile('/evidence/collector---linux-proof.json','utf8'));
 assert.equal(fatalReport.checks.length,1);assert.equal(fatalReport.checks[0].status,'fail');assert.equal(fatalReport.checks[0].timedOut,true);
 checks.push('sigstop-supervisor-five-second-failed-row-and-fatal');
 // This intentionally stopped fixture is left ONLY inside this named proof
 // container. The external owner must remove the whole scoped container.
 console.log(JSON.stringify({schemaVersion:1,kind:'project-autonomy-timeout-linux-proof',simulated:false,uid:0,capEff:'00000000000000c0',checks,passed:true,
  productExecuted:false,modelInvoked:false,externalScopedContainerCleanupRequired:true,detachedEscapeCoverage:false}));
}
