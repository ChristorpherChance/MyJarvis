/** Actual browser/git/font smoke in an ephemeral, networkless test container. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const code=String.raw`const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const packagePath='/opt/test-tools/node_modules/playwright/package.json';
const version=JSON.parse(fs.readFileSync(packagePath)).version;if(version!=='1.62.1')throw Error('FIXED_PLAYWRIGHT_VERSION_REQUIRED');
const font='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
if(!fs.existsSync(font))throw Error('CJK_FONT_UNAVAILABLE');
const git=cp.spawnSync('git',['--version'],{encoding:'utf8'});if(git.status!==0)throw Error('GIT_UNAVAILABLE');
function walk(dir){let result=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())result.push(...walk(p));else if(e.isFile()&&['headless_shell','chrome-headless-shell'].includes(e.name))result.push(p)}return result;}
fs.mkdirSync('/tmp/home',{recursive:true});
(async()=>{const {chromium}=require('playwright');const browser=await chromium.launch({headless:true,timeout:10000});try{const page=await browser.newPage();await page.clock.install();await page.setContent('<!doctype html><meta charset=utf-8><p>贾维斯测试 · English</p>');await page.clock.runFor(25);const pdf=await page.pdf({format:'A4'});const executables=walk('/opt/test-browsers');if(executables.length!==1)throw Error('FIXED_CHROMIUM_EXECUTABLE_REQUIRED');console.log(JSON.stringify({ok:true,gitVersion:git.stdout.trim(),playwrightVersion:version,chromiumVersion:browser.version(),chromiumExecutable:executables[0],chromiumExecutableSHA256:sha(fs.readFileSync(executables[0])),fontSHA256:sha(fs.readFileSync(font)),packageLockSHA256:sha(fs.readFileSync('/opt/test-tools/package-lock.json')),browserRegistrySHA256:sha(fs.readFileSync('/opt/test-tools/node_modules/playwright-core/browsers.json')),debianPackageManifestSHA256:sha(fs.readFileSync('/opt/test-tools/debian-packages.txt')),clockSupported:true,syntheticPDFBytes:pdf.length,syntheticPDFHeader:pdf.subarray(0,5).toString(),network:'none',sourceMounted:false,modelsInvoked:false,businessServicesTouched:false}));}finally{await browser.close()}})().catch(()=>{console.log(JSON.stringify({ok:false,code:'IMAGE_RUNTIME_SMOKE_FAILED'}));process.exitCode=1});`;
const built=JSON.parse(await readFile('artifacts/software-factory/full-test/image-build-r2.json','utf8'));
if(!built.complete||built.exitCode!==0||!/^sha256:[a-f0-9]{64}$/.test(built.imageId))throw Error('FIXED_IMAGE_BUILD_NOT_COMPLETE');
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({code,id:built.imageId},String.raw`import subprocess
name='jarvis-msf-image-smoke-r2';role='image-smoke-r2'
existing=subprocess.run(['/usr/bin/docker','inspect',name],capture_output=True,timeout=10)
if existing.returncode==0:raise RuntimeError('IMAGE_SMOKE_NAME_ALREADY_EXISTS')
try:
 r=subprocess.run(['/usr/bin/docker','run','--pull=never','--rm','--init','--name',name,'--label','jarvis.validation.role='+role,'--network','none','--user','1000:1000','--security-opt','no-new-privileges','--cap-drop','ALL','--read-only','--memory','1536m','--cpus','1','--pids-limit','256','--shm-size','256m','--tmpfs','/tmp:rw,nosuid,nodev,size=256m','--env','HOME=/tmp/home',p['id'],'node','-e',p['code']],capture_output=True,text=True,timeout=30)
except subprocess.TimeoutExpired:
 r=subprocess.CompletedProcess([],124,'','')
finally:
 check=subprocess.run(['/usr/bin/docker','inspect','--format','{{index .Config.Labels "jarvis.validation.role"}}',name],capture_output=True,text=True,timeout=10)
 if check.returncode==0 and check.stdout.strip()==role:subprocess.run(['/usr/bin/docker','rm','-f',name],capture_output=True,timeout=10)
public=None
for line in r.stdout.splitlines():
 try:
  row=json.loads(line)
  if isinstance(row,dict) and type(row.get('ok')) is bool:public=row
 except ValueError:pass
print(json.dumps({'exitCode':r.returncode,'imageId':p['id'],'smoke':public or {'ok':False,'code':'IMAGE_SMOKE_OUTPUT_INVALID'},'rawLogsExported':False}))
`),true));
await mkdir('artifacts/software-factory/full-test',{recursive:true});
await writeFile('artifacts/software-factory/full-test/image-smoke-r2.json',JSON.stringify({at:new Date().toISOString(),...result},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
if(result.exitCode!==0||!result.smoke.ok)process.exitCode=1;
