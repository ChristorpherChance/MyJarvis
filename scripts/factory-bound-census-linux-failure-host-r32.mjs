/** Fixed failed-attempt observer generator. Import and generation have no IO or mutation. */
import {createHash} from 'node:crypto';
import {boundProcessCensusR32NativeProgram} from './factory-bound-process-census-r32.mjs';
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex'),need=(v,c)=>{if(!v)throw Error(c)};
const N='3e126ddb3cc26d178a7533307f6ba0b1',U='jarvis-bound-census-r32-'+N+'.service';
export const boundCensusLinuxFailureHostR32Scope=Object.freeze({schemaVersion:1,kind:'r32-bound-census-linux-failure-fixed-scope',nonce:N,phase:'native',root:'/var/lib/jarvis-bound-census-linux-r32/'+N,unit:U,cgroup:'/system.slice/'+U,
 boot:'328726a0-5495-4892-b0a6-2fa9de26242e',invocationId:'2640142bacca457aa169cc9ad01509d3',owner:{pid:2851903,startTicks:'30909870',procDevice:160,procInode:53678916},fixture:{pid:2851905,ppid:2851903,startTicks:'30909878',procDevice:160,procInode:53678926},tinyChildIdentity:null,
 reportSHA256:'1ee4da5e210ecb2817baf7b4c67e5218658dad0d0592eea770e274aa8a6758c9',actualCheckSHA256:'1ee4da5e210ecb2817baf7b4c67e5218658dad0d0592eea770e274aa8a6758c9',generatedNativeSHA256:'b357b2d4afaab2938a5e226d42ffbe6d12d3757f0973488ad696108761a36a78',
 records:{'control/owner.py':{sha256:'5983b2ab79a647582a7081d4401931e6c3adbaeeed85bd2f6d1b84eecf91da90',bytes:null},'control/fixture.py':{sha256:'60a9145a1a8619dc5578345ca7def095bdeaa0ba1ca91feea33443e61d2629b7',bytes:null},'control/generated.py':{sha256:'b357b2d4afaab2938a5e226d42ffbe6d12d3757f0973488ad696108761a36a78',bytes:null},'control/activation.json':{sha256:'759e810bb1401864cb3777cfbf7481c0665f08db9efca35588b32367f039acb8',bytes:null},'control/once.json':{sha256:'c64dde1c7c221e67f2361544fd54bf89528fc4c0b0f4f208ab9fc204bed9c3ff',bytes:null},'unit-proof.json':{sha256:'c59ff0ca0a362761279bf0662615cbf866de7e6222ac916b03e256a23d67e222',bytes:null},'work/owner.json':{sha256:'7d1b3aeb156dca053a7000c9c66d1ea815edd17ed2a385964b432b8e4d6d02f1',bytes:961},'work/fixture-process.json':{sha256:'5573f8702e441f43be5da2953a933370a78b9c3aa72c3ed7f5203206b453921b',bytes:409},'work/result.json':{sha256:'62dff208afbead615078c2773409952f476842113c3851d6c68f18b1e09c37b0',bytes:2787},'work/stopped.json':{sha256:'4b86543bcd0b60c5cdbdd4968ed3ef54a224f62d3eb78d4770ae4607b249a0c2',bytes:501},'work/fixture.stdout.json':{sha256:'5b3203138a0dc6aba32f83e2d6e4f26214815b9978dec4c8c2245564e97c4355',bytes:252}}});
