/** 112 user development: fixed loopback ports, passwd home and isolated data. */
import {spawn} from 'node:child_process';
import {chmodSync,existsSync,lstatSync,mkdirSync,readFileSync,realpathSync} from 'node:fs';
import {userInfo} from 'node:os';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const apiPort=43140,webPort=45173,host='127.0.0.1';
const apiTarget=`http://${host}:${apiPort}`;
function requireThat(condition,message){if(!condition)throw new Error(message)}
function within(parent,target){const part=relative(parent,target);return part===''||(!isAbsolute(part)&&part!=='..'&&!part.startsWith('..'+sep))}

function configuration(){
  requireThat(process.platform==='linux','This development entry requires Linux.');
  // On Linux os.userInfo() uses the passwd record, independently of $HOME.
  const account=userInfo();
  requireThat(account.uid>0&&process.getuid?.()===account.uid,'Run as the ordinary development user, without sudo.');
  const home=realpathSync(account.homedir);
  requireThat(isAbsolute(home)&&home!=='/','The passwd home must be a real user directory.');
  const dataDir=join(home,'.local','share','jarvis-dev-112');
  for(const production of ['/opt/jarvis','/var/lib/jarvis','/etc/jarvis','/run/jarvis']){
    requireThat(!within(production,root)&&!within(production,dataDir),'Development must not use production paths.');
  }
  requireThat(dataDir!==join(root,'.jarvis')&&dataDir!==join(root,'.jarvis-dev')&&!within(dataDir,root),'Development data must remain separate from the project and copied runtime state.');
  // Existing symlinks or writable shared directories cannot redirect this path.
  let directory=home;
  for(const component of ['','.local','share','jarvis-dev-112']){
    if(component)directory=join(directory,component);
    let entry;try{entry=lstatSync(directory)}catch(error){if(error.code==='ENOENT')continue;throw error}
    requireThat(entry.isDirectory()&&!entry.isSymbolicLink(),'The development data path must contain only real directories.');
    requireThat((entry.uid===account.uid||entry.uid===0)&&(entry.mode&0o022)===0,'The development data path must be protected from other users.');
    if(directory===dataDir)requireThat(entry.uid===account.uid,'The development data directory must belong to this user.');
  }
  requireThat(![3140,3141].includes(apiPort)&&![3140,3141].includes(webPort)&&apiPort!==webPort,'Development ports must remain separate from production.');
  const listening=new Set();
  for(const table of ['/proc/net/tcp','/proc/net/tcp6']){
    let rows;try{rows=readFileSync(table,'utf8').trim().split('\n').slice(1)}catch(error){if(error.code==='ENOENT'&&table.endsWith('tcp6'))continue;throw error}
    for(const row of rows){const columns=row.trim().split(/\s+/);if(columns[3]==='0A')listening.add(parseInt(columns[1].split(':').at(-1),16))}
  }
  requireThat(!listening.has(apiPort)&&!listening.has(webPort),'A development port is already occupied; no process was stopped.');
  return {account,home,dataDir};
}

function childEnvironment({account,home,dataDir}){
  // An allowlist discards inherited JARVIS_*, provider secrets, NODE_OPTIONS,
  // npm overrides, TLS settings, production queues and SSH agent credentials.
  const environment={HOME:home,USER:account.username,LOGNAME:account.username,PATH:process.env.PATH??'/usr/local/bin:/usr/bin:/bin'};
  for(const key of ['LANG','LC_ALL','LC_CTYPE','TERM','COLORTERM','TZ','NO_COLOR','FORCE_COLOR','COLUMNS','LINES']){
    if(process.env[key]!==undefined)environment[key]=process.env[key];
  }
  return {...environment,NODE_ENV:'development',JARVIS_HOST:host,JARVIS_PORT:String(apiPort),JARVIS_ALLOWED_HOSTS:'localhost,127.0.0.1,[::1]',JARVIS_ALLOW_LAN:'0',JARVIS_DATA_DIR:dataDir,JARVIS_DEV_API_TARGET:apiTarget};
}

function run(){
  requireThat(process.argv.slice(2).every(value=>value==='--check')&&process.argv.length<=3,'Usage: node scripts/dev-112.mjs [--check]');
  const config=configuration();
  console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'development',root,home:config.home,dataDir:config.dataDir,api:{host,port:apiPort},web:{host,port:webPort},apiTarget,portsAvailable:true,inheritedEnvironment:'allowlist',productionServicesChanged:false}));
  if(process.argv.includes('--check'))return;
  const concurrently=join(root,'node_modules','concurrently','dist','bin','concurrently.js');
  requireThat(existsSync(concurrently),'Install Linux dependencies with npm ci before starting development.');
  process.umask(0o077);
  mkdirSync(config.dataDir,{recursive:true,mode:0o700});chmodSync(config.dataDir,0o700);
  const child=spawn(process.execPath,[concurrently,'--kill-others','--names','API,WEB','npm run dev -w @jarvis/api',`npm run dev -w @jarvis/web -- --host ${host} --port ${webPort} --strictPort`],{cwd:root,env:childEnvironment(config),stdio:'inherit',detached:true,shell:false});
  let requestedCode,leaderExited=false,poll,deadline,stopping=false,forceSent=false,finished=false;
  const groupExists=()=>{if(!child.pid)return false;try{process.kill(-child.pid,0);return true}catch(error){if(error.code==='ESRCH')return false;throw error}};
  const signalGroup=signal=>{if(!child.pid)return;try{process.kill(-child.pid,signal)}catch(error){if(error.code!=='ESRCH')throw error}};
  const finish=()=>{finished=true;if(poll)clearInterval(poll);poll=undefined;process.exitCode=requestedCode??0};
  const observe=()=>{
    if(!groupExists()){if(leaderExited)finish();return}
    if(Date.now()>=deadline&&!forceSent){signalGroup('SIGKILL');forceSent=true}
  };
  const stop=signal=>{
    if(finished)return;
    requestedCode??=signal==='SIGINT'?130:signal==='SIGHUP'?129:143;
    // Keep handlers installed while waiting for our detached process group.
    // Repeated stop signals escalate only that group, without extending time.
    if(stopping){signalGroup('SIGKILL');forceSent=true}
    else{stopping=true;signalGroup(signal==='SIGHUP'?'SIGTERM':signal);deadline=Date.now()+8000}
    if(!poll)poll=setInterval(observe,100);
  };
  process.on('SIGINT',()=>stop('SIGINT'));process.on('SIGTERM',()=>stop('SIGTERM'));process.on('SIGHUP',()=>stop('SIGHUP'));
  child.once('error',error=>{console.error('Development launch failed: '+error.message);requestedCode=1;leaderExited=true;finish()});
  child.once('exit',(code,signal)=>{
    leaderExited=true;requestedCode??=code??(signal==='SIGINT'?130:143);
    if(groupExists()){
      if(!stopping){stopping=true;signalGroup('SIGTERM');deadline=Date.now()+2000}
      if(!poll)poll=setInterval(observe,100);
    }else finish();
  });
}
try{run()}catch(error){console.error('112 development: '+error.message);process.exitCode=1}
