/** Read-only verification of the deployed public guide and every allowed local reference. */
import {writeFile} from 'node:fs/promises';
import {primary,python} from './managed-server-client.mjs';
const slug=process.env.JARVIS_GUIDE_OBSERVATION??'r22-5';
if(!/^[a-z0-9-]{1,60}$/.test(slug))throw Error('INVALID_GUIDE_OBSERVATION');
const result=JSON.parse(primary(python({},`import json,hashlib,datetime
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote,urlsplit
root=Path('/opt/jarvis/current').resolve()
main=root/'docs'/'软件工厂无人值守交付总纲.html'
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[]
 def handle_starttag(self,tag,attrs):
  if tag=='a':
   for k,v in attrs:
    if k=='href' and v:self.links.append(v)
html=main.read_text(encoding='utf-8');parser=Links();parser.feed(html)
refs={}
for href in parser.links:
 parts=urlsplit(href)
 if parts.scheme or parts.netloc or not parts.path:continue
 target=(main.parent/unquote(parts.path)).resolve()
 try:relative=target.relative_to(root).as_posix()
 except ValueError:raise RuntimeError('PUBLIC_GUIDE_REFERENCE_ESCAPES_RELEASE')
 allowed=(relative.startswith('docs/') and target.suffix in ['.md','.html']) or (relative.startswith('artifacts/software-factory/') and target.suffix=='.json')
 if not allowed:raise RuntimeError('PUBLIC_GUIDE_REFERENCE_OUTSIDE_PUBLIC_ALLOWLIST')
 refs[relative]={'path':relative,'exists':target.is_file(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest() if target.is_file() else None}
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'release':root.name,'mainHTMLSHA256':hashlib.sha256(main.read_bytes()).hexdigest(),'mainMDSHA256':hashlib.sha256(main.with_suffix('.md').read_bytes()).hexdigest(),'directReferences':list(refs.values()),'allReferencesPresent':all(r['exists'] for r in refs.values()),'readOnly':True,'modelCalls':0,'productAccepted':False}
print(json.dumps(result))
`)));
await writeFile(`artifacts/software-factory/autonomy-r22/guide-live-${slug}.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({release:result.release,references:result.directReferences.length,allReferencesPresent:result.allReferencesPresent,missing:result.directReferences.filter(r=>!r.exists).map(r=>r.path)}));
