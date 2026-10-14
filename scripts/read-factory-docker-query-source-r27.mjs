/** Fixed public SDK source extraction from this exact completed attempt. Read-only. */
import {readFile,open} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {authContractDiagnosisProgram,diagnoseAuthContractR27} from './diagnose-factory-auth-contract-r27.mjs';
import {withR27EvidencePlatform,need,safeR27EvidenceFailure} from './factory-evidence-read-r27.mjs';import {sha} from './run-factory-main-repair-r26.mjs';
const substitutions=String.raw`
sdk_sources=[]
def public_dependency(q):
 ancestor=run_root/p['attempt'];trusted(ancestor);need(q.is_relative_to(ancestor),'R27_EVIDENCE_SDK_PATH_INVALID')
 for part in [q,*q.parents]:
  if part==ancestor:break
  s=part.lstat();need(not stat.S_ISLNK(s.st_mode),'R27_EVIDENCE_SDK_LINK_REJECTED')
 fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  before=os.fstat(fd);need(stat.S_ISREG(before.st_mode) and before.st_uid in [0,1000] and 0<before.st_size<=1048576,'R27_EVIDENCE_SDK_FILE_INVALID')
  data=b''
  while len(data)<=1048576:
   chunk=os.read(fd,min(65536,1048577-len(data)))
   if not chunk:break
   data+=chunk
  need(len(data)==before.st_size and key(before)==key(os.fstat(fd)) and key(before)==key(q.lstat()),'R27_EVIDENCE_SDK_FILE_CHANGED');return data
 finally:os.close(fd)
for tree in ['work','installed']:
 for package,version,file,signature in [('dockerode','5.0.1','docker.js','Docker.prototype.listImages = function'),('dockerode','5.0.1','docker.js','Docker.prototype.createContainer = function'),('dockerode','5.0.1','docker.js','Docker.prototype.getContainer = function'),('dockerode','5.0.1','container.js','Container = function'),('dockerode','5.0.1','container.js','Container.prototype.start = function'),('dockerode','5.0.1','container.js','Container.prototype.wait = function'),('dockerode','5.0.1','container.js','Container.prototype.logs = function'),('dockerode','5.0.1','container.js','Container.prototype.remove = function'),('dockerode','5.0.1','container.js','Container.prototype.kill = function'),('dockerode','5.0.1','util.js','processArgs = function'),('dockerode','5.0.1','util.js','extend = function'),('docker-modem','5.0.7','modem.js','Modem.prototype.buildQuerystring = function'),('docker-modem','5.0.7','modem.js','Modem.prototype.dial = function')]:
  q=run_root/p['attempt']/tree/'source'/'node_modules'/'.pnpm'/(package+'@'+version)/'node_modules'/package/'lib'/file
  try:raw=public_dependency(q)
  except FileNotFoundError:
   sdk_sources.append({'tree':tree,'package':package,'version':version,'file':file,'present':False});continue
  text=raw.decode('utf8');pos=text.find(signature);need(pos>=0,'R27_EVIDENCE_SDK_PUBLIC_FUNCTION_MISSING');end=re.search(r'\n};',text[pos:]);need(end is not None and end.end()<=16384,'R27_EVIDENCE_SDK_PUBLIC_FUNCTION_BOUND_INVALID');fragment=text[pos:pos+end.end()]
  sdk_sources.append({'tree':tree,'package':package,'version':version,'file':file,'present':True,'fileSHA256':hashlib.sha256(raw).hexdigest(),'functionSHA256':hashlib.sha256(fragment.encode()).hexdigest(),'publicFunctionSource':fragment,'querystringIsNodeCore':bool(re.search(r"querystring\s*=\s*require\(['\x22]querystring['\x22]\)",text)),'sourceKind':'public-installed-sdk-code'})
`;
let result;try{need(process.argv.length===2,'R27_EVIDENCE_SDK_FIXED_ARGUMENTS_ONLY');result=await withR27EvidencePlatform(d=>diagnoseAuthContractR27({...d,readRoot:async(p,program)=>{need(program===authContractDiagnosisProgram(),'R27_EVIDENCE_SDK_PARENT_PROGRAM_CHANGED');const anchor='second=state();need(first==second';need(program.split(anchor).length===2,'R27_EVIDENCE_SDK_ANCHOR_CHANGED');program=program.replace(anchor,substitutions+'\n'+anchor).replace("'authContractDiagnosis':auth_diagnosis,","'authContractDiagnosis':auth_diagnosis,'sdkPublicSources':sdk_sources,");const h=await d.readRoot(p,program);h.authContractDiagnosis.sdkPublicSources=h.sdkPublicSources;return h;}}));result.kind='software-factory-r27-public-sdk-query-source';}catch(e){result=safeR27EvidenceFailure(e,'software-factory-r27-public-sdk-query-source');process.exitCode=1;}
const path='artifacts/software-factory/acceptance-r27/public-sdk-query-source-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(result,null,2)+'\n',f=await open(path,'wx',0o644);try{await f.writeFile(raw);await f.sync();}finally{await f.close();}console.log(JSON.stringify({path,sha256:sha(raw),failed:result.failed??false,sources:result.diagnosis?.sdkPublicSources??null,errorCode:result.errorCode??null}));
