/** Build a separate fixed test image. No project dependency/source or service changes. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {queueState,nodeState} from './run-factory-supervision-probe.mjs';
const args=process.argv.slice(2);
if(args.some(a=>!['--execute','--status'].includes(a))||args.length>1)throw Error('IMAGE_BUILD_FIXED_ARGUMENTS_REQUIRED');
const BASE='artifacts/software-factory/full-test',image='jarvis-msf-test:20261010-r2';
const dockerfile=String.raw`FROM node@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
ENV DEBIAN_FRONTEND=noninteractive NODE_PATH=/opt/test-tools/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/test-browsers PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN node -e "require('fs').writeFileSync('/tmp/build-ca.pem',require('tls').rootCertificates.join(String.fromCharCode(10)))" \
 && sed -i 's|http://deb.debian.org|https://mirrors.ustc.edu.cn|g' /etc/apt/sources.list.d/debian.sources \
 && printf '%s' 'Acquire::https::CaInfo "/tmp/build-ca.pem";' > /etc/apt/apt.conf.d/99build-ca \
 && apt-get update && apt-get install -y --no-install-recommends git fonts-noto-cjk ca-certificates \
 && mkdir -p /opt/test-tools /opt/test-browsers \
 && cd /opt/test-tools \
 && npm --registry=https://registry.npmjs.org install --save-exact --ignore-scripts --no-audit --no-fund playwright@1.62.1 \
 && node node_modules/playwright/cli.js install --with-deps --only-shell chromium \
 && chmod -R a+rX /opt/test-tools /opt/test-browsers \
 && dpkg-query -W > /opt/test-tools/debian-packages.txt \
 && rm -rf /var/lib/apt/lists/* /root/.npm /etc/apt/apt.conf.d/99build-ca /tmp/build-ca.pem
ENV MSF_PDF_FONT=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc#NotoSansCJKsc-Regular
LABEL jarvis.purpose="isolated-software-factory-test" jarvis.playwright="1.62.1"
`;
const sha=createHash('sha256').update(dockerfile).digest('hex');
await mkdir(BASE,{recursive:true});
const status=args.includes('--status');
if(!status){const q=queueState(),n=nodeState();if(q.allActive!==0||n.template.engine!=='claude'||n.unit.ActiveState!=='active')throw Error('IMAGE_BUILD_REQUIRES_RESTORED_IDLE_NODE');}
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({execute:args.includes('--execute'),status,image,dockerfile,sha},String.raw`from pathlib import Path
import hashlib,os,stat,subprocess
root=Path('/var/lib/jarvis-development/101/test-image-build-r2-ustc')
if p['status']:
 result=root/'result.json'
 if result.exists():print(result.read_text());raise SystemExit(0)
 pid=int((root/'pid').read_text())
 try:os.kill(pid,0);running=True
 except ProcessLookupError:running=False
 log=(root/'build.log').read_text(errors='replace') if (root/'build.log').exists() else ''
 phase='image-finalize' if 'FFmpeg (playwright ffmpeg v1011) downloaded to' in log else 'chromium-download' if 'Downloading' in log else 'package-install' if 'Setting up' in log else 'image-build'
 print(json.dumps({'running':running,'complete':False,'pid':pid,'phase':phase,'image':p['image'],'rawLogsExported':False}));raise SystemExit(0)
if hashlib.sha256(p['dockerfile'].encode()).hexdigest()!=p['sha']:raise RuntimeError('FIXED_IMAGE_DOCKERFILE_DIGEST_MISMATCH')
image=subprocess.run(['/usr/bin/docker','image','inspect','--format','{{.Id}}','node:24-bookworm-slim'],capture_output=True,text=True,check=True).stdout.strip()
if image!='sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20':raise RuntimeError('FIXED_BASE_IMAGE_CHANGED')
if not p['execute']:
 print(json.dumps({'prepared':True,'image':p['image'],'baseImage':image,'dockerfileSHA256':p['sha'],'playwright':'1.62.1','testsStarted':False}));raise SystemExit(0)
root.mkdir(mode=0o700)
for q in [root,*root.parents]:
 s=q.lstat()
 if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('IMAGE_BUILD_PATH_NOT_TRUSTED')
(root/'Dockerfile').write_text(p['dockerfile']);os.chmod(root/'Dockerfile',0o600)
worker=root/'worker.py'
worker.write_text("""import subprocess,json,os,hashlib
from pathlib import Path
root=Path('/var/lib/jarvis-development/101/test-image-build-r2-ustc')
with open(root/'build.log','wb') as log:
 code=subprocess.run(['/usr/bin/docker','build','--pull=false','--tag','jarvis-msf-test:20261010-r2',str(root)],stdout=log,stderr=log,timeout=1800).returncode
out={'complete':True,'exitCode':code,'image':'jarvis-msf-test:20261010-r2','dockerfileSHA256':hashlib.sha256((root/'Dockerfile').read_bytes()).hexdigest(),'testsStarted':False,'modelsInvoked':False,'sourceCodeChanged':False,'rawLogsExported':False}
if code==0:
 r=subprocess.run(['/usr/bin/docker','image','inspect','--format','{{.Id}}',out['image']],capture_output=True,text=True,check=True)
 out['imageId']=r.stdout.strip()
tmp=root/'result.tmp';tmp.write_text(json.dumps(out));os.chmod(tmp,0o600);os.replace(tmp,root/'result.json')
""");os.chmod(worker,0o600)
log=open(root/'worker.log','wb');os.chmod(root/'worker.log',0o600)
child=subprocess.Popen(['/usr/bin/python3',str(worker)],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
(root/'pid').write_text(str(child.pid));os.chmod(root/'pid',0o600)
print(json.dumps({'started':True,'pid':child.pid,'image':p['image'],'baseImage':image,'dockerfileSHA256':p['sha'],'testsStarted':False,'modelsInvoked':False,'sourceCodeChanged':False}))
`),true));
await writeFile(BASE+'/'+(status&&result.complete?'image-build-r2':status?'image-build-progress-r2':'image-build-prepare-r2')+'.json',JSON.stringify({at:new Date().toISOString(),sources:['https://playwright.dev/docs/docker','https://playwright.dev/docs/browsers','https://www.debian.org/mirror/list'],...result},null,2)+'\n');
console.log(JSON.stringify(result));
