"""Root byte-only freeze/readback of one stopped independent PG installer.

This program never imports/runs package JavaScript. UID1000 installation is a
separate finite container stage; independent cleanup must qualify it first.
No real pins are available yet, so the default CLI cannot freeze anything.
"""
import hashlib, json, os, re, stat, time
from pathlib import Path, PurePosixPath

ROOT=Path('/var/lib/jarvis-development/101/r29-qa-pg-runtime')
IMAGE='sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96'
PACKAGE_SHA='e65f7af605df2b5c4b2ee136cb0571c46456eb1c1c99f921170b16511165a8ea'
LOCK_SHA='fc2139a36dad144908d17339dc7e125a1e535aa3cad1064d27fca2fa76d1ccaa'
REVIEW_PIN=None
CLEANUP_PIN=None
H=re.compile(r'[a-f0-9]{64}')

def need(v,c):
    if not v: raise RuntimeError(c)

def raw_json(v): return json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
def sha(v): return hashlib.sha256(v).hexdigest()
def ident(s): return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def path_valid(p): return isinstance(p,str) and 0<len(p)<=1000 and not p.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]',p) and all(x not in ['', '.', '..'] for x in p.split('/'))

def link_valid(path,target):
    if not path_valid(path) or not isinstance(target,str) or not 0<len(target)<=1000 or target.startswith('/') or re.search(r'[\\\x00-\x1f\x7f]',target): return False
    parts=list(PurePosixPath(path).parent.parts)
    for part in target.split('/'):
        if part in ['', '.']: continue
        if part=='..':
            if not parts: return False
            parts.pop()
        else: parts.append(part)
    return bool(parts)

def check_stat(s,kind,frozen=False):
    expected={'file':stat.S_ISREG,'directory':stat.S_ISDIR,'symlink':stat.S_ISLNK}
    need(kind in expected and expected[kind](s.st_mode),'QA_PG_TREE_TYPE_INVALID')
    need(s.st_uid==(0 if frozen else 1000) and s.st_gid==(0 if frozen else 1000),'QA_PG_TREE_OWNER_INVALID')
    if kind=='file': need(s.st_nlink==1 and 0<=s.st_size<=100*1024*1024,'QA_PG_TREE_FILE_NOT_INDEPENDENT')
    if frozen and kind!='symlink': need(not s.st_mode&0o222,'QA_PG_FROZEN_TREE_WRITABLE')

def open_root(path):
    fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        for name in Path(path).parts[1:]:
            before=os.stat(name,dir_fd=fd,follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and before.st_uid==0 and before.st_gid==0 and not before.st_mode&0o022,'QA_PG_ROOT_CHAIN_UNTRUSTED')
            nxt=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            need(ident(before)==ident(os.fstat(nxt)),'QA_PG_ROOT_CHAIN_CHANGED'); os.close(fd);fd=nxt
        return fd
    except BaseException: os.close(fd);raise

def read_held(parent,name,expected=None,output=None,deadline=None):
    fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
    try:
        before=os.fstat(fd);need(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_size<=100*1024*1024,'QA_PG_FILE_INVALID')
        need(expected is None or ident(before)==ident(expected),'QA_PG_FILE_PREOPEN_CHANGED')
        digest=hashlib.sha256();size=0
        while True:
            need(deadline is None or time.monotonic()<deadline,'QA_PG_TREE_READ_TIMEOUT')
            block=os.read(fd,65536)
            if not block: break
            size+=len(block);need(size<=before.st_size,'QA_PG_FILE_CHANGED');digest.update(block)
            if output is not None:
                view=memoryview(block)
                while view:
                    n=os.write(output,view);need(n>0,'QA_PG_SHORT_WRITE');view=view[n:]
        need(size==before.st_size and ident(before)==ident(os.fstat(fd))==ident(os.stat(name,dir_fd=parent,follow_symlinks=False)),'QA_PG_FILE_CHANGED')
        return before,digest.hexdigest()
    finally: os.close(fd)

