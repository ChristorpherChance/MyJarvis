/** Development always gets a separate data directory after production moves to 112. */
import {spawn} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const child=spawn(process.execPath,[resolve(root,'node_modules/tsx/dist/cli.mjs'),'watch','src/index.ts'],{cwd:resolve(root,'apps/api'),env:{...process.env,NODE_ENV:'development',JARVIS_DATA_DIR:process.env.JARVIS_DATA_DIR??resolve(root,'.jarvis-dev')},stdio:'inherit',windowsHide:true});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
