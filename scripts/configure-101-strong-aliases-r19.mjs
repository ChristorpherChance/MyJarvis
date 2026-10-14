/** Synchronize five public model alias fields; preserve every private and unrelated setting. */
import {mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {queueState} from './run-factory-supervision-probe.mjs';
const flags=process.argv.slice(2);if(flags.some(x=>x!=='--execute')||flags.length>1)throw Error('ONLY_EXECUTE_FLAG_ALLOWED');
const execute=flags.includes('--execute'),job=randomBytes(16).toString('hex');
const queue=queueState();if(queue.fullTable!==true||queue.allActive!==0)throw Error('ALIAS_QUEUE_NOT_EMPTY');
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({execute,job,providerFingerprint:'554686e873a38c49',fields:{ANTHROPIC_MODEL:'gpt-6.1-sol[1m]',ANTHROPIC_DEFAULT_OPUS_MODEL:'gpt-6.1-sol[1m]',ANTHROPIC_DEFAULT_FABLE_MODEL:'gpt-6.1-sol[1m]',ANTHROPIC_DEFAULT_OPUS_MODEL_NAME:'gpt-6.1-sol',ANTHROPIC_DEFAULT_FABLE_MODEL_NAME:'gpt-6.1-sol'}},String.raw`import os,json,sqlite3,hashlib,stat,tempfile,datetime,pwd,grp
from pathlib import Path
settings=Path('/home/superopen/.claude/settings.json');db=Path('/home/superopen/.cc-switch/cc-switch.db')
def trusted_file(q):
 for part in [q,*q.parents]:
  s=part.lstat()
  if stat.S_ISLNK(s.st_mode):raise RuntimeError('ALIAS_PATH_SYMLINK')
  if part==q and (not stat.S_ISREG(s.st_mode) or s.st_uid!=1000 or s.st_nlink!=1):raise RuntimeError('ALIAS_FILE_INVALID')
  if part!=q:
   if not stat.S_ISDIR(s.st_mode) or s.st_mode&0o002:raise RuntimeError('ALIAS_PARENT_WRITABLE')
   if s.st_mode&0o020:
    members={u.pw_uid for u in pwd.getpwall() if u.pw_gid==s.st_gid}|{pwd.getpwnam(n).pw_uid for n in grp.getgrgid(s.st_gid).gr_mem}
    if s.st_uid!=1000 or members!={1000}:raise RuntimeError('ALIAS_PARENT_WRITABLE')
 return q.stat()
ss=trusted_file(settings);ds=trusted_file(db)
if ss.st_mode&0o077:raise RuntimeError('CLAUDE_SETTINGS_MODE_INVALID')
raw=settings.read_bytes();old=json.loads(raw)
expected={'ANTHROPIC_MODEL':'gpt-6-sol[1M]','ANTHROPIC_DEFAULT_OPUS_MODEL':'gpt-6-sol[1M]','ANTHROPIC_DEFAULT_FABLE_MODEL':'gpt-6-sol[1M]','ANTHROPIC_DEFAULT_OPUS_MODEL_NAME':'gpt-6-sol','ANTHROPIC_DEFAULT_FABLE_MODEL_NAME':'gpt-6-sol'}
fields=p['fields']
if set(fields)!=set(expected) or not isinstance(old.get('env'),dict):raise RuntimeError('ALIAS_FIELDS_INVALID')
def changed(v):
 n=json.loads(json.dumps(v));n['env'].update(fields);return n
def nonroute(v):
 n=json.loads(json.dumps(v))
 for k in fields:n.get('env',{}).pop(k,None)
 return n
def metadata(v):return {k:v.get('env',{}).get(k) for k in fields}
c=sqlite3.connect(str(db),timeout=10,isolation_level=None);c.row_factory=sqlite3.Row
rows=c.execute('SELECT id,settings_config FROM providers WHERE app_type=? AND is_current=1',('claude',)).fetchall()
if len(rows)!=1 or hashlib.sha256(str(rows[0]['id']).encode()).hexdigest()[:16]!=p['providerFingerprint']:raise RuntimeError('ALIAS_CURRENT_PROVIDER_CHANGED')
row=rows[0];original_config=row['settings_config'];provider=json.loads(original_config)
if metadata(old)!=expected or metadata(provider)!=expected:raise RuntimeError('ALIAS_EXPECTED_ROUTE_CHANGED')
nextsettings=changed(old);nextprovider=changed(provider)
if nonroute(old)!=nonroute(nextsettings) or nonroute(provider)!=nonroute(nextprovider):raise RuntimeError('ALIAS_NON_ROUTE_CHANGED')
report={'formatVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'execute':p['execute'],'providerFingerprint':p['providerFingerprint'],'previousFields':expected,'newFields':fields,'changedFieldsPerConfiguration':5,'modelCalls':0,'credentialsExported':False,'gatewaysModified':False,'otherProvidersModified':False,'sonnetHaikuModified':False,'businessSourceModified':False,'softwareFactoryDatabaseModified':False,'nodeServiceRestarted':False,'claudeRootModelChanged':False}
if not p['execute']:
 report['plannedOnly']=True;print(json.dumps(report));c.close();raise SystemExit(0)
base=Path('/var/lib/jarvis-control')
for part in [base,*base.parents]:
 s=part.lstat()
 if stat.S_ISLNK(s.st_mode) or not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('ALIAS_BACKUP_PARENT_UNTRUSTED')
folder=base/'model-routing-101-r19'
try:folder.mkdir(mode=0o700)
except FileExistsError:pass
s=folder.lstat()
if folder.is_symlink() or not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o077:raise RuntimeError('ALIAS_BACKUP_DIRECTORY_INVALID')
runfolder=folder/p['job'];runfolder.mkdir(mode=0o700)
sf=runfolder/'claude-settings.json';fd=os.open(sf,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
bf=runfolder/'cc-switch.db';fd=os.open(bf,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);os.close(fd)
sourcebackup=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True,timeout=10);destinationbackup=sqlite3.connect(str(bf));sourcebackup.backup(destinationbackup);destinationbackup.close();sourcebackup.close();os.chmod(bf,0o600)
report['privateBackupsRemoteOnly']=True
nodeupdated=False;dbcommitted=False;temp=None
try:
 c.execute('BEGIN IMMEDIATE')
 found=c.execute('SELECT id,settings_config FROM providers WHERE app_type=? AND is_current=1',('claude',)).fetchall()
 if len(found)!=1 or found[0]['id']!=row['id'] or found[0]['settings_config']!=original_config:raise RuntimeError('ALIAS_PROVIDER_CAS_CONFLICT')
 if hashlib.sha256(settings.read_bytes()).digest()!=hashlib.sha256(raw).digest():raise RuntimeError('ALIAS_SETTINGS_CAS_CONFLICT')
 serialized=json.dumps(nextprovider,ensure_ascii=False,separators=(',',':'))
 cur=c.execute('UPDATE providers SET settings_config=? WHERE id=? AND app_type=? AND is_current=1 AND settings_config=?',(serialized,row['id'],'claude',original_config))
 if cur.rowcount!=1:raise RuntimeError('ALIAS_PROVIDER_CAS_CONFLICT')
 fd,temp=tempfile.mkstemp(prefix='.jarvis-model-alias-',dir=settings.parent)
 with os.fdopen(fd,'w') as f:json.dump(nextsettings,f,ensure_ascii=False,indent=2);f.write(chr(10));f.flush();os.fsync(f.fileno())
 os.chown(temp,ss.st_uid,ss.st_gid);os.chmod(temp,ss.st_mode&0o777)
 if hashlib.sha256(settings.read_bytes()).digest()!=hashlib.sha256(raw).digest():raise RuntimeError('ALIAS_SETTINGS_CAS_CONFLICT')
 os.replace(temp,settings);temp=None;nodeupdated=True
 installed=json.loads(settings.read_text())
 if installed!=nextsettings or nonroute(installed)!=nonroute(old):raise RuntimeError('ALIAS_SETTINGS_POST_WRITE_INVALID')
 c.commit();dbcommitted=True
 saved=c.execute('SELECT settings_config FROM providers WHERE id=? AND app_type=? AND is_current=1',(row['id'],'claude')).fetchone()
 if saved is None or json.loads(saved[0])!=nextprovider:raise RuntimeError('ALIAS_PROVIDER_POST_WRITE_INVALID')
 report.update({'settingsCASVerified':True,'providerCASVerified':True,'twoConfigurationsAgree':metadata(installed)==metadata(json.loads(saved[0]))==fields,'nonRouteFieldsPreserved':nonroute(installed)==nonroute(old) and nonroute(json.loads(saved[0]))==nonroute(provider),'settingsOwnerModePreserved':settings.stat().st_uid==ss.st_uid and settings.stat().st_mode&0o777==ss.st_mode&0o777,'passed':True,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 print(json.dumps(report))
except:
 c.rollback()
 # Restore only this writer's exact new settings, never overwrite a concurrent change.
 if nodeupdated and json.loads(settings.read_text())==nextsettings:
  fd,tmp=tempfile.mkstemp(prefix='.jarvis-model-alias-rollback-',dir=settings.parent)
  with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
  os.chown(tmp,ss.st_uid,ss.st_gid);os.chmod(tmp,ss.st_mode&0o777);os.replace(tmp,settings)
 if dbcommitted:
  c.execute('BEGIN IMMEDIATE');c.execute('UPDATE providers SET settings_config=? WHERE id=? AND app_type=? AND is_current=1 AND settings_config=?',(original_config,row['id'],'claude',serialized));c.commit()
 raise
finally:
 if temp is not None and os.path.exists(temp):os.unlink(temp)
 c.close()
`),true));
result.queueBefore=queue;result.queueAfter=queueState();
if(execute&&result.queueAfter.allActive!==0)result.afterQueueChanged=true;
await mkdir('artifacts/model-routing-101-r19',{recursive:true});
const path='artifacts/model-routing-101-r19/alias-'+(execute?'update':'plan')+'.json';
await writeFile(path,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({execute,passed:result.passed??null,privateBackupsRemoteOnly:result.privateBackupsRemoteOnly??false,nonRouteFieldsPreserved:result.nonRouteFieldsPreserved??null,modelCalls:0,report:path}));
