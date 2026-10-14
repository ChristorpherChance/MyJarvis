import {readFile,writeFile,stat,realpath,mkdir} from 'node:fs/promises';
import {resolve,join,dirname,delimiter,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';

const args=process.argv.slice(2),option=(key,fallback)=>{const at=args.indexOf('--'+key);return at<0?fallback:args[at+1]};
const exists=async p=>{try{return (await stat(p)).isFile()}catch{return false}};
if(Number(process.versions.node.split('.')[0])<24)throw Error('请安装 Node.js 24 或更高版本');
async function discover(name,explicit){
 const candidates=[];if(explicit)candidates.push(resolve(explicit));
 else{
  const home=homedir();if(name==='claude')candidates.push(join(home,'.local','bin',process.platform==='win32'?'claude.exe':'claude'));
  for(const dir of (process.env.PATH??'').split(delimiter).filter(Boolean)){
   candidates.push(join(dir,name+(process.platform==='win32'?'.exe':'')));
   const module=name==='codex'?'@openai/codex/bin/codex.js':'@anthropic-ai/claude-code/cli.js';
   candidates.push(join(dir,'node_modules',module),join(dir,'..','lib','node_modules',module));
  }
  if(process.env.APPDATA)candidates.push(join(process.env.APPDATA,'npm','node_modules',name==='codex'?'@openai/codex/bin/codex.js':'@anthropic-ai/claude-code/cli.js'));
 }
 for(const candidate of candidates){if(!await exists(candidate))continue;const path=await realpath(candidate);if(/\.(cmd|bat|ps1|sh)$/i.test(path)){if(explicit)throw Error('请填写原生 exe 或官方 CLI 的 js 路径，不能使用 shell 包装器');continue}
  const js=/\.(?:m?js|cjs)$/i.test(path),program=js?process.execPath:path,prefix=js?[path]:[],version=spawnSync(program,[...prefix,'--version'],{encoding:'utf8',shell:false,windowsHide:true,timeout:10000,maxBuffer:200000});
  if(version.status!==0){if(explicit)throw Error(name+' --version 检查失败');continue}
  const result=spawnSync(program,[...prefix,...(name==='codex'?['login','status']:['auth','status','--json'])],{encoding:'utf8',shell:false,windowsHide:true,timeout:10000,maxBuffer:200000});let authenticated=null;
  if(name==='claude'){try{const data=JSON.parse(result.stdout);if(typeof data.loggedIn==='boolean')authenticated=data.loggedIn}catch{}}
  else{const text=(result.stdout??'')+(result.stderr??'');if(/not logged in/i.test(text))authenticated=false;else if(result.status===0&&/logged in/i.test(text))authenticated=true}
  return {program,prefix,version:((version.stdout??'')+(version.stderr??'')).match(/\d+\.\d+(?:\.\d+)?/)?.[0]??'已响应',authenticated};
 }
 return null;
}
const codex=await discover('codex',option('codex-path')),claude=await discover('claude',option('claude-path'));
const checks={system:process.platform,node:process.versions.node,codex:codex?{version:codex.version,authenticated:codex.authenticated}:null,claude:claude?{version:claude.version,authenticated:claude.authenticated}:null};
if(args.includes('--doctor')){process.stdout.write(JSON.stringify(checks,null,2)+'\n');process.exit(0)}
const machineId=option('machine-id'),rootInput=option('workspace-root'),outputInput=option('output');
if(!machineId||!rootInput||!outputInput)throw Error('用法：node prepare-development-node.mjs --doctor；生成配置另加 --machine-id <平台设备ID> --workspace-root <绝对目录> --output <配置文件> [--billing subscription] [--ticket-file <私有票据文件>]');
if(!/^[A-Za-z0-9_-]{1,180}$/.test(machineId))throw Error('设备 ID 无效；请使用平台已登记的 ID');
if(!isAbsolute(rootInput))throw Error('项目父目录必须是绝对路径');const root=await realpath(rootInput);if(!(await stat(root)).isDirectory()||root!==resolve(rootInput))throw Error('项目父目录必须存在且不能是链接');
if(!codex&&!claude)throw Error('未发现可运行的 Codex 或 Claude Code，请先安装或填写 --codex-path / --claude-path');
const apiUrl=option('api-url','https://cc-jarvis.ikvein.com'),url=new URL(apiUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('平台地址必须使用无内嵌凭据的 HTTPS');
const billing=option('billing','priced');if(!['priced','subscription'].includes(billing))throw Error('billing 只能为 priced 或 subscription');
const templates=[];for(const [engine,cli] of [['codex',codex],['claude',claude]])if(cli){const model=option(engine+'-model');templates.push({id:machineId+'-'+engine,machineId,engine,program:cli.program,args:[...cli.prefix,...(engine==='codex'?['exec','--json','--sandbox','workspace-write','--cd','{workspace}','{prompt}']:['--print','{prompt}','--output-format','stream-json','--verbose','--max-budget-usd','{maxBudgetUSD}']),...(model?['--model',model]:[])],workspaceRoot:root,maxRounds:10,timeoutSec:1200,leaseSec:60,budgetCurrency:'USD',supervision:{billing,maxTokens:500000,maxRecoveryAttempts:3,retryDelaySec:900,repairValidation:true,fallbackExecutorIds:[]}})}
for(const template of templates)template.supervision.fallbackExecutorIds=templates.filter(other=>other.id!==template.id).map(other=>other.id);
const output=resolve(outputInput);await mkdir(dirname(output),{recursive:true});const ticketFile=option('ticket-file'),pairingTicket=ticketFile?(await readFile(resolve(ticketFile),'utf8')).trim():undefined;
if(pairingTicket&&(!/^[A-Za-z0-9_-]{20,200}$/.test(pairingTicket)))throw Error('配对票据格式不正确');
const config={apiUrl,machineId,workspaceRoots:[root],templates,concurrency:1,...(pairingTicket?{pairingTicket}:{})};
await writeFile(output,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
await writeFile(output+'.central-templates.json',JSON.stringify({templates},null,2)+'\n',{flag:'wx',mode:0o600});
process.stdout.write(JSON.stringify({...checks,configuration:output,centralTemplates:output+'.central-templates.json',machineId,templateIds:templates.map(t=>t.id),next:'将模板合并到平台执行配置，生成本机一次性票据，然后启动 jarvis-node.mjs；尚未配对或启动'},null,2)+'\n');
