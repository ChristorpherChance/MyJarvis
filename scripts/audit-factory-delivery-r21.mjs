import {remote,lanProfile,python} from './managed-server-client.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const root='/home/superopen/All-Projects/msf';
const query=process.argv[2]??'inventory';
const requested=process.argv.slice(3);
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({root,query,requested},`import pathlib,subprocess,json,hashlib,re
r=pathlib.Path(p['root'])
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip()
paths=subprocess.check_output(['git','-c','core.quotepath=false','ls-files','-z'],cwd=r).decode().split('\\x00')
paths=[x for x in paths if x]
rows=[]
if p['query']=='inventory':
 rows=[x for x in paths if x.startswith(('apps/server/src/modules/req/','apps/server/src/modules/release/','apps/server/src/modules/material/','apps/web/src/pages/req/','apps/web/src/pages/release/','apps/web/src/pages/material/')) or x.startswith('doc/product-design/') and x.endswith('.md')]
elif p['query']=='delivery-inventory':
 rows=[x for x in paths if x.startswith(('apps/server/src/modules/acceptance/','apps/server/src/modules/test/','apps/server/src/modules/dev/','apps/web/src/pages/test/','apps/web/src/pages/acceptance/')) or any(t in x.lower() for t in ['backup','readme','license','delivery','packaging','install','deploy']) or x.startswith('apps/server/src/modules/platform/') and not x.endswith('test.ts')]
else:
 for name in p['requested']:
  if name not in paths or name.endswith(('.env','.zip','.png')) or name.startswith(('.secrets/','.jarvis/')):raise RuntimeError('PUBLIC_SOURCE_ONLY')
  f=r/name;raw=f.read_bytes();lines=raw.decode('utf8').splitlines()
  row={'path':name,'sha256':hashlib.sha256(raw).hexdigest(),'lineCount':len(lines)}
  if p['query']=='files':row['lines']=[{'line':i+1,'text':s} for i,s in enumerate(lines)]
  elif p['query']=='matches':
   terms=r'导出|下载|交付|安装|迁移|用户|运维|培训|套件|需求版本|原始|资料|解析|OCR|附件|子页面|独立|高保真|手工|客户|export|download|deliver|artifact|zip|format|bundle|migration|version|mock|TODO|simulate|stub'
   hit=set()
   for i,s in enumerate(lines):
    if re.search(terms,s,re.I):hit.update(range(max(0,i-2),min(len(lines),i+3)))
   row['lines']=[{'line':i+1,'text':lines[i]} for i in sorted(hit)]
  rows.append(row)
print(json.dumps({'readOnly':True,'head':head,'query':p['query'],'rows':rows},ensure_ascii=False))
`)));
if(process.env.R21_PUBLIC_OUTPUT){await mkdir('artifacts/software-factory/goals-r21',{recursive:true});await writeFile(process.env.R21_PUBLIC_OUTPUT,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({file:process.env.R21_PUBLIC_OUTPUT,head:result.head,files:result.rows.map(x=>typeof x==='string'?x:{path:x.path,sha256:x.sha256,lineCount:x.lineCount})}));}
else console.log(JSON.stringify(result,null,2));
