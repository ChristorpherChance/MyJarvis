import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApp} from '../apps/api/src/app.js';
const run=promisify(execFile),directory=await mkdtemp(join(tmpdir(),'jarvis-platform-operations-'));
const runtime=await createApp({dataDir:directory,webDir:resolve('apps/web/dist')});
try {
  await runtime.app.listen({host:'127.0.0.1',port:0});
  const address=runtime.app.server.address();if(!address||typeof address==='string')throw Error('No test address');
  const url=`http://127.0.0.1:${address.port}`;
  const result=await run(process.execPath,['scripts/qa-platform-operations.cjs'],{cwd:resolve('.'),windowsHide:true,env:{...process.env,JARVIS_QA_URL:url},timeout:480000,maxBuffer:1024*1024});
  console.log(result.stdout);if(result.stderr)console.error(result.stderr);
  const out=resolve('artifacts/platform-operations-qa');await mkdir(out,{recursive:true});
  await writeFile(join(out,'runtime.json'),JSON.stringify({at:new Date().toISOString(),isolatedTestDatabase:true,realHttp:true,productionWrites:false,remoteExecution:false,piRequests:false},null,2));
} catch(error) {
  const result=error as {stdout?:string;stderr?:string};if(result.stdout)console.log(result.stdout);if(result.stderr)console.error(result.stderr);throw error;
} finally {await runtime.app.close();await rm(directory,{recursive:true,force:true})}
