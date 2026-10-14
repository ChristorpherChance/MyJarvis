/** Promote verified public model files only into the isolated staging directory. */
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {primary,remote,lanProfile,python} from './managed-server-client.mjs';
const stage='/var/lib/jarvis/voice-staging-20261010-multilingual',upload='/tmp/jarvis-multilingual-upload-20261010';
const manifest=JSON.parse(await readFile('config/voice-multilingual-assets.json','utf8'));
if(manifest.whisper.files.some(item=>!item.sha256))throw Error('Download must finish SHA256 verification first');
remote(lanProfile,'jarvis-112',python({upload},`from pathlib import Path
r=Path(p['upload']);assert str(r)=='/tmp/jarvis-multilingual-upload-20261010';r.mkdir(mode=0o700,exist_ok=True)
`));
const transfer=spawnSync('scp',['-F',lanProfile,'-o','BatchMode=yes','-r',resolve('artifacts/multilingual-voice/models'),`jarvis-112:${upload}/`],{windowsHide:true,encoding:'utf8',timeout:300000,maxBuffer:1000000});
if(transfer.status!==0)throw Error('Stage public model upload failed '+transfer.status);
const worker=await readFile('apps/api/resources/voice/resident_voice.py','utf8');
console.log(primary(python({stage,upload,manifest,worker},`from pathlib import Path
import json,hashlib,shutil,tarfile,os,pwd
r=Path(p['stage']);u=Path(p['upload'])/'models';assert str(r)=='/var/lib/jarvis/voice-staging-20261010-multilingual';assert str(u)=='/tmp/jarvis-multilingual-upload-20261010/models'
assert json.loads((r/'install-status.json').read_text())['state']=='complete'
def verify(path,item):
 assert path.stat().st_size==item['size'],'ASSET_SIZE_MISMATCH'
 sha=hashlib.sha256()
 with path.open('rb') as source:
  for chunk in iter(lambda:source.read(1048576),b''):sha.update(chunk)
 assert sha.hexdigest()==item['sha256'],'ASSET_HASH_MISMATCH'
for item in p['manifest']['whisper']['files']:verify(u/'faster-whisper-small'/item['name'],item)
for item in p['manifest']['piper']:verify(u/item['file'],item)
models=r/'models';models.mkdir(mode=0o750,exist_ok=True)
whisper=models/'faster-whisper-small';whisper.mkdir(mode=0o750,exist_ok=True)
for item in p['manifest']['whisper']['files']:shutil.copy2(u/'faster-whisper-small'/item['name'],whisper/item['name'])
for item in p['manifest']['piper']:
 with tarfile.open(u/item['file'],'r:bz2') as archive:
  for member in archive.getmembers():
   assert not member.issym() and not member.islnk(),'UNSAFE_ASSET_LINK'
   target=(models/member.name).resolve();assert target.is_relative_to(models.resolve()),'UNSAFE_ASSET_PATH'
   assert member.name.split('/')[0]==item['name'],'UNEXPECTED_ASSET_ROOT'
  archive.extractall(models,filter='data')
(r/'resident_voice.py').write_text(p['worker']);(models/'manifest.json').write_text(json.dumps(p['manifest'],indent=2))
uid=pwd.getpwnam('jarvis').pw_uid;gid=pwd.getpwnam('jarvis').pw_gid
for target in [models,*models.rglob('*'),r/'resident_voice.py']:
 assert not target.is_symlink();os.chown(target,uid,gid);target.chmod(0o750 if target.is_dir() else 0o640)
print(json.dumps({'state':'ready-for-offline-test','revision':p['manifest']['revision'],'stage':str(r),'piperFiles':{item['language']:[x.name for x in (models/item['name']).glob('*.onnx')] for item in p['manifest']['piper']},'productionUnchanged':True}))
`)));
