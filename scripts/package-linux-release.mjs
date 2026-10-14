/** Package source and validated staged builds; excludes private data and dependencies. */
import {mkdir,cp,readFile,writeFile,lstat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),release='20261007-linux-cluster';
const target=resolve(root,'artifacts/linux-release',release);if(existsSync(target))throw Error('Release package already exists; preserve it and choose a new release');
await mkdir(target,{recursive:true});
for(const name of ['package.json','package-lock.json','scripts','apps/api/package.json','apps/api/tsconfig.json','apps/api/src','apps/api/test','apps/api/resources','apps/web/package.json','apps/web/tsconfig.json','apps/web/vite.config.ts','apps/web/index.html','apps/web/src','docs/openapi-v1-planned.json']){if(!(await lstat(join(root,name))).isSymbolicLink()){await mkdir(dirname(join(target,name)),{recursive:true});await cp(join(root,name),join(target,name),{recursive:true,errorOnExist:true,force:false});}else throw Error('Linked source is not allowed');}
if(existsSync(join(root,'apps/web/public')))await cp(join(root,'apps/web/public'),join(target,'apps/web/public'),{recursive:true});
for(const app of ['api','web'])if(existsSync(join(root,`apps/${app}/.dist-next`)))await cp(join(root,`apps/${app}/.dist-next`),join(target,`apps/${app}/dist`),{recursive:true});
await writeFile(join(target,'release.json'),JSON.stringify({version:1,release,createdAt:new Date().toISOString(),privateDataIncluded:false}));
const archive=target+'.tar.gz';await promisify(execFile)('tar',['-czf',archive,'-C',target,'.'],{windowsHide:true,timeout:120000});
const sha256=createHash('sha256').update(await readFile(archive)).digest('hex');await writeFile(archive+'.sha256',sha256+'\n');console.log(JSON.stringify({release,archive,sha256}));
