import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {request} from 'node:https';
import {PLATFORM_BUILD} from '../apps/api/dist/runtime/cluster-runtime.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function unusedPort(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
test('actual configured HTTPS entrypoint stays healthy, closes on role withdrawal and standby never opens business storage',async t=>{
 if(process.platform!=='linux'||process.getuid()!==0){t.skip('Root-owned Linux control-file fixture');return;}
 const dir=await mkdtemp(join(tmpdir(),'jarvis-entry-test-')),data=join(dir,'data'),cert=join(dir,'cert.pem'),key=join(dir,'key.pem'),file=join(dir,'node.json');let child;
 try{
 await mkdir(data);await promisify(execFile)('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1'],{timeout:15000});
 const ca=await readFile(cert),configuration={version:1,clusterId:'isolated-entry',nodeId:'entry-test',role:'primary',epoch:1,release:PLATFORM_BUILD,dataDir:data,controlDir:dir,caPath:cert,observerToken:'e'.repeat(64),maxSnapshotLagSec:900,peers:[]};
 await writeFile(file,JSON.stringify(configuration),{mode:0o600});
 const port=await unusedPort(),entry=resolve('apps/api/dist/index.js');
 let output='';const launch=()=>{const c=spawn(process.execPath,[entry],{cwd:resolve('.'),env:{...process.env,JARVIS_DATA_DIR:data,JARVIS_NODE_CONFIG:file,JARVIS_TLS_CERT:cert,JARVIS_TLS_KEY:key,JARVIS_HOST:'127.0.0.1',JARVIS_ALLOWED_HOSTS:'127.0.0.1',JARVIS_PORT:String(port),JARVIS_PYTHON:'/no-python-fixture'},stdio:['ignore','pipe','pipe']});c.stdout.on('data',b=>output+=b);c.stderr.on('data',b=>output+=b);return c;};
 child=launch();const exit=new Promise(r=>child.once('exit',(code)=>r(code)));
 const get=()=>new Promise((ok,fail)=>{const req=request('https://127.0.0.1:'+port+'/api/health',{ca},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>{try{ok(JSON.parse(body));}catch(e){fail(e);}});});req.setTimeout(1000,()=>req.destroy(Error('timeout')));req.on('error',fail);req.end();});
 let health;for(let i=0;i<60;i++){health=await get().catch(()=>null);if(health?.status==='ok')break;if(child.exitCode!==null)throw Error(output);await delay(100);}
 assert.equal(health?.nodeId,'entry-test',output);await delay(1300);assert.equal(child.exitCode,null,output);assert.equal((await get()).role,'primary');
 await writeFile(file,JSON.stringify({...configuration,role:'standby',epoch:2}),{mode:0o600});
 assert.equal(await Promise.race([exit,delay(5000).then(()=>{throw Error('Role withdrawal did not stop actual entrypoint');})]),0);
 assert.equal(existsSync(join(data,'runtime.pid')),false);
 const standbyData=join(dir,'standby');await mkdir(standbyData);await writeFile(file,JSON.stringify({...configuration,role:'standby',dataDir:standbyData}),{mode:0o600});
 child=spawn(process.execPath,[entry],{env:{...process.env,JARVIS_DATA_DIR:standbyData,JARVIS_NODE_CONFIG:file},stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',b=>error+=b);const code=await new Promise(r=>child.once('exit',r));assert.notEqual(code,0);assert.match(error,/Standby/);assert.equal(existsSync(join(standbyData,'jarvis.db')),false);
 }finally{if(child&&child.exitCode===null){child.kill('SIGKILL');await new Promise(r=>child.once('exit',r));}await rm(dir,{recursive:true,force:true});}
});

