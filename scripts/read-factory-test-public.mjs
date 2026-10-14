import {remote,lanProfile,python} from './managed-server-client.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const files=process.argv.slice(2);if(!files.length||files.some(p=>!/^apps\/server\/(?:src|migrations)\/[\w./-]+\.(?:ts|sql)$/.test(p)||p.includes('..')))throw Error('PUBLIC_TEST_PATH_REQUIRED');
const data=JSON.parse(remote(lanProfile,'jarvis-101',python({files},`from pathlib import Path
import json
root=Path('/home/superopen/All-Projects/msf')
out=[]
for name in p['files']:
 q=root/name
 if not q.is_file() or q.is_symlink() or q.stat().st_size>150000:out.append({'path':name,'missing':True});continue
 out.append({'path':name,'text':q.read_text()})
print(json.dumps(out))
`),true));
await mkdir('artifacts/software-factory/full-test/public-source',{recursive:true});
for(const item of data){if(item.text)await writeFile('artifacts/software-factory/full-test/public-source/'+item.path.replaceAll('/','__'),item.text);console.log(JSON.stringify(item));}
