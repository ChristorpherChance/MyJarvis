import { Store } from '../apps/api/dist/store.js';
import { mkdir, readFile, cp, writeFile,realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join,relative,isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(process.env.JARVIS_DATA_DIR || join(root,'.jarvis'));
if(!existsSync(join(source,'jarvis.db')))throw new Error('还没有业务库，请先运行贾维斯');
if(existsSync(join(source,'runtime.pid'))){
  const pid=Number(await readFile(join(source,'runtime.pid'),'utf8'));
  let running=false;try{process.kill(pid,0);running=true;}catch{}
  if(running)throw new Error('请先停止后端，再备份业务与 Pi 会话');
}
const target=resolve(process.argv[2] || join(root,'artifacts','backups',new Date().toISOString().replaceAll(':','-').replaceAll('.','-')));
// Resolve existing ancestors before mkdir, including Windows junctions and case aliases.
async function canonicalNewPath(path){let ancestor=path;const segments=[];while(!existsSync(ancestor)){const parent=dirname(ancestor);if(parent===ancestor)throw new Error('备份路径没有可访问的父目录');segments.unshift(relative(parent,ancestor));ancestor=parent;}return resolve(await realpath(ancestor),...segments);}
const sourceCanonical=await realpath(source),targetCanonical=await canonicalNewPath(target),inside=relative(sourceCanonical,targetCanonical);
if(!inside||!inside.startsWith('..')&&!isAbsolute(inside))throw new Error('备份目录不能位于数据目录内');
if(existsSync(target))throw new Error('目标目录已存在，请选择新目录');
await mkdir(target,{recursive:true,mode:0o700});
if(process.platform==='win32'){
  const execute=promisify(execFile);
  const {stdout}=await execute('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true});
  const sid=stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];
  if(!sid)throw new Error('无法确定备份目录权限，未复制私人资料');
  await execute('icacls.exe',[target,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{windowsHide:true});
}
const store=new Store(source);
try{store.backup(join(target,'jarvis.db'));}finally{store.close();}
if(existsSync(join(source,'pi')))await cp(join(source,'pi'),join(target,'pi'),{recursive:true,errorOnExist:true,force:false});
if(existsSync(join(source,'knowledge-uploads')))await cp(join(source,'knowledge-uploads'),join(target,'knowledge-uploads'),{recursive:true,errorOnExist:true,force:false});
if(existsSync(join(source,'knowledge-runtime')))await cp(join(source,'knowledge-runtime'),join(target,'knowledge-runtime'),{recursive:true,errorOnExist:true,force:false});
if(existsSync(join(source,'runtime')))await cp(join(source,'runtime'),join(target,'runtime'),{recursive:true,errorOnExist:true,force:false});
const executionPath=join(source,'execution','execution.sqlite');
if(existsSync(join(source,'execution')))await cp(join(source,'execution'),join(target,'execution'),{recursive:true,errorOnExist:true,force:false,filter:path=>!/^execution\.sqlite(?:-wal|-shm)?$/i.test(path.split(/[\\/]/).at(-1))});
if(existsSync(executionPath)){
  await mkdir(join(target,'execution'),{recursive:true});const execution=new DatabaseSync(executionPath,{readOnly:true});
  try{execution.prepare('VACUUM INTO ?').run(join(target,'execution','execution.sqlite'));}finally{execution.close();}
}
const databaseSha256=createHash('sha256').update(await readFile(join(target,'jarvis.db'))).digest('hex');
await writeFile(join(target,'manifest.json'),JSON.stringify({version:'0.2.0-runtime',createdAt:new Date().toISOString(),database:'jarvis.db',databaseSha256,executionDatabase:existsSync(join(target,'execution','execution.sqlite'))?{path:'execution/execution.sqlite',sha256:createHash('sha256').update(await readFile(join(target,'execution','execution.sqlite'))).digest('hex')}:null,pi:existsSync(join(target,'pi')),knowledgeUploads:existsSync(join(target,'knowledge-uploads')),knowledgeRuntime:existsSync(join(target,'knowledge-runtime')),voiceKeyIncluded:existsSync(join(target,'runtime','voice-master.key')),source,containsPrivateCredentials:true},null,2));
console.log(`备份完成：${target}`);