const S=boundCensusLinuxFailureHostR32Scope;
function freeze(v){for(const x of Object.values(v))if(x&&typeof x==='object'){freeze(x);Object.freeze(x)}}freeze(S);
export function boundCensusLinuxFailureHostR32Program(){
 const native=boundProcessCensusR32NativeProgram();need(sha(native)===S.generatedNativeSHA256,'R32_BOUND_FAILURE_ORIGINAL_GENERATED_CHANGED');
 const recordAt=native.indexOf('CLOSED_READ_SUBPHASES='),censusAt=native.indexOf('def census():'),end=native.indexOf('def workspace_sockets():',censusAt);need(recordAt>0&&censusAt>recordAt&&end>censusAt,'R32_BOUND_FAILURE_DEFINITION_BOUNDARY_CHANGED');
 const shared=native.slice(recordAt,censusAt);let census=native.slice(censusAt,end);
 const start=" unit=unit_state();boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip();need(re.fullmatch('[a-f0-9-]{36}',boot),'R29_CLEANUP_BOOT_ID_INVALID')";
 const from="  need(unit['pid'] in records,'R29_CLEANUP_MAIN_PID_UNREADABLE')",last=' finally:\n  close_errors=[]';need(census.split(start).length===2&&census.split(from).length===2&&census.split(last).length===2,'R32_BOUND_FAILURE_CENSUS_ANCHOR_CHANGED');
 census=census.replace(start," boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip();need(boot==S['boot'],'R32_BOUND_FAILURE_BOOT_CHANGED')");
 const at=census.indexOf(from),close=census.indexOf(last,at);
 census=census.slice(0,at)+String.raw`  ancestry=dict(records)
  for pid,e in exits.items():
   if e['processIdentity'] is not None and 'ppid' in e['processIdentity']:ancestry[pid]=e['processIdentity']
  descendants=set();front={S['owner']['pid'],S['fixture']['pid']}
  while front:
   next_set={pid for pid,v in ancestry.items() if v['ppid'] in front} - descendants;descendants|=next_set;front=next_set
  descendants&=set(records)
  cgroup={pid for pid,v in records.items() if any(x==S['cgroup'] or x.startswith(S['cgroup']+'/') for x in v['cgroups'])}
  workspace={pid for pid,v in records.items() if v['workspaceRelated']};known=set(records)&{S['owner']['pid'],S['fixture']['pid']};related=sorted(descendants|cgroup|workspace|known)
  def public(v):return {k:v[k] for k in ['pid','ppid','startTicks','boot','procDevice','procInode','uid','state','cwdSHA256','exeSHA256','argvSHA256']}
  return {'fullProcScan':True,'pidfdSupported':True,'total':len(listed),'inspected':len(records),'provenExited':len(exits),'incompleteCount':len(failures),'listedPIDs':sorted(listed),'inspectedPIDs':sorted(records),'incomplete':[failures[x] for x in sorted(failures)],'exitedDuringScan':[exits[x] for x in sorted(exits)],'relatedCount':len(related),'relatedProcesses':[public(records[x]) for x in related],'namespaceFD':{'relatedCount':len(workspace),'complete':not failures and not workspace,'classification':'union-cwd-exe-argv-fd'},'ownerCgroupRelatedCount':len(cgroup),'complete':not failures and not related}
`+census.slice(close);
 return String.raw`import base64,datetime,errno,hashlib,json,os,re,select,signal,stat,subprocess
from pathlib import Path
S=json.loads(${JSON.stringify(JSON.stringify(S))})
def need(v,c):
 if not v:raise RuntimeError(c)
def compact(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else str(v).encode()).hexdigest()
def key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
need(os.getresuid()==(0,0,0) and os.getresgid()==(0,0,0) and compact(p)==compact(S),'R32_BOUND_FAILURE_SCOPE_CHANGED')
signal.signal(signal.SIGALRM,lambda *_:(_ for _ in ()).throw(RuntimeError('R32_BOUND_FAILURE_TIME_LIMIT')));signal.alarm(60)
def in_workspace(v):
 if not isinstance(v,str):return False
 v=v.removesuffix(' (deleted)');return v==S['root'] or v.startswith(S['root']+'/')
def argv_workspace(v):return in_workspace(v) or ('='+S['root']) in v and in_workspace(v.split('=',1)[1])
def held(path):
 fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  for name in Path(path).parts[1:]:
   before=os.stat(name,dir_fd=fd,follow_symlinks=False);need(stat.S_ISDIR(before.st_mode) and before.st_uid==before.st_gid==0 and not before.st_mode&0o022,'R32_BOUND_FAILURE_ANCESTOR_UNTRUSTED');child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
   try:need(key(before)==key(os.fstat(child)),'R32_BOUND_FAILURE_ANCESTOR_CHANGED')
   except BaseException:os.close(child);raise
   os.close(fd);fd=child
  return fd
 except BaseException:os.close(fd);raise
def read_file(parent,name,uid,mode):
 s=os.stat(name,dir_fd=parent,follow_symlinks=False);need(stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==uid and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==mode and 0<=s.st_size<=1048576,'R32_BOUND_FAILURE_RECORD_UNTRUSTED');f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
 try:
  need(key(s)==key(os.fstat(f)),'R32_BOUND_FAILURE_RECORD_CHANGED');raw=b''
  while len(raw)<=s.st_size:
   block=os.read(f,min(65536,s.st_size+1-len(raw)))
   if not block:break
   raw+=block
  need(len(raw)==s.st_size and key(s)==key(os.fstat(f))==key(os.stat(name,dir_fd=parent,follow_symlinks=False)),'R32_BOUND_FAILURE_RECORD_CHANGED');return raw,key(s)
 finally:os.close(f)
def namespace_read():
 root=held(S['root']);metadata={};rows={};sockets=[]
 try:
  initial=key(os.fstat(root));need(stat.S_IMODE(os.fstat(root).st_mode)==0o711,'R32_BOUND_FAILURE_NAMESPACE_MODE');names=sorted(os.listdir(root));need(names==['control','unit-proof.json','work'],'R32_BOUND_FAILURE_NAMESPACE_ENTRIES_CHANGED')
  for dirname,uid,mode,filemode in [('control',0,0o555,0o444),('work',1000,0o700,0o600)]:
   s=os.stat(dirname,dir_fd=root,follow_symlinks=False);need(stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==uid and stat.S_IMODE(s.st_mode)==mode,'R32_BOUND_FAILURE_DIRECTORY_UNTRUSTED');d=os.open(dirname,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root)
   try:
    before=key(os.fstat(d));need(before==key(s),'R32_BOUND_FAILURE_DIRECTORY_CHANGED');entries=sorted(os.listdir(d));expected=sorted(rel.split('/')[1] for rel in S['records'] if rel.startswith(dirname+'/'));need(entries==expected,'R32_BOUND_FAILURE_RECORD_SET_CHANGED');metadata[dirname]=before
    for name in entries:
     rel=dirname+'/'+name;raw,m=read_file(d,name,uid,filemode);expected=S['records'][rel];need(digest(raw)==expected['sha256'] and (expected['bytes'] is None or len(raw)==expected['bytes']),'R32_BOUND_FAILURE_ORIGINAL_RECORD_CHANGED');rows[rel]={'sha256':digest(raw),'bytes':len(raw),'metadata':m,'base64':base64.b64encode(raw).decode(),'readComplete':True}
    need(before==key(os.fstat(d))==key(os.stat(dirname,dir_fd=root,follow_symlinks=False)) and entries==sorted(os.listdir(d)),'R32_BOUND_FAILURE_DIRECTORY_CHANGED')
   finally:os.close(d)
  raw,m=read_file(root,'unit-proof.json',0,0o444);need(digest(raw)==S['records']['unit-proof.json']['sha256'],'R32_BOUND_FAILURE_UNIT_PROOF_CHANGED');rows['unit-proof.json']={'sha256':digest(raw),'bytes':len(raw),'metadata':m,'base64':base64.b64encode(raw).decode(),'readComplete':True}
  need(initial==key(os.fstat(root)) and names==sorted(os.listdir(root)),'R32_BOUND_FAILURE_NAMESPACE_CHANGED');return rows,{'root':initial,'directories':metadata}
 finally:os.close(root)
def verify_records(rows):
 at=lambda rel:json.loads(base64.b64decode(rows[rel]['base64'],validate=True));owner=at('work/owner.json');fixture=at('work/fixture-process.json');result=at('work/result.json');stdout=at('work/fixture.stdout.json');stopped=at('work/stopped.json');proof=at('unit-proof.json')
 need(all(owner[k]==v for k,v in S['owner'].items()) and owner['boot']==S['boot'] and owner['invocationId']==S['invocationId'] and owner['unit']==S['unit'] and owner['controlGroup']==S['cgroup'],'R32_BOUND_FAILURE_OWNER_RECORD_CHANGED')
 need(all(fixture[k]==v for k,v in S['fixture'].items()) and fixture['boot']==S['boot'] and fixture['controlGroup']==S['cgroup'] and result['fixtureProcessIdentity']==fixture and result['owner']==owner,'R32_BOUND_FAILURE_FIXTURE_RECORD_CHANGED')
 need(result['nonce']==stopped['nonce']==proof['nonce']==S['nonce'] and result['phase']==S['phase'] and result['fixtureResult']==stdout and stdout['fixtureQualified']is False and stdout['errorCode']=='R32_FIXTURE_INCOMPLETE' and stdout['errno']==2 and result['fixtureExitCode']==1 and result['fixturePIDFDClosed']is True and result['fixtureEmergencyStopUsed']is False and stopped['serviceResult']=='exit-code' and stopped['exitStatus']=='1' and stopped['invocationId']==proof['invocationId']==S['invocationId'],'R32_BOUND_FAILURE_HISTORY_CHANGED')
 c=proof['configuration'];need(proof['kind']=='r32-bound-census-root-unit-proof' and proof['unit']==S['unit'] and c['uid']==c['gid']==1000 and c['runtimeMaxSec']==80 and c['stopTimeoutSec']==10 and c['hardParentBoundSeconds']==90 and c['killMode']=='control-group' and c['killSignal']=='SIGKILL' and c['restart']=='no' and c['noNewPrivileges']is True and c['capabilitiesEmpty']is True and c['privateNetwork']is True,'R32_BOUND_FAILURE_UNIT_PROOF_UNVERIFIED')
 return True
def unit_read():
 fields=['Id','LoadState','ActiveState','SubState','MainPID','ControlGroup','InvocationID','Result','ExecMainCode','ExecMainStatus'];r=subprocess.run(['/usr/bin/systemctl','show',S['unit'],'--property='+','.join(fields)],capture_output=True,text=True,timeout=8,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'});need(r.returncode==0 and len(r.stdout)<=20000,'R32_BOUND_FAILURE_UNIT_READ_FAILED');pairs=[line.split('=',1) for line in r.stdout.splitlines() if '=' in line];v=dict(pairs);need(len(v)==len(pairs) and set(v)==set(fields) and v['Id']==S['unit'] and v['LoadState'] in ['loaded','not-found'] and v['ActiveState'] in ['active','activating','deactivating','inactive','failed'] and v['MainPID'].isdigit() and v['ControlGroup'] in ['',S['cgroup']] and v['InvocationID'] in ['',S['invocationId']],'R32_BOUND_FAILURE_UNIT_IDENTITY_CHANGED');return v
def known_process(v):
 need(Path('/proc/sys/kernel/random/boot_id').read_text().strip()==S['boot'],'R32_BOUND_FAILURE_BOOT_CHANGED')
 try:current=os.stat('/proc/'+str(v['pid']),follow_symlinks=False)
 except FileNotFoundError as error:
  need(error.errno==errno.ENOENT,'R32_BOUND_FAILURE_KNOWN_ABSENCE_UNKNOWN');return {'pid':v['pid'],'present':False,'identityMatches':None}
 return {'pid':v['pid'],'present':True,'identityMatches':current.st_dev==v['procDevice'] and current.st_ino==v['procInode']}
def cgroup_read():
 path=Path('/sys/fs/cgroup')/S['cgroup'].lstrip('/');parent=held(path.parent)
 try:
  try:os.stat(path.name,dir_fd=parent,follow_symlinks=False)
  except FileNotFoundError as error:
   need(error.errno==errno.ENOENT,'R32_BOUND_FAILURE_CGROUP_ABSENCE_UNKNOWN');return {'absent':True,'complete':True}
  return {'absent':False,'complete':False}
 finally:os.close(parent)
def sockets_read():
 # Namespace closure rejects every unrecorded path, including hidden filesystem sockets.
 lines=Path('/proc/net/unix').read_text().splitlines();need(lines and len(lines)<=100000,'R32_BOUND_FAILURE_SOCKET_LIST_UNKNOWN');hits=[]
 for line in lines[1:]:
  pieces=line.split(maxsplit=7);need(7<=len(pieces)<=8,'R32_BOUND_FAILURE_SOCKET_ROW_UNKNOWN')
  if len(pieces)==8 and in_workspace(pieces[7][1:] if pieces[7].startswith('@') else pieces[7]):hits.append(digest(pieces[7]))
 return {'count':len(hits),'complete':not hits,'pathSHA256':hits}
${shared}${census}
first_records,first_namespace=namespace_read();verify_records(first_records);first_unit=unit_read();first_known={k:known_process(S[k]) for k in ['owner','fixture']};first_cgroup=cgroup_read();first_sockets=sockets_read();first=census();second=census()
second_records,second_namespace=namespace_read();verify_records(second_records);second_unit=unit_read();second_known={k:known_process(S[k]) for k in ['owner','fixture']};second_cgroup=cgroup_read();second_sockets=sockets_read()
need(first_records==second_records and first_namespace==second_namespace,'R32_BOUND_FAILURE_NAMESPACE_CHANGED_AFTER');need(first_unit==second_unit and first_known==second_known and first_cgroup==second_cgroup and first_sockets==second_sockets,'R32_BOUND_FAILURE_PHYSICAL_FRAME_CHANGED')
known_absent=all(not v['present'] for v in second_known.values());stopped=second_unit['ActiveState'] in ['inactive','failed'] and second_unit['MainPID']=='0' and second_unit['ControlGroup']==''
complete=known_absent and stopped and second_cgroup['absent'] and first['complete'] and second['complete'] and second_sockets['complete']
signal.alarm(0)
print(json.dumps({'schemaVersion':1,'kind':'r32-bound-census-linux-failure-scope-host-observation','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'contextSHA256':digest(compact(S)),'scopeBinding':S,'records':second_records,'recordsStable':True,'namespaceStable':True,'namespaceMetadataSHA256':digest(compact(second_namespace)),'unitProofVerified':True,'knownProcesses':second_known,'unit':second_unit,'cgroup':second_cgroup,'processScans':[first,second],'sockets':second_sockets,'namespaceFD':{'relatedCount':first['namespaceFD']['relatedCount']+second['namespaceFD']['relatedCount'],'complete':first['namespaceFD']['complete'] and second['namespaceFD']['complete']},'cleanupScopeComplete':bool(complete),'failureScope':True,'tinyChildIdentity':None,'unknownTinyChildIdentityPreserved':True,'fixtureQualified':False,'actualLinuxQualified':False,'fullProtectionQualified':False,'fullProcCensusExecuted':True,'modelsInvoked':False,'productCodeExecuted':False,'signalsSent':False,'resourcesRemoved':False,'mutationsPerformed':False},separators=(',',':')))
`;
}
export function assertBoundCensusLinuxFailureHostR32(h){
 need(h?.schemaVersion===1&&h.kind==='r32-bound-census-linux-failure-scope-host-observation'&&canonical(h.scopeBinding)===canonical(S)&&h.contextSHA256===sha(S),'R32_BOUND_FAILURE_HOST_SCOPE_CHANGED');
 need(h.failureScope===true&&h.tinyChildIdentity===null&&h.unknownTinyChildIdentityPreserved===true&&['fixtureQualified','actualLinuxQualified','fullProtectionQualified','modelsInvoked','productCodeExecuted','signalsSent','resourcesRemoved','mutationsPerformed'].every(k=>h[k]===false),'R32_BOUND_FAILURE_QUALIFICATION_BOUNDARY_CHANGED');
 need(h.recordsStable===true&&h.namespaceStable===true&&h.unitProofVerified===true&&Object.keys(h.records??{}).sort().join('\0')===Object.keys(S.records).sort().join('\0')&&Object.entries(S.records).every(([k,v])=>h.records[k].sha256===v.sha256&&Number.isSafeInteger(h.records[k].bytes)&&h.records[k].bytes>0&&(v.bytes===null||h.records[k].bytes===v.bytes)&&h.records[k].metadata?.length===9&&h.records[k].readComplete===true),'R32_BOUND_FAILURE_RECORD_BINDING_CHANGED');
 need(h.processScans?.length===2&&h.processScans.every(s=>s.fullProcScan===true&&s.pidfdSupported===true&&s.total===s.inspected+s.provenExited+s.incompleteCount&&s.incompleteCount===s.incomplete.length&&s.relatedCount===s.relatedProcesses.length&&s.complete===(s.incompleteCount===0&&s.relatedCount===0)),'R32_BOUND_FAILURE_CENSUS_INCOMPLETE');
 for(const s of h.processScans){
  const exits=s.exitedDuringScan?.map(e=>e.pid),unknown=s.incomplete.map(e=>e.pid),ids=[...(s.inspectedPIDs??[]),...(exits??[]),...unknown];need(Number.isSafeInteger(s.total)&&s.total>0&&Array.isArray(s.listedPIDs)&&Array.isArray(s.inspectedPIDs)&&Array.isArray(exits)&&s.listedPIDs.length===s.total&&s.inspectedPIDs.length===s.inspected&&exits.length===s.provenExited&&ids.every(p=>Number.isSafeInteger(p)&&p>0)&&new Set(ids).size===ids.length&&new Set(s.listedPIDs).size===s.listedPIDs.length&&canonical([...ids].sort((a,b)=>a-b))===canonical([...s.listedPIDs].sort((a,b)=>a-b)),'R32_BOUND_FAILURE_COUNTS_NOT_CLOSED');
  for(const e of s.exitedDuringScan){const k=e.kernelProof,i=e.processIdentity,l=e.listedProcIdentity;need(e.boot===S.boot&&i?.pid===e.pid&&i.boot===S.boot&&i.procDevice===l?.device&&i.procInode===l?.inode&&Number.isSafeInteger(l?.device)&&l.device>=0&&Number.isSafeInteger(l?.inode)&&l.inode>0&&k?.type==='pidfd-POLLIN'&&k.attached===true&&k.identityBound===true&&k.requestedPID===e.pid&&k.exitConfirmed===true&&k.procPathAbsent===true&&[1,17].includes(k.pollEvents),'R32_BOUND_FAILURE_EXIT_PROOF_INVALID')}
 }
 const absent=['owner','fixture'].every(k=>h.knownProcesses?.[k]?.pid===S[k].pid&&h.knownProcesses[k].present===false),stopped=h.unit?.Id===S.unit&&['inactive','failed'].includes(h.unit.ActiveState)&&h.unit.MainPID==='0'&&h.unit.ControlGroup==='';
 const complete=absent&&stopped&&h.cgroup?.absent===true&&h.cgroup.complete===true&&h.processScans.every(s=>s.complete)&&h.sockets?.count===0&&h.sockets.complete===true&&h.namespaceFD?.relatedCount===0&&h.namespaceFD.complete===true;
 need(h.cleanupScopeComplete===complete,'R32_BOUND_FAILURE_CLEANUP_FLAG_CHANGED');return h;
}
