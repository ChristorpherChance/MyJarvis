/** Bounded read-only public asset checks; anonymous bearer stays in RAM. */
import {writeFile} from 'node:fs/promises';
import {remote,cloudProfile,python} from './managed-server-client.mjs';
const digest='sha256:bf8527eb54c3680e728d5b4b383a8ba730d72dae7236fbc8dff97ed6b224a731';
const asset='https://cdn.playwright.dev/builds/cft/151.0.7922.34/linux64/chrome-headless-shell-linux64.zip';
const observation=JSON.parse(remote(cloudProfile,'jarvis-jp',python({digest,asset},String.raw`import json,urllib.request,urllib.error,time,datetime
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'alias':'jarvis-jp','readOnly':True,'credentialsExported':False,'digest':p['digest'],'asset':p['asset']}
try:
 with urllib.request.urlopen('https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/alpine:pull',timeout=8) as r:token=json.load(r)['token']
 req=urllib.request.Request('https://registry-1.docker.io/v2/library/alpine/manifests/'+p['digest'],headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'})
 try:
  with urllib.request.urlopen(req,timeout=8) as r:out['registryStatus']=r.status;out['registryDigest']=r.headers.get('Docker-Content-Digest')
 except urllib.error.HTTPError as e:
  out['registryStatus']=e.code
  try:out['registryErrorCodes']=[x.get('code') for x in json.loads(e.read(8192)).get('errors',[]) if isinstance(x.get('code'),str) and len(x['code'])<80]
  except:out['registryErrorJSON']=False
except Exception as e:out['registryFailureKind']=type(e).__name__
try:
 started=time.monotonic();req=urllib.request.Request(p['asset'],headers={'Range':'bytes=0-131071'})
 with urllib.request.urlopen(req,timeout=10) as r:
  sample=r.read(131072);out['assetStatus']=r.status;out['sampleBytes']=len(sample);out['contentRange']=r.headers.get('Content-Range');out['etag']=r.headers.get('ETag');out['sampleSeconds']=round(time.monotonic()-started,3)
except Exception as e:out['assetFailureKind']=type(e).__name__
print(json.dumps(out))
`),false));
await writeFile('artifacts/software-factory/full-test/public-download-check.json',JSON.stringify(observation,null,2)+'\n');
console.log(JSON.stringify(observation));
