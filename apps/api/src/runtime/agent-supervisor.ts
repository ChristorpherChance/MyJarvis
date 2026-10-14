import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';

/** This process survives a node-agent crash long enough to stop the controlled child tree. */
const parentPid=process.ppid;
let input='',started=false,child:ReturnType<typeof spawn>|undefined,stopping=false;
async function stop(){if(stopping)return;stopping=true;const pid=child?.pid;if(pid){if(process.platform==='win32')await new Promise<void>(res=>{const kill=spawn('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false});kill.once('error',()=>{child?.kill();res()});kill.once('close',()=>res())});else{try{process.kill(-pid,'SIGTERM')}catch{child?.kill('SIGTERM')}await new Promise(r=>setTimeout(r,500));try{process.kill(-pid,'SIGKILL')}catch{}}}process.exit(143)}
process.once('SIGTERM',()=>{void stop()});process.once('SIGINT',()=>{void stop()});
const parentWatch=setInterval(()=>{try{process.kill(parentPid,0)}catch{void stop()}},1000);parentWatch.unref();
process.stdin.setEncoding('utf8');process.stdin.on('data',(value:string)=>{input+=value;if(input.length>2*1024*1024){process.exit(64)} });
process.stdin.once('end',()=>{try{const p=JSON.parse(input);if(started||!isAbsolute(p.program)||!Array.isArray(p.args)||p.args.some((x:any)=>typeof x!=='string')||!isAbsolute(p.workspace))throw Error();started=true;child=spawn(p.program,p.args,{cwd:p.workspace,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env:process.env});child.stdout?.pipe(process.stdout);child.stderr?.pipe(process.stderr);child.once('error',()=>process.exit(127));child.once('close',code=>{clearInterval(parentWatch);process.exit(code===null?1:Math.max(0,Math.min(255,code)))})}catch{process.exit(64)}});
