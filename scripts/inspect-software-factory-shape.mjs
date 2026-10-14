/** Fixed read-only metadata inspection, no body/prompts/secrets are emitted. */
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const report=JSON.parse(remote(lanProfile,'jarvis-101',python({},`import json,urllib.request,re
def get(path):
 with urllib.request.urlopen('http://127.0.0.1:8080'+path,timeout=10) as r:
  raw=r.read(1048577)
  if len(raw)>1048576:raise RuntimeError('UPSTREAM_RESPONSE_LIMIT')
  return json.loads(raw)
def shape(v,depth=0):
 if isinstance(v,dict):return {'type':'object','keys':list(v.keys()),'fields':{k:shape(x,depth+1) for k,x in v.items()} if depth<2 else {k:type(x).__name__ for k,x in v.items()}}
 if isinstance(v,list):return {'type':'array','length':len(v),'first':shape(v[0],depth+1) if v and depth<2 else None}
 return {'type':type(v).__name__}
rows=get('/api/projects');ids=[r.get('id') for r in rows if isinstance(r,dict)]
guid=re.compile('^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')
rfc=re.compile('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
bad=[x for x in ids if isinstance(x,str) and not rfc.fullmatch(x)]
pid=next(x for x in ids if isinstance(x,str) and guid.fullmatch(x))
out={'projectCount':len(rows),'guidShapeCount':sum(isinstance(x,str) and bool(guid.fullmatch(x)) for x in ids),'legacyRfcMismatchIds':bad,'sampleProjectId':pid,'sections':{}}
for key,path in {'project':'/api/projects/'+pid,'tasks':'dev/tasks','autopilot':'dev/autopilot','build':'dev/build','selftestReports':'dev/selftest/reports','acceptanceBatches':'acceptance/batches','defects':'acceptance/defects','decisions':'acceptance/decisions','usage':'ai/usage?limit=1'}.items():
 try:out['sections'][key]=shape(get(path if path.startswith('/') else '/api/v1/projects/'+pid+'/'+path))
 except urllib.error.HTTPError as e:out['sections'][key]={'httpStatus':e.code}
print(json.dumps(out))
`),true));
await mkdir('artifacts/software-factory/node',{recursive:true});await writeFile('artifacts/software-factory/node/actual-upstream-shape.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
