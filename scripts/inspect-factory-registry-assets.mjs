/** Read-only official registry reachability from already-authorized cloud hosts. */
import {writeFile,mkdir} from 'node:fs/promises';
import {remote,cloudProfile,python} from './managed-server-client.mjs';
const digest='sha256:bf8527eb54c3680e728d5b4b383a8ba730d72dae7236fbc8dff97ed6b224a731';
const observations=[];
for(const [alias,root] of [['jarvis-jp',false],['jarvis-gz',true]]){
 try{observations.push(JSON.parse(remote(cloudProfile,alias,python({alias,digest},String.raw`import json,urllib.request,urllib.error,subprocess,os,datetime
result={'alias':p['alias'],'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'imagesPulled':False,'officialDigest':p['digest'],'credentialsExported':False}
try:
 with urllib.request.urlopen('https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/alpine:pull',timeout=10) as r:token=json.load(r).get('token')
 result['anonymousAuthorizationAvailable']=isinstance(token,str) and len(token)>0
 if token:
  req=urllib.request.Request('https://registry-1.docker.io/v2/library/alpine/manifests/'+p['digest'],headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'})
  with urllib.request.urlopen(req,timeout=12) as r:
   raw=r.read(2*1024*1024);doc=json.loads(raw)
   result['registryHTTPStatus']=r.status;result['contentType']=r.headers.get('Content-Type');result['reportedDigest']=r.headers.get('Docker-Content-Digest');result['manifestMediaType']=doc.get('mediaType');result['platforms']=[x.get('platform') for x in doc.get('manifests',[])]
except urllib.error.HTTPError as e:result['registryHTTPStatus']=e.code
except Exception as e:result['registryFailureKind']=type(e).__name__
try:
 r=subprocess.run(['/usr/bin/docker','--version'],capture_output=True,text=True,timeout=5);result['dockerAvailable']=r.returncode==0;result['dockerVersion']=r.stdout.strip()[:160]
except Exception:result['dockerAvailable']=False
v=os.statvfs('/tmp');result['temporaryDiskAvailableBytes']=v.f_bavail*v.f_frsize
print(json.dumps(result))
`),root)));}catch{observations.push({alias,readOnly:true,inspectionFailed:true,credentialsExported:false});}
}
await mkdir('artifacts/software-factory/full-test',{recursive:true});
await writeFile('artifacts/software-factory/full-test/registry-connectivity.json',JSON.stringify({digest,observations},null,2)+'\n');
console.log(JSON.stringify({digest,observations}));