def tree(fd,frozen=False,copy_fd=None):
    entries=[];metadata=[];deadline=time.monotonic()+120;total=0
    def walk(current,out,prefix='',depth=0):
        nonlocal total
        need(depth<=32 and len(entries)<=20000 and time.monotonic()<deadline,'QA_PG_TREE_BOUND_EXCEEDED')
        before=os.fstat(current);check_stat(before,'directory',frozen);names=sorted(os.listdir(current))
        for name in names:
            path=prefix+name;need(path_valid(path),'QA_PG_TREE_PATH_INVALID');s=os.stat(name,dir_fd=current,follow_symlinks=False)
            kind='directory' if stat.S_ISDIR(s.st_mode) else 'file' if stat.S_ISREG(s.st_mode) else 'symlink' if stat.S_ISLNK(s.st_mode) else 'unknown';check_stat(s,kind,frozen)
            need(len(entries)<20000,'QA_PG_TREE_BOUND_EXCEEDED')
            if kind=='directory':
                child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=current)
                try:
                    need(ident(s)==ident(os.fstat(child)),'QA_PG_DIRECTORY_PREOPEN_CHANGED');dest=None
                    if out is not None: os.mkdir(name,0o700,dir_fd=out);dest=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=out)
                    entries.append({'path':path,'type':kind});metadata.append([path,*ident(s)])
                    try:
                        walk(child,dest,path+'/',depth+1)
                        if dest is not None: os.fchmod(dest,0o555);os.fsync(dest)
                    finally:
                        if dest is not None: os.close(dest)
                finally: os.close(child)
            elif kind=='file':
                total+=s.st_size;need(total<=100*1024*1024,'QA_PG_TREE_BYTES_EXCEEDED');dest=None
                if out is not None: dest=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=out)
                try:
                    actual,digest=read_held(current,name,s,dest,deadline)
                    if dest is not None: os.fchmod(dest,0o444);os.fsync(dest)
                finally:
                    if dest is not None: os.close(dest)
                entries.append({'path':path,'type':kind,'sha256':digest,'bytes':actual.st_size});metadata.append([path,*ident(actual)])
            else:
                target=os.readlink(name,dir_fd=current);need(link_valid(path,target),'QA_PG_LINK_ESCAPES_RUNTIME');need(ident(s)==ident(os.stat(name,dir_fd=current,follow_symlinks=False)),'QA_PG_LINK_CHANGED')
                if out is not None: os.symlink(target,name,dir_fd=out)
                entries.append({'path':path,'type':kind,'target':target});metadata.append([path,*ident(s)])
        need(names==sorted(os.listdir(current)) and ident(before)==ident(os.fstat(current)),'QA_PG_DIRECTORY_CHANGED')
    walk(fd,copy_fd)
    entries.sort(key=lambda x:x['path']);metadata.sort(key=lambda x:x[0]);return {'entries':entries,'metadata':metadata,'bytes':total,'rootIdentity':ident(os.fstat(fd))}

def manifest(value):
    entries=value['entries'];by_path={e['path']:e for e in entries};need(3<=len(entries)<=20000 and len(by_path)==len(entries),'QA_PG_MANIFEST_COUNT_INVALID')
    need(by_path.get('package.json',{}).get('sha256')==PACKAGE_SHA and by_path.get('pnpm-lock.yaml',{}).get('sha256')==LOCK_SHA,'QA_PG_INPUTS_CHANGED')
    for e in entries:
        need(path_valid(e['path']),'QA_PG_MANIFEST_PATH_INVALID')
        parent=PurePosixPath(e['path']).parent
        while str(parent)!='.': need(by_path.get(str(parent),{}).get('type')=='directory','QA_PG_MANIFEST_PARENT_MISSING');parent=parent.parent
        if e['type']=='symlink': need(link_valid(e['path'],e['target']),'QA_PG_MANIFEST_LINK_INVALID')
    return {'schemaVersion':1,'kind':'r29-independent-pg-runtime','root':'/qa-runtime','pgVersion':'8.23.0','packageJSONSHA256':PACKAGE_SHA,'entries':entries,'treeSHA256':sha(raw_json(entries))}

def check_cleanup(p,attempt):
    need(isinstance(p,dict) and p.get('kind')=='r29-pg-runtime-install-independent-cleanup' and p.get('attempt')==attempt and p.get('imageID')==IMAGE,'QA_PG_CLEANUP_SCOPE_INVALID')
    need(all(p.get(k) is True for k in ['processesComplete','dockerComplete','ownerComplete','relatedWritersAbsent','independent']) and p.get('productCodeExecuted') is False and p.get('pgRuntimeAccepted') is False,'QA_PG_CLEANUP_UNPROVEN')

def inspect_preparation():
    return {'kind':'r29-independent-pg-freeze-preparation','ready':False,'reviewPinned':REVIEW_PIN is not None,'cleanupPinned':CLEANUP_PIN is not None,'logicalRoot':'/qa-runtime','pgVersion':'8.23.0','actualRuntimeFrozen':False,'actualManifestPin':None,'modelsInvoked':False,'packagesExecutedByRoot':False}

if __name__=='__main__':
    import sys
    need(sys.argv[1:] in [[],['--inspect']],'QA_PG_FREEZE_PREPARATION_NOT_PINNED')
    print(json.dumps(inspect_preparation()))
