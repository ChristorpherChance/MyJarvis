import {build} from 'esbuild';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const output=resolve('artifacts/development-node/package');await mkdir(output,{recursive:true});
await build({entryPoints:['apps/agent/src/index.ts'],bundle:true,platform:'node',format:'esm',target:'node24',outfile:join(output,'jarvis-node.mjs')});
await build({entryPoints:['apps/api/src/runtime/agent-supervisor.ts'],bundle:true,platform:'node',format:'esm',target:'node24',outfile:join(output,'agent-supervisor.js')});
await copyFile('scripts/prepare-development-node.mjs',join(output,'prepare-development-node.mjs'));
await copyFile('docs/开发监督与双机接入.md',join(output,'使用说明.md'));
await writeFile(join(output,'package.json'),JSON.stringify({name:'jarvis-development-node',private:true,type:'module',engines:{node:'>=24'}})+'\n');
const files=['jarvis-node.mjs','agent-supervisor.js','prepare-development-node.mjs','使用说明.md','package.json'],manifest=[];
for(const file of files)manifest.push({file,sha256:createHash('sha256').update(await readFile(join(output,file))).digest('hex')});
await writeFile(join(output,'SHA256.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({directory:output,files:files.length,credentialsIncluded:false}));
