/** Upgrade only the already-running, privately controlled workspace service; never starts an OS task. */
import {readFile,writeFile,mkdir,rename,realpath,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,relative,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {controlService} from './platform-service.mjs';
const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'..'),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(check,timeout=60000){const start=Date.now();while(Date.now()-start<timeout){if(await check())return;await delay(200);}throw Error('升级状态等待超时');}
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
export async function upgradeLocalPlatform({root=workspace,dataDir=join(root,'.jarvis'),apiStage=join(root,'apps/api/.dist-next'),webStage=join(root,'apps/web/.dist-next'),healthUrl='http://127.0.0.1:3140/api/health',expectedBuild,runBackup}={}){
 root=await realpath(root);dataDir=await realpath(dataDir);const paths={api:join(root,'apps/api/dist'),web:join(root,'apps/web/dist'),apiStage:resolve(apiStage),webStage:resolve(webStage),release:join(root,'artifacts/releases','release-'+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,8)),backup:join(root,'artifacts/backups','release-'+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,8))};
 const checkPath=async path=>{const absolute=resolve(path),rel=relative(root,absolute);if(!rel||rel.startsWith('..')||resolve(root,rel)!==absolute)throw Error('升级路径必须是工作区内明确的目录');let ancestor=absolute;while(!existsSync(ancestor))ancestor=dirname(ancestor);const actual=await realpath(ancestor);if(actual!==root&&!actual.startsWith(root+sep))throw Error('升级目录链接超出工作区');return absolute;};
 for(const path of Object.values(paths))await checkPath(path);await stat(join(paths.apiStage,'index.js'));await stat(join(paths.webStage,'index.html'));
 const initial=await controlService(dataDir,'status'),initialPid=Number(await readFile(join(dataDir,'runtime.pid'),'utf8'));if(!initial.childPid||initial.childPid!==initialPid)throw Error('运行进程与常驻控制不一致，未升级');
 const readHealth=async()=>{try{const r=await fetch(healthUrl,{redirect:'error',signal:AbortSignal.timeout(2000)});return r.ok?await r.json():null;}catch{return null;}};const initialHealth=await readHealth();if(initialHealth?.status!=='ok')throw Error('原服务尚未健康，未覆盖构建');
 await mkdir(paths.release,{recursive:true});const held=join(paths.api,'index.maintenance-hold.js');if(existsSync(held))throw Error('上一次升级暂停文件还存在，请先核验');let heldEntry=false,apiInstalled=false,webInstalled=false,apiArchived=false,webArchived=false;
 const stopForSwap=async()=>{if(existsSync(join(paths.api,'index.js'))){await rename(join(paths.api,'index.js'),held);heldEntry=true;}await controlService(dataDir,'restart');await wait(async()=>!existsSync(join(dataDir,'runtime.pid')),40000);};
 try{
  await stopForSwap();
  if(runBackup)await runBackup(paths.backup);else{const result=await promisify(execFile)(process.execPath,[join(root,'scripts/backup.mjs'),paths.backup],{cwd:root,env:{...process.env,JARVIS_DATA_DIR:dataDir},windowsHide:true,timeout:120000,maxBuffer:1024*1024});if(result.stdout)process.stdout.write(result.stdout);const manifest=JSON.parse(await readFile(join(paths.backup,'manifest.json'),'utf8'));if(await hash(join(paths.backup,'jarvis.db'))!==manifest.databaseSha256)throw Error('备份业务库hash不匹配');if(manifest.executionDatabase&&await hash(join(paths.backup,manifest.executionDatabase.path))!==manifest.executionDatabase.sha256)throw Error('备份执行库hash不匹配');const key=join(dataDir,'runtime/voice-master.key');if(existsSync(key)&&(!manifest.voiceKeyIncluded||await hash(key)!==await hash(join(paths.backup,'runtime/voice-master.key'))))throw Error('语音密钥备份不匹配');}
  await rename(paths.api,join(paths.release,'api-before'));apiArchived=true;await rename(join(paths.release,'api-before/index.maintenance-hold.js'),join(paths.release,'api-before/index.js'));heldEntry=false;await rename(paths.apiStage,paths.api);apiInstalled=true;
  await rename(paths.web,join(paths.release,'web-before'));webArchived=true;await rename(paths.webStage,paths.web);webInstalled=true;
  await controlService(dataDir,'restart');await wait(async()=>{const health=await readHealth(),state=await controlService(dataDir,'status').catch(()=>null),pid=Number(await readFile(join(dataDir,'runtime.pid'),'utf8').catch(()=>''));return health?.status==='ok'&&(!expectedBuild||health.build===expectedBuild)&&pid>0&&state?.childPid===pid;});
  const health=await readHealth(),state=await controlService(dataDir,'status'),report={status:'passed',at:new Date().toISOString(),build:health.build,previousBuild:initialHealth.build,previousPid:initialPid,childPid:state.childPid,supervisorPid:state.supervisorPid,backup:paths.backup,archivedBuild:paths.release,osTaskStarted:false};await writeFile(join(paths.release,'report.json'),JSON.stringify(report,null,2));return report;
 }catch(error){
  try{
   if(apiInstalled){await stopForSwap();await rename(paths.api,join(paths.release,'api-failed'));heldEntry=false;}if(apiArchived){await rename(join(paths.release,'api-before'),paths.api);apiArchived=false;}if(heldEntry&&existsSync(held)){await rename(held,join(paths.api,'index.js'));heldEntry=false;}if(webInstalled)await rename(paths.web,join(paths.release,'web-failed'));if(webArchived)await rename(join(paths.release,'web-before'),paths.web);await controlService(dataDir,'restart');await wait(async()=>{const health=await readHealth();return health?.build===initialHealth.build;});await writeFile(join(paths.release,'report.json'),JSON.stringify({status:'rolled-back',at:new Date().toISOString(),reason:error.message,backup:paths.backup,build:initialHealth.build},null,2));
  }catch(rollback){throw new AggregateError([error,rollback],'升级失败且旧构建恢复未确认；保留所有构建和数据，请查看常驻日志');}throw error;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const expectedBuild=process.argv[2];if(!expectedBuild)throw Error('请提供已经通过测试的目标build');console.log(JSON.stringify(await upgradeLocalPlatform({expectedBuild}),null,2));}
