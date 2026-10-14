/** Authorized initial 112/101 installation. Does not migrate data or start business services. */
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
const root=process.cwd(),sshConfig=join(root,'artifacts/server-access/lenovo/ssh-config'),build='20261007-linux-cluster';
const inventory=JSON.parse(await readFile(join(root,'config/servers.example.json'),'utf8')).servers;
for(const id of ['112','101'])if(inventory.find(x=>x.id===id)?.host!==`192.168.10.${id}`)throw Error('Managed node inventory changed');
const vault=resolve(process.env.USERPROFILE,'.jarvis-deployment/MyJevis');await mkdir(vault,{recursive:true});
if((await lstat(vault)).isSymbolicLink())throw Error('Private deployment vault cannot be a link');
const user=spawnSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}),sid=user.stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];if(!sid)throw Error('Cannot establish private vault permissions');
const acl=spawnSync('icacls.exe',[vault,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{encoding:'utf8',windowsHide:true});if(acl.status)throw Error('Private vault permissions failed');
const secretFile=join(vault,'cluster-secrets.json');
let secrets=existsSync(secretFile)?JSON.parse(await readFile(secretFile,'utf8')):{version:1,observerTokens:{'112':randomBytes(32).toString('hex'),'101':randomBytes(32).toString('hex')}};
if(secrets.version!==1||!['112','101'].every(id=>/^[a-f0-9]{64}$/.test(secrets.observerTokens[id])))throw Error('Invalid observer credentials');
if(!existsSync(secretFile))await writeFile(secretFile,JSON.stringify(secrets),{flag:'wx'});
function remote(id,script){const r=spawnSync('ssh',['-F',sshConfig,'jarvis-'+id,'sudo -n bash -s'],{input:script,encoding:'utf8',maxBuffer:2e6,windowsHide:true});if(r.status!==0)throw Error(`Node ${id}: ${r.stderr.slice(-4000)}`);return r.stdout;}
function copy(source,id,destination){const r=spawnSync('scp',['-F',sshConfig,source,`jarvis-${id}:${destination}`],{encoding:'utf8',windowsHide:true});if(r.status)throw Error('Release transfer failed: '+r.stderr.slice(-1000));}
await mkdir(join(root,'artifacts/linux-deployment'),{recursive:true});
console.log(remote('112',String.raw`set -euo pipefail
umask 077
install -d -o root -g root -m 0700 /etc/jarvis/pki
if [ ! -f /etc/jarvis/pki/ca.key ]; then
  openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 -keyout /etc/jarvis/pki/ca.key -out /etc/jarvis/pki/ca.crt -subj '/CN=MyJevis Home LAN CA/O=MyJevis' -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' -addext 'keyUsage=critical,keyCertSign,cRLSign' >/dev/null 2>&1
fi
openssl x509 -in /etc/jarvis/pki/ca.crt -noout -subject
`));
const ca=remote('112','cat /etc/jarvis/pki/ca.crt\n'),caKey=remote('112','cat /etc/jarvis/pki/ca.key\n');
if(!ca.includes('BEGIN CERTIFICATE')||!caKey.includes('BEGIN PRIVATE KEY'))throw Error('CA preparation failed');
if(!existsSync(join(vault,'ca.key')))await writeFile(join(vault,'ca.key'),caKey,{flag:'wx'});
else if(createHash('sha256').update(await readFile(join(vault,'ca.key'))).digest('hex')!==createHash('sha256').update(caKey).digest('hex'))throw Error('CA key differs from existing private backup');
await writeFile(join(root,'artifacts/linux-deployment/jarvis-lan-ca.crt'),ca);
for(const id of ['112','101']){
 const csr=remote(id,`set -euo pipefail
umask 027
install -d -o root -g jarvis -m 0750 /etc/jarvis/tls
if [ ! -f /etc/jarvis/tls/server.key ]; then openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out /etc/jarvis/tls/server.key >/dev/null 2>&1; fi
openssl req -new -sha256 -key /etc/jarvis/tls/server.key -out /etc/jarvis/tls/server.csr -subj '/CN=jarvis-${id}/O=MyJevis'
chown root:jarvis /etc/jarvis/tls/server.key
chmod 0640 /etc/jarvis/tls/server.key
cat /etc/jarvis/tls/server.csr
`);
 const csr64=Buffer.from(csr).toString('base64');
 const certificate=remote('112',`set -euo pipefail
umask 077
printf '%s' '${csr64}' | base64 -d > /etc/jarvis/pki/node-${id}.csr
printf '%s\\n' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature,keyEncipherment' 'extendedKeyUsage=serverAuth' 'subjectAltName=IP:192.168.10.${id},IP:127.0.0.1,DNS:localhost' > /etc/jarvis/pki/node-${id}.ext
openssl x509 -req -in /etc/jarvis/pki/node-${id}.csr -CA /etc/jarvis/pki/ca.crt -CAkey /etc/jarvis/pki/ca.key -CAcreateserial -days 365 -sha256 -extfile /etc/jarvis/pki/node-${id}.ext -out /etc/jarvis/pki/node-${id}.crt >/dev/null 2>&1
cat /etc/jarvis/pki/node-${id}.crt
`);
 const config={version:1,clusterId:'myjevis-home',nodeId:id,role:id==='112'?'primary':'standby',epoch:1,release:build,dataDir:'/var/lib/jarvis/data',controlDir:'/var/lib/jarvis-control',caPath:'/etc/jarvis/tls/ca.crt',observerToken:secrets.observerTokens[id],maxSnapshotLagSec:900,peers:[{nodeId:id==='112'?'101':'112',url:`https://192.168.10.${id==='112'?'101':'112'}:3141/`,caPath:'/etc/jarvis/tls/ca.crt',observerToken:secrets.observerTokens[id==='112'?'101':'112']}]};
 const files={'/etc/jarvis/tls/ca.crt':ca,'/etc/jarvis/tls/server.crt':certificate,'/etc/jarvis/node.json':JSON.stringify(config)};
 let script='set -euo pipefail\numask 027\n';
 for(const[path,content]of Object.entries(files))script+=`printf '%s' '${Buffer.from(content).toString('base64')}' | base64 -d > '${path}'\nchown root:jarvis '${path}'\nchmod 0640 '${path}'\n`;
 script+='openssl verify -CAfile /etc/jarvis/tls/ca.crt /etc/jarvis/tls/server.crt\n';console.log(id,remote(id,script).trim());
}
console.log(remote('112',String.raw`set -euo pipefail
cd /opt/jarvis/releases/20261007-linux-cluster
export PATH=/opt/jarvis/node/bin:/usr/bin:/bin
npm prune --omit=dev --no-audit --no-fund
tar -czf /var/cache/jarvis/release-verified.tar.gz --exclude=node_modules --exclude=.dist-next .
sha256sum /var/cache/jarvis/release-verified.tar.gz
`));
const archive=join(root,'artifacts/linux-deployment/release-verified.tar.gz');
const fetch=spawnSync('ssh',['-F',sshConfig,'jarvis-112','sudo -n cat /var/cache/jarvis/release-verified.tar.gz'],{maxBuffer:64*1024*1024,windowsHide:true});if(fetch.status)throw Error('Validated release read failed');await writeFile(archive,fetch.stdout);const sha=createHash('sha256').update(fetch.stdout).digest('hex');
copy(archive,'101','/tmp/jarvis-release-verified.tar.gz');
console.log(remote('101',`set -euo pipefail
umask 027
printf '%s  %s\\n' '${sha}' /tmp/jarvis-release-verified.tar.gz | sha256sum --check -
target=/opt/jarvis/releases/${build}
[ ! -e "$target" ]
install -d -o root -g jarvis -m 0750 "$target"
tar -xzf /tmp/jarvis-release-verified.tar.gz --no-same-owner -C "$target"
chown -R root:jarvis "$target"
chmod -R g+rX "$target"
cd "$target"
export PATH=/opt/jarvis/node/bin:/usr/bin:/bin
npm ci --omit=dev --no-audit --no-fund
chgrp -R jarvis "$target"
chmod -R g+rX "$target"
`));
for(const id of ['112','101'])console.log(id,remote(id,`bash /opt/jarvis/releases/${build}/scripts/install-linux-services.sh ${id}\n`).trim());
await writeFile(join(root,'artifacts/linux-deployment/preparation.json'),JSON.stringify({status:'passed',build,at:new Date().toISOString(),nodes:['112','101'],nativeHttpsPort:3140,observerPort:3141,releaseSha256:sha,businessStarted:false,privateVault:vault},null,2));
console.log('Both nodes prepared; business remains stopped. Public CA saved for terminal setup.');
