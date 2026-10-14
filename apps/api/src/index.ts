import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, rm, readFile } from 'node:fs/promises';
import { createApp } from './app.js';
import { serverBinding } from './runtime/server-binding.js';
import { enforceNodeStartup,readNodeConfiguration } from './runtime/cluster-runtime.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDir = process.env.JARVIS_DATA_DIR ? resolve(process.env.JARVIS_DATA_DIR) : resolve(root,'.jarvis');
const nodeConfiguration=await enforceNodeStartup(process.env.JARVIS_NODE_CONFIG,dataDir,resolve(root,'.deployment','retired-data.json'));
const {host,port,allowedHosts,tlsKey,tlsCert}=serverBinding(process.env);
const tls=tlsKey&&tlsCert?{key:await readFile(resolve(tlsKey)),cert:await readFile(resolve(tlsCert))}:undefined;
const {app}=await createApp({dataDir,webDir:resolve(root,'apps/web/dist'),allowedHosts,tls,healthInstanceId:process.env.JARVIS_SERVICE_INSTANCE,nodeConfiguration});
let roleTimer:ReturnType<typeof setInterval>|undefined;
app.addHook('onClose',async()=>{clearInterval(roleTimer)});
app.addHook('onClose',async()=>{const pidPath=resolve(dataDir,'runtime.pid');if(Number(await readFile(pidPath,'utf8').catch(()=>''))===process.pid)await rm(pidPath,{force:true});});
await app.listen({host,port});
await writeFile(resolve(dataDir,'runtime.pid'),String(process.pid));
const displayHost=['0.0.0.0','::'].includes(host)?allowedHosts.find(name=>!['localhost','127.0.0.1','[::1]'].includes(name))??allowedHosts[0]:host==='::1'?'[::1]':host;
console.log(`贾维斯已启动：${tls?'https':'http'}://${displayHost}:${port} · v0.1.0`);
let stopping=false;const shutdown=()=>{if(stopping)return;stopping=true;void app.close().then(()=>process.exit(0),()=>process.exit(1));};
if(nodeConfiguration){let checking=false;roleTimer=setInterval(()=>{if(checking||stopping)return;checking=true;void readNodeConfiguration(process.env.JARVIS_NODE_CONFIG!).then(current=>{if(current.role!==nodeConfiguration.role||current.nodeId!==nodeConfiguration.nodeId||current.epoch!==nodeConfiguration.epoch||current.dataDir!==nodeConfiguration.dataDir||current.release!==nodeConfiguration.release)shutdown();},()=>shutdown()).finally(()=>{checking=false});},1000);roleTimer.unref();}
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,shutdown);
// A private IPC channel is created only by the local supervisor, never by an HTTP caller.
if(process.channel)process.on('message',message=>{if(message&&typeof message==='object'&&(message as {type?:string}).type==='jarvis.service.shutdown')shutdown();});
