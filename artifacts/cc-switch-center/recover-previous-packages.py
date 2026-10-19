"""Recover historical public release ZIPs from exact immutable manifest payloads.
No service/data/config writes. The sudo reader only reads root-owned public files.
"""
import hashlib, io, json, os, stat, subprocess, sys, datetime
from pathlib import Path
from zipfile import ZipFile
ROOT=Path(__file__).resolve().parent
PINS={
 '20261018-ai-development-ops-r55':'4927a9d264a8bb58023d4d2f55df77f065b32a2444175e8c4d44c5d106414d32',
 '20261018-simple-workbench-r54':'f9eb4c09c06e6a1c2dc09889cdfd10b6ba062907ea7660c2ad4f4f0111eb0b97',
}
READER=r"""
import hashlib,io,json,os,stat,sys
from pathlib import Path
from zipfile import ZipFile,ZipInfo,ZIP_DEFLATED
release=sys.argv[1]
assert release in ['20261018-ai-development-ops-r55','20261018-simple-workbench-r54']
base=Path('/opt/jarvis/releases')/release

def safe(path,directory=False):
 for parent in [*reversed(path.parents),path]:
  s=parent.lstat()
  assert s.st_uid==0 and not s.st_mode&0o022 and not stat.S_ISLNK(s.st_mode),'UNSAFE_PATH'
 s=path.lstat()
 assert stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode) and s.st_nlink==1,'UNSAFE_TYPE'
 return s
safe(base,True)
manifest_path=base/'release-manifest.json'
safe(manifest_path)
manifest_raw=manifest_path.read_bytes()
manifest=json.loads(manifest_raw)
assert manifest['archiveVersion']==release and manifest['runtimeBuild']==release,'RELEASE_MISMATCH'
output=io.BytesIO()
seen=set()
with ZipFile(output,'w',compression=ZIP_DEFLATED,compresslevel=6) as z:
 for row in manifest['files']:
  name=row['path']
  parts=Path(name).parts
  assert not Path(name).is_absolute() and '..' not in parts and '\\' not in name and name not in seen,'UNSAFE_MANIFEST_PATH'
  assert name!='release-manifest.json','MANIFEST_SELF_INCLUDED'
  seen.add(name)
  path=base/name
  before=safe(path)
  b=path.read_bytes()
  after=path.lstat()
  assert (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns),'PAYLOAD_CHANGED'
  assert len(b)==row['size'] and hashlib.sha256(b).hexdigest()==row['sha256'],'PAYLOAD_HASH_MISMATCH'
  info=ZipInfo(name,date_time=(1980,1,1,0,0,0))
  info.compress_type=ZIP_DEFLATED
  info.create_system=3
  info.external_attr=(stat.S_IFREG|row['mode'])<<16
  z.writestr(info,b)
 info=ZipInfo('release-manifest.json',date_time=(1980,1,1,0,0,0))
 info.compress_type=ZIP_DEFLATED
 info.create_system=3
 info.external_attr=(stat.S_IFREG|0o644)<<16
 z.writestr(info,manifest_raw)
assert manifest_path.read_bytes()==manifest_raw,'MANIFEST_CHANGED'
sys.stdout.buffer.write(output.getvalue())
"""

def main():
 target=ROOT/'inputs'
 target.mkdir(mode=0o700,exist_ok=True)
 rows=[]
 for release,expected in PINS.items():
  dest=target/(release+'.zip')
  if dest.exists():
   data=dest.read_bytes()
   existing=True
  else:
   r=subprocess.run(['sudo','-n','python3','-I','-c',READER,release],capture_output=True,timeout=120)
   if r.returncode:
    raise RuntimeError('PUBLIC_PAYLOAD_READER_FAILED_'+release+'_'+str(r.returncode))
   data=r.stdout
   existing=False
  actual=hashlib.sha256(data).hexdigest()
  with ZipFile(io.BytesIO(data)) as z:
   assert z.testzip() is None,'ZIP_CRC_MISMATCH'
   raw=z.read('release-manifest.json')
   manifest=json.loads(raw)
   names=[r['path'] for r in manifest['files']]+['release-manifest.json']
   assert sorted(names)==sorted(z.namelist()) and len(set(names))==len(names),'ZIP_INVENTORY_MISMATCH'
   for row in manifest['files']:
    b=z.read(row['path'])
    assert len(b)==row['size'] and hashlib.sha256(b).hexdigest()==row['sha256'],'ZIP_FILE_MISMATCH'
    info=z.getinfo(row['path'])
    assert info.create_system==3 and (info.external_attr>>16)&0o777==row['mode'],'ZIP_MODE_MISMATCH'
  # A changed archive hash is preserved and explicitly classified, never substituted for the historical pin.
  if not existing:
   with dest.open('xb') as f:f.write(data)
   os.chmod(dest,0o600)
  rows.append({'release':release,'sourceRoot':'/opt/jarvis/releases/'+release,'archivePath':str(dest),'archiveBytes':len(data),'archiveSHA256':actual,'historicalArchiveSHA256':expected,'historicalArchiveExact':actual==expected,'manifestSHA256':hashlib.sha256(raw).hexdigest(),'manifestFiles':len(manifest['files']),'sourceCommit':manifest['sourceCommit'],'allManifestPayloadsSHA256SizeModeAndCRCVerified':True,'alreadyRecovered':existing})
 report={'schemaVersion':1,'kind':'previous-release-public-package-recovery','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'packages':rows,'allHistoricalArchivesExact':all(r['historicalArchiveExact'] for r in rows),'formalReleasePayloadsModified':False,'servicesChanged':False,'privateDataOrCredentialsRead':False,'method':'Original package-capture-release zipProgram metadata, payload order, compression and fixed timestamps; exact original manifest bytes; each immutable public payload verified before archiving.'}
 result=ROOT/'previous-package-recovery-public.json'
 assert not result.exists(),'REPORT_ALREADY_EXISTS'
 result.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
