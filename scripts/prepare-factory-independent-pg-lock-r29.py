"""Extract the exact PG-only lock closure as data; never import candidate code.

The parser deliberately accepts only the current frozen plain lock layout. A
different graph/layout must receive a new review instead of online resolution.
"""
import hashlib, json, re, sys
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
SOURCE = WORKSPACE / '.jarvis-dev/workspaces/msf-targets-r29/source/pnpm-lock.yaml'
OUTPUT = WORKSPACE / 'artifacts/software-factory/goals-r29/qa-pg-runtime-inputs'
SOURCE_SHA = '7eaa5723166f51e4be57b252297fbf616e0aa966e6bdad19234dcd26b806d6b7'
SNAPSHOTS = {
    'pg@8.23.0': {'dependencies': {'pg-connection-string':'2.14.0', 'pg-pool':'3.14.0(pg@8.23.0)', 'pg-protocol':'1.16.0', 'pg-types':'2.2.0', 'pgpass':'1.0.5'}, 'optionalDependencies': {'pg-cloudflare':'1.4.0'}},
    'pg-connection-string@2.14.0': {}, 'pg-pool@3.14.0(pg@8.23.0)': {'dependencies': {'pg':'8.23.0'}},
    'pg-protocol@1.16.0': {}, 'pg-types@2.2.0': {'dependencies': {'pg-int8':'1.0.1', 'postgres-array':'2.0.0', 'postgres-bytea':'1.0.1', 'postgres-date':'1.0.7', 'postgres-interval':'1.2.0'}},
    'pgpass@1.0.5': {'dependencies': {'split2':'4.2.0'}}, 'pg-cloudflare@1.4.0': {'optional':True},
    'pg-int8@1.0.1': {}, 'postgres-array@2.0.0': {}, 'postgres-bytea@1.0.1': {},
    'postgres-date@1.0.7': {}, 'postgres-interval@1.2.0': {'dependencies': {'xtend':'4.0.2'}},
    'split2@4.2.0': {}, 'xtend@4.0.2': {}
}

def need(value, code):
    if not value: raise RuntimeError(code)

def sha(raw): return hashlib.sha256(raw).hexdigest()

def blocks(text, section):
    lines=text.splitlines(keepends=True)
    indices=[i for i,x in enumerate(lines) if x.rstrip('\n')==section+':']
    need(len(indices)==1, 'QA_LOCK_SECTION_INVALID')
    result={}; key=None; data=[]
    for line in lines[indices[0]+1:]:
        if line.strip() and not line.startswith(' '): break
        m=re.fullmatch(r'  ([A-Za-z0-9@()./-]+):(?: \{\})?\n?',line)
        if m:
            if key is not None: result[key]=''.join(data).rstrip()+'\n'
            key=m.group(1); need(key not in result,'QA_LOCK_DUPLICATE_BLOCK'); data=[line]
        elif key is not None: data.append(line)
    if key is not None: need(key not in result,'QA_LOCK_DUPLICATE_BLOCK'); result[key]=''.join(data).rstrip()+'\n'
    return result

def parse_snapshot(block):
    lines=block.splitlines()
    if lines[0].endswith(': {}'): need(len(lines)==1,'QA_LOCK_SNAPSHOT_LAYOUT'); return {}
    out={}; group=None
    for line in lines[1:]:
        if not line: continue
        if line=='    optional: true':
            need('optional' not in out,'QA_LOCK_DUPLICATE_OPTIONAL'); out['optional']=True; group=None; continue
        m=re.fullmatch(r'    (dependencies|optionalDependencies):',line)
        if m: group=m.group(1); need(group not in out,'QA_LOCK_DUPLICATE_GROUP'); out[group]={}; continue
        m=re.fullmatch(r'      ([a-z0-9-]+): ([0-9][A-Za-z0-9@().-]*)',line)
        need(m is not None and group is not None,'QA_LOCK_SNAPSHOT_LAYOUT')
        need(m.group(1) not in out[group],'QA_LOCK_DUPLICATE_DEPENDENCY'); out[group][m.group(1)]=m.group(2)
    return out

def extract(raw, expected_sha):
    need(isinstance(expected_sha,str) and re.fullmatch('[a-f0-9]{64}',expected_sha) and sha(raw)==expected_sha,'QA_LOCK_SOURCE_CHANGED')
    text=raw.decode('utf-8').replace('\r\n','\n')
    need(text.startswith("lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n"),'QA_LOCK_SETTINGS_CHANGED')
    need('\t' not in text,'QA_LOCK_LAYOUT_UNSUPPORTED')
    packages=blocks(text,'packages'); snapshots=blocks(text,'snapshots')
    need(all(key in snapshots for key in SNAPSHOTS),'QA_LOCK_CLOSURE_MISSING')
    for key, expected in SNAPSHOTS.items(): need(parse_snapshot(snapshots[key])==expected,'QA_LOCK_DEPENDENCY_GRAPH_CHANGED')
    selected=sorted(SNAPSHOTS); package_keys=sorted(key.split('(')[0] for key in selected)
    need(len(set(package_keys))==14,'QA_LOCK_PACKAGE_COUNT_CHANGED')
    integrity={}
    for key in package_keys:
        need(key in packages,'QA_LOCK_PACKAGE_MISSING'); block=packages[key]
        matches=re.findall(r'^    resolution: \{integrity: (sha512-[A-Za-z0-9+/=]+)\}$',block,re.M)
        need(len(matches)==1,'QA_LOCK_INTEGRITY_REQUIRED'); integrity[key]=matches[0]
        need('tarball:' not in block and 'patched:' not in block,'QA_LOCK_REMOTE_OR_PATCH_REFUSED')
    header="lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n\n  .:\n    dependencies:\n      pg:\n        specifier: 8.23.0\n        version: 8.23.0\n\npackages:\n\n"
    lock=header+'\n'.join(packages[k] for k in package_keys)+'\nsnapshots:\n\n'+'\n'.join(snapshots[k] for k in selected)
    package={'name':'jarvis-r29-qa-runtime','private':True,'version':'1.0.0','dependencies':{'pg':'8.23.0'}}
    package_raw=(json.dumps(package,indent=2)+'\n').encode()
    return package_raw,lock.encode(),{'schemaVersion':1,'kind':'r29-independent-pg-lock-extraction','originalSource':'pnpm-lock.yaml','originalSourceSHA256':expected_sha,'packageCount':14,'snapshotCount':14,'packageIntegrity':integrity,'snapshots':selected,'candidateCodeImported':False,'packagesInstalled':False,'remoteConnectionPerformed':False,'runtimeReady':False}

def main():
    need(sys.argv[1:] in [[],['--write']],'QA_LOCK_ARGUMENTS_INVALID')
    raw=SOURCE.read_bytes(); package,lock,receipt=extract(raw,SOURCE_SHA)
    receipt.update(packageJSONSHA256=sha(package),lockSHA256=sha(lock))
    if sys.argv[1:]==['--write']:
        OUTPUT.mkdir(parents=True,exist_ok=True)
        for name,value in [('package.json',package),('pnpm-lock.yaml',lock),('extraction.json',(json.dumps(receipt,indent=2)+'\n').encode())]:
            with (OUTPUT/name).open('xb') as f: f.write(value)
    print(json.dumps(receipt))

if __name__=='__main__': main()
