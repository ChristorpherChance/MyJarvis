import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
// ZIP bytes are read as data by isolated Python; only admitted assets are copied.
const program=String.raw`import sys,json,hashlib,stat
from pathlib import Path
from zipfile import ZipFile
root=Path(sys.argv[1]);stage=Path(sys.argv[2]);report=Path(sys.argv[3])
archive=root/'artifacts/r46-round16/platform/20261018-unified-projects-r46-r1.zip'
manifest_path=archive.parent/'release-manifest.json'
sha=lambda b:hashlib.sha256(b).hexdigest()
assert archive.stat().st_size==22746833 and sha(archive.read_bytes())=='f02201c96ed7de7bdecc2e77ebf0a7b9b8df0691ce78d2c4af4ac00d14274bbd'
mb=manifest_path.read_bytes();assert len(mb)==440860 and sha(mb)=='3cb627ab6e32713131f6bf87fca2485e6475bb35a9b46082bb92967b6ddcf306'
m=json.loads(mb);assets=[]
with ZipFile(archive) as z:
 assert len(z.namelist())==len(set(z.namelist()))
 assert set(z.namelist())==set([x['path'] for x in m['files']]+['release-manifest.json'])
 assert z.read('release-manifest.json')==mb
 for x in m['files']:
  b=z.read(x['path']);assert len(b)==x['size'] and sha(b)==x['sha256'],x['path']
  if x['path'].startswith('apps/web/dist/assets/'):
   rel=x['path'][len('apps/web/dist/'):];parts=Path(rel).parts
   assert all(p not in ('','..','.') for p in parts) and not Path(rel).is_absolute()
   assert stat.S_ISREG(z.getinfo(x['path']).external_attr>>16)
   dest=stage/rel;dest.parent.mkdir(parents=True,exist_ok=True)
   assert not dest.is_symlink()
   if dest.exists():assert sha(dest.read_bytes())==x['sha256'],'IMMUTABLE_COLLISION '+rel
   else:dest.write_bytes(b)
   assets.append({'path':x['path'],'size':len(b),'sha256':sha(b)})
report.write_text(json.dumps({'priorZipVerified':True,'allPriorEntriesVerified':len(m['files']),'assets':assets,'count':len(assets),'oldIndexApiManifestCopied':False},indent=2)+'\n')
print(json.dumps({'verifiedEntries':len(m['files']),'inheritedAssets':len(assets)}))
`;
const result=spawnSync('python3',['-I','-c',program,resolve('.'),resolve('apps/web/.dist-next'),resolve('reports/r46-round19-logs/prior-assets.json')],{encoding:'utf8',maxBuffer:1024*1024});process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode=result.status??1;
