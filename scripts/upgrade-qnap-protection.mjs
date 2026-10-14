import {readFile,writeFile} from 'node:fs/promises';
import {nas} from './managed-nas-client.mjs';
import {primary} from './managed-server-client.mjs';
import {validateEnvelope} from './cloud-node-relay.mjs';
const phase=process.argv[2]??'prepare',out='artifacts/nas-onboarding';
const metadata=JSON.parse(await readFile(out+'/onboarding.json','utf8'));
const protection=await readFile('scripts/qnap-protection-collector.py','utf8'),collector=await readFile('scripts/qnap-node-collector.py','utf8');
const header=`#!/bin/sh
set -eu
umask 077
base=/etc/config/jarvis-nas
test "$(id -u)" = 0
test "$(hostname)" = NAS9527
test ! -L "$base"
backup="$base/backups/extended-$(date -u +%Y%m%d-%H%M%S)"
mkdir "$backup"
chmod 700 "$backup"
`;
if(phase==='prepare'){
 const script=header+`
test -x /share/CACHEDEV1_DATA/.qpkg/HybridBackup/python/bin/python3
for f in protection-collector.py protection-collect.sh; do test ! -f "$base/$f" || cp "$base/$f" "$backup/$f"; done
cp /etc/config/crontab "$backup/crontab"
cat > "$base/protection-collector.py.next" <<'JARVIS_PYTHON_EOF'
${protection}
JARVIS_PYTHON_EOF
chown 0:0 "$base/protection-collector.py.next"
chmod 644 "$base/protection-collector.py.next"
mv "$base/protection-collector.py.next" "$base/protection-collector.py"
printf '%s\n' '#!/bin/sh' 'set -eu' 'exec /share/CACHEDEV1_DATA/.qpkg/HybridBackup/python/bin/python3 -I /etc/config/jarvis-nas/protection-collector.py' > "$base/protection-collect.sh.next"
chown 0:0 "$base/protection-collect.sh.next"
chmod 755 "$base/protection-collect.sh.next"
mv "$base/protection-collect.sh.next" "$base/protection-collect.sh"
/bin/sh "$base/protection-collect.sh"
line='* * * * * /bin/sh /etc/config/jarvis-nas/protection-collect.sh >/dev/null 2>&1 # jarvis-nas-protection'
if ! grep -F "$line" /etc/config/crontab >/dev/null; then
 grep -v '# jarvis-nas-protection$' /etc/config/crontab > "$base/crontab.next"
 printf '%s\n' "$line" >> "$base/crontab.next"
 cat "$base/crontab.next" > /etc/config/crontab
 rm "$base/crontab.next"
fi
/usr/bin/crontab /etc/config/crontab
cat "$base/protection.json"
`;
 await writeFile(out+'/install-protection.sh',script);const cache=JSON.parse(await nas(out+'/install-protection.sh',true));await writeFile(out+'/protection-preflight.json',JSON.stringify(cache,null,2));
 console.log(JSON.stringify({prepared:true,externalVolumes:cache.externalVolumes?.length,externalDisks:cache.externalDisks?.length,temperatures:cache.diskHealth.map(h=>({slot:h.slot,state:h.state,temperatureC:h.temperatureC})),ups:cache.ups,snapshots:cache.snapshots,hbsJobs:cache.backups?.jobs.length,errors:cache.collectionErrors}));
}else if(phase==='activate'){
 const script=header+`
cp "$base/collector.sh" "$backup/collector.sh"
if test ! -f "$base/collector-legacy.sh"; then cp "$base/collector.sh" "$base/collector-legacy.sh"; fi
cat > "$base/node-collector.py.next" <<'JARVIS_PYTHON_EOF'
${collector}
JARVIS_PYTHON_EOF
chown 0:0 "$base/node-collector.py.next"
chmod 644 "$base/node-collector.py.next"
mv "$base/node-collector.py.next" "$base/node-collector.py"
printf '%s\n' '#!/bin/sh' 'set -eu' 'if test -x /share/CACHEDEV1_DATA/.qpkg/HybridBackup/python/bin/python3; then' ' exec /share/CACHEDEV1_DATA/.qpkg/HybridBackup/python/bin/python3 -I /etc/config/jarvis-nas/node-collector.py' 'fi' 'exec /bin/sh /etc/config/jarvis-nas/collector-legacy.sh' > "$base/collector.sh.next"
chown 0:0 "$base/collector.sh.next" "$base/collector-legacy.sh"
chmod 755 "$base/collector.sh.next" "$base/collector-legacy.sh"
mv "$base/collector.sh.next" "$base/collector.sh"
printf 'ACTIVATED\n'
`;
 await writeFile(out+'/activate-protection.sh',script);await nas(out+'/activate-protection.sh',true);
 const item=JSON.parse(primary(`import subprocess
r=subprocess.run(['runuser','-u','jarvis-cloud-relay','--','ssh','-F','/etc/jarvis-cloud-relay/ssh_config','node-nas','id'],capture_output=True,text=True,check=True,timeout=20)
print(r.stdout)
`));validateEnvelope(metadata,item);await writeFile(out+'/signed-extended-snapshot.json',JSON.stringify(item,null,2));
 console.log(JSON.stringify({activated:true,signatureValid:true,externalVolumes:item.body.storage.externalVolumes?.length,ups:item.body.storage.ups?.model}));
}else throw Error('Expected prepare or activate');
