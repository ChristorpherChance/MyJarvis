import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
// Read the old archive as data only; never extract or execute its code.
const program=String.raw`import sys,json,hashlib,stat
from pathlib import Path
from zipfile import ZipFile
root=Path(sys.argv[1]);stage=root/'apps/web/.dist-next';report=root/'reports/r48-logs/preserved-assets.json'
sha=lambda b:hashlib.sha256(b).hexdigest()
archive=root/'artifacts/r46-round16/platform/20261018-unified-projects-r46-r1.zip';mp=archive.parent/'release-manifest.json'
assert sha(archive.read_bytes())=='f02201c96ed7de7bdecc2e77ebf0a7b9b8df0691ce78d2c4af4ac00d14274bbd'
mb=mp.read_bytes();assert sha(mb)=='3cb627ab6e32713131f6bf87fca2485e6475bb35a9b46082bb92967b6ddcf306'
m=json.loads(mb);assets=[]
with ZipFile(archive) as z:
 assert len(z.namelist())==len(set(z.namelist()))
 assert set(z.namelist())==set([x['path'] for x in m['files']]+['release-manifest.json'])
 assert z.read('release-manifest.json')==mb
 for x in m['files']:
  b=z.read(x['path']);assert len(b)==x['size'] and sha(b)==x['sha256'],x['path']
  if x['path'].startswith('apps/web/dist/assets/'):
   rel=x['path'][len('apps/web/dist/'):];assert not Path(rel).is_absolute() and all(p not in ('','..','.') for p in Path(rel).parts)
   assert stat.S_ISREG(z.getinfo(x['path']).external_attr>>16)
   dest=stage/rel;dest.parent.mkdir(parents=True,exist_ok=True);assert not dest.is_symlink()
   if dest.exists():assert sha(dest.read_bytes())==x['sha256'],'IMMUTABLE_COLLISION '+rel
   else:dest.write_bytes(b)
   assets.append(x)
nodes=[]
old=json.loads((root/'reports/r46-round19-logs/final-readback.json').read_text())
for x in old['priorNodeFiveInputsAndSHA256InventoryVerified']:
 b=(root/x['path']).read_bytes();assert len(b)==x['bytes'] and sha(b)==x['sha256'];nodes.append(x)
r7=root/'artifacts/r43-round10/node-20261017-cc-supervisor-r43-r7'
inv=json.loads((r7/'SHA256.json').read_text());print('R7 inventory shape:',type(inv).__name__)
for p in sorted(r7.iterdir()):
 assert p.is_file() and not p.is_symlink();b=p.read_bytes();nodes.append({'path':str(p.relative_to(root)),'bytes':len(b),'sha256':sha(b)})
report.write_text(json.dumps({'priorZipVerified':True,'priorManifestVerified':True,'allPriorPayloadsVerified':len(m['files']),'inheritedAssets':assets,'nodeReadback':nodes,'nodeBuiltOrInstalled':False,'productionAccess':False},indent=2)+'\n')
print(json.dumps({'priorPayloads':len(m['files']),'assets':len(assets),'nodeFilesRead':len(nodes)}))
`;
const result=spawnSync('python3',['-I','-c',program,resolve('.')],{encoding:'utf8',maxBuffer:1024*1024});process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode=result.status??1;
