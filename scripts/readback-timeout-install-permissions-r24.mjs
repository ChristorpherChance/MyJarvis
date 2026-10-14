import {remote,lanProfile,python} from './managed-server-client.mjs';
console.log(remote(lanProfile,'jarvis-101',python({},String.raw`import json,stat
from pathlib import Path
names=['/var/lib/jarvis-development','/var/lib/jarvis-development/101','/var/lib/jarvis-development/101/config.json','/var/lib/jarvis-control','/var/lib/jarvis-control/factory-validator-upgrades-r24','/opt/jarvis-development/software-factory/project-autonomy-fa01-collector.mjs']
rows=[]
for name in names:
 s=Path(name).lstat();rows.append({'path':name,'uid':s.st_uid,'gid':s.st_gid,'mode':oct(stat.S_IMODE(s.st_mode)),'symlink':stat.S_ISLNK(s.st_mode),'nlink':s.st_nlink})
print(json.dumps(rows))
`),true));
