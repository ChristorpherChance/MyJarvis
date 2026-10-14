/** Fixed read-only SSH polling. Cloud keys sign readings; relay cannot forge them. */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash,verify} from 'node:crypto';
import {request} from 'node:https';
import {fileURLToPath} from 'node:url';

export function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
export function validateEnvelope(peer,item,at=Date.now()){
 const path='/api/v1/agents/'+peer.agentId+'/heartbeat';
 if(!item||item.version!==1||item.method!=='POST'||item.path!==path||item.agentId!==peer.agentId||item.machineId!==peer.machineId)throw Error('CLOUD_BINDING_INVALID');
 const keys=Object.keys(item.headers??{}).sort();if(keys.join(',')!=='x-jarvis-nonce,x-jarvis-signature,x-jarvis-timestamp')throw Error('CLOUD_HEADERS_INVALID');
 const h=item.headers,t=Date.parse(h['x-jarvis-timestamp']);if(!Number.isFinite(t)||Math.abs(at-t)>25000||!/^[A-Za-z0-9_-]{16,100}$/.test(h['x-jarvis-nonce'])||!/^[A-Za-z0-9_-]{80,100}$/.test(h['x-jarvis-signature']))throw Error('CLOUD_FRESHNESS_INVALID');
 const text=['POST',path,h['x-jarvis-timestamp'],h['x-jarvis-nonce'],createHash('sha256').update(canonical(item.body)).digest('hex')].join('\n');
 if(!verify(null,Buffer.from(text),peer.publicKey,Buffer.from(h['x-jarvis-signature'],'base64url')))throw Error('CLOUD_SIGNATURE_INVALID');
 return item;
}
function collect(config,peer){return new Promise((resolve,reject)=>{
 const child=spawn('/usr/bin/ssh',['-F',config.sshConfig,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',peer.alias,'snapshot'],{stdio:['ignore','pipe','pipe'],shell:false});let text='',size=0,done=false;
 const finish=(error,item)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(item);};
 const timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('CLOUD_SSH_TIMEOUT'));},12000);
 child.stdout.on('data',b=>{size+=b.length;if(size>128000){child.kill('SIGKILL');finish(Error('CLOUD_RESPONSE_TOO_LARGE'));}else text+=b.toString('utf8');});child.stderr.resume();
 child.once('error',()=>finish(Error('CLOUD_SSH_UNAVAILABLE')));child.once('close',code=>{if(code!==0)return finish(Error('CLOUD_SSH_FAILED'));try{finish(null,validateEnvelope(peer,JSON.parse(text)));}catch(error){finish(error);}});
 });}
function forward(config,item,ca){return new Promise((resolve,reject)=>{
 const base=new URL(config.apiUrl);if(base.protocol!=='https:'||!['127.0.0.1','localhost'].includes(base.hostname)||base.username||base.password||base.pathname!=='/')return reject(Error('CLOUD_CENTRAL_URL_INVALID'));
 const body=canonical(item.body),req=request(new URL(item.path,base),{method:'POST',ca,rejectUnauthorized:true,headers:{...item.headers,'content-type':'application/json','content-length':Buffer.byteLength(body)},timeout:10000},res=>{
  res.resume();res.once('end',()=>res.statusCode===200?resolve():reject(Error('CLOUD_CENTRAL_HTTP_'+res.statusCode)));});req.once('timeout',()=>req.destroy(Error('CLOUD_CENTRAL_TIMEOUT')));req.once('error',reject);req.end(body);
 });}
export async function poll(config){const ca=await readFile(config.caPath);return Promise.all(config.peers.map(async peer=>{try{const item=await collect(config,peer);await forward(config,item,ca);return {id:peer.id,connected:true,observedAt:item.headers['x-jarvis-timestamp']};}catch(error){return {id:peer.id,connected:false,error:typeof error?.message==='string'&&/^CLOUD_[A-Z_0-9]+$/.test(error.message)?error.message:'CLOUD_POLL_FAILED',checkedAt:new Date().toISOString()};}}));}
async function main(){const file=process.argv[process.argv.indexOf('--config')+1];if(!file||!file.startsWith('/etc/jarvis-cloud-relay/'))throw Error('CLOUD_CONFIG_PATH_INVALID');const config=JSON.parse(await readFile(file,'utf8'));let running=true;process.on('SIGTERM',()=>running=false);process.on('SIGINT',()=>running=false);while(running){const start=Date.now(),items=await poll(config),report={version:1,checkedAt:new Date().toISOString(),items};const temp='/var/lib/jarvis-cloud-relay/status.tmp';await writeFile(temp,JSON.stringify(report),{mode:0o600});await rename(temp,'/var/lib/jarvis-cloud-relay/status.json');for(const row of items)console.log(JSON.stringify(row));if(running)await new Promise(resolve=>setTimeout(resolve,Math.max(500,15000-(Date.now()-start))));}}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main().catch(()=>{console.error('CLOUD_RELAY_FAILED');process.exitCode=1;});
