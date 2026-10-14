import {remote,lanProfile} from './managed-server-client.mjs';
import {writeFile} from 'node:fs/promises';
const output=remote(lanProfile,'jarvis-101',String.raw`import json,subprocess,os
from pathlib import Path
source=Path('/home/superopen/All-Projects/msf')
config=json.loads(Path('/var/lib/jarvis-development/101/config.json').read_text())
template=next(x for x in config['templates'] if x['id']=='msf-101-claude')
result={'template':template,'workspaceExists':Path('/home/superopen/All-Projects/msf-jarvis-autonomy-r22').exists(),'packages':{},'tools':{}}
for file in ['package.json','apps/server/package.json','apps/web/package.json','packages/shared/package.json']:
 value=json.loads((source/file).read_text());result['packages'][file]={'scripts':value.get('scripts',{}),'packageManager':value.get('packageManager')}
for path in ['/opt/jarvis-development/node/bin/node','/home/superopen/opt/node22/bin/node','/home/superopen/opt/node22/lib/node_modules/corepack/dist/pnpm.js','/home/superopen/opt/node22/bin/pnpm','/opt/jarvis-development/software-factory/factory-full-test-runner.py','/usr/local/libexec/jarvis-msf-validation']:
 result['tools'][path]={'exists':Path(path).exists(),'realpath':os.path.realpath(path)}
print(json.dumps(result))
`,true);
await writeFile('artifacts/software-factory/autonomy-r22/bootstrap-inspection.json',JSON.stringify(JSON.parse(output),null,2)+'\n');console.log(output);
