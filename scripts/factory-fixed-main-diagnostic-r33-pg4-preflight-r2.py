"""Prepared fixed-main-only observation; no stdin, CLI, default activation or top-level read."""
import os, stat, json, hashlib, signal, re
from pathlib import Path
from types import ModuleType
from contextlib import contextmanager

SOURCE = '/home/superopen/All-Projects/msf'
HELPER = '/opt/jarvis-development/software-factory/project-autonomy-evidence.py'
HELPER_SHA256 = '57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2'
EXPECTED = {'sha256': '151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea', 'files': 593,
            'metadataSHA': 'ba05cf3d59e9320d2c9270ee15e906b5835b9f6338c9054cb2558c2c38185fc5',
            'identity': {'device': 66306, 'inode': 14417953}}
REQUEST = {'schemaVersion': 1, 'kind': 'r33-pg4-preflight-fixed-main-diagnostic-request', 'source': SOURCE, 'maximumSeconds': 30}
EXTRACTION_SOURCE = {'path': 'scripts/factory-verifier-host-r28.mjs', 'sha256': '967bc2394240a92059d177c0119544f833059080bc4b3d0852ba2140a5256308', 'functionSHA256': {'need': 'e4eaf757341336073fd627bfdb678da5e330c94ded6b36a13057b7a9269a36ca', 'key': 'f7f3c65a770294ea6637cb4e4a0e5e2b47b2296806d8330343ac0bcee243285b', 'trusted': 'bc9f4f7f541974c511cbc0259ce315c97941019bd4a07699e61f2bf50c0ecfb5', 'private_read': 'c9a7ad35a64d0cf1d6e75ae44f971fee508900293f16ca00a416c5fe25644ce6', 'hashv': '6a07494eaebe3cf21c1c259e2aea12513a71a74aab7e12a2fd3f07b5b9e84b40', 'identity': 'cb484ffb2206222b71dc010209abd6e6ca8657654376087c7f9b72046b127bf3', 'fingerprint_fd': 'e9d5c5d930570b82c8c6cc5a25150046b24d14b573479a9018ca564525867d57', 'source_state': '14238b55dac51c6d398f5fb8f64918ca47b63f6554399862eae3d482349318d7'}}
EXTRACTION_SOURCE['functionSHA256Domain'] = 'python-ast-source-segment-utf8-no-trailing-newline'

def need(v,c):
 if not v:raise RuntimeError(c)

def key(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)

def trusted(q):
 q=Path(q)
 for part in [q,*q.parents]:
  s=part.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R28_HOST_ROOT_CHAIN_UNTRUSTED')
 return q

def private_read(q,limit=2097152):
 q=trusted(q);fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and 0<=s.st_size<=limit,'R28_HOST_FILE_INVALID');data=bytearray()
  while len(data)<=limit:
   part=os.read(fd,min(65536,limit+1-len(data)))
   if not part:break
   data.extend(part)
  a=os.fstat(fd);need(key(s)==key(a)==key(q.lstat()) and len(data)==s.st_size,'R28_HOST_FILE_CHANGED');return bytes(data)
 finally:os.close(fd)

def hashv(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

def identity(fd):
 s=os.fstat(fd);return {'device':s.st_dev,'inode':s.st_ino}

def fingerprint_fd(fd):
 entries=[];h.walk(fd,entries);value=''.join(e['path']+'\0'+e['sha256']+'\n' for e in entries).encode()
 return {'sha256':hashlib.sha256(value).hexdigest(),'files':len(entries),'bytes':sum(e['bytes'] for e in entries),'manifest':entries}

def source_state(path):
 root=h.open_directory(path)
 try:
  first=fingerprint_fd(root);meta=[]
  for e in first['manifest']:
   fd=h.open_relative(root,e['path'])
   try:
    s=os.fstat(fd);meta.append([e['path'],s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns])
   finally:os.close(fd)
  second=fingerprint_fd(root);need(first==second,'R28_HOST_SOURCE_READ_CHANGED');ident=identity(root)
  named=h.open_directory(path)
  try:need(identity(named)==ident,'R28_HOST_SOURCE_DIRECTORY_REPLACED')
  finally:os.close(named)
  return {'sha256':first['sha256'],'files':first['files'],'bytes':first['bytes'],'metadataSHA':hashlib.sha256(json.dumps(meta,separators=(',',':')).encode()).hexdigest(),'stable':True,'identity':ident},first
 finally:os.close(root)

@contextmanager
def diagnostic_fd(fd):
    primary = None
    try:
        yield fd
    except BaseException as error:
        primary = error
        raise
    finally:
        try:
            os.close(fd)
        except BaseException as error:
            if primary is None:
                raise
            primary.secondaryDiagnosticCloseFailure = getattr(error, 'errno', None)

def expected_matches(value):
    return {'fingerprint': value['sha256'] == EXPECTED['sha256'],
            'files': value['files'] == EXPECTED['files'],
            'metadata': value['metadataSHA'] == EXPECTED['metadataSHA'],
            'rootIdentity': value['identity'] == EXPECTED['identity']}

def observe_fixed_main_diagnostic_r33(payload=None):
    # Explicit request refusal precedes timer, UID, helper or source access.
    need(type(payload) is dict and payload == REQUEST and type(payload.get('schemaVersion')) is int
         and type(payload.get('maximumSeconds')) is int, 'R33_MAIN_DIAG_FIXED_REQUEST_REQUIRED')
    result = {'schemaVersion': 1, 'kind': 'r33-pg4-preflight-fixed-main-source-diagnostic', 'source': SOURCE,
              'maximumSeconds': 30, 'expected': EXPECTED, 'extractedAuthority': EXTRACTION_SOURCE,
              'helperSHA256': None, 'helperVerified': False, 'diagnosticReadComplete': False,
              'frames': [], 'framesEqual': None, 'readError': None,
              'legacyPrimaryErrorRecovered': False, 'originalMetadataRowsDirectlyExported': False,
              'independentPerFileMetadataReadPerformed': False,
              'perFileMetadataRowsRetained': False,
              'actualFullProtectionQualified': False, 'currentR6CleanupQualified': False,
              'modelsInvoked': False, 'productCodeExecuted': False, 'mutationsPerformed': False}
    phase = 'RUNTIME_GATE'
    try:
        remaining, interval = signal.getitimer(signal.ITIMER_REAL)
        need(os.name == 'posix' and os.geteuid() == 0 and 0 < remaining <= 30 and interval == 0,
             'R33_MAIN_DIAG_PARENT_TIMER_ROOT_REQUIRED')
        phase = 'LOAD_FIXED_HELPER'
        helper_body = private_read(HELPER)
        result['helperSHA256'] = hashlib.sha256(helper_body).hexdigest()
        need(result['helperSHA256'] == HELPER_SHA256, 'R33_MAIN_DIAG_HELPER_CHANGED')
        global h
        h = ModuleType('r28_public_observer')
        exec(compile(helper_body, HELPER, 'exec'), h.__dict__)
        result['helperVerified'] = True
        phase = 'OPEN_FIXED_ROOT'
        with diagnostic_fd(h.open_directory(SOURCE)) as root:
            held_identity = identity(root)
            for index in range(2):
                phase = 'SOURCE_STATE_FIRST' if index == 0 else 'SOURCE_STATE_SECOND'
                value, fingerprint = source_state(SOURCE)  # Exact legacy body, including its own close behavior.
                need(value['identity'] == held_identity, 'R33_MAIN_DIAG_HELD_ROOT_CHANGED')
                result['frames'].append({'tuple': value, 'manifest': fingerprint['manifest'],
                    'rootMetadata9': list(key(os.fstat(root))), 'expectedMatches': expected_matches(value)})
            phase = 'FINAL_NAMED_ROOT'
            with diagnostic_fd(h.open_directory(SOURCE)) as named:
                need(identity(named) == identity(root) == held_identity, 'R33_MAIN_DIAG_FINAL_ROOT_CHANGED')
        left, right = result['frames']
        result['framesEqual'] = {'tuple': left['tuple'] == right['tuple'],
            'manifest': left['manifest'] == right['manifest'],
            'rootMetadata9': left['rootMetadata9'] == right['rootMetadata9']}
        result['diagnosticReadComplete'] = True
    except BaseException as error:
        message = str(error)
        legacy_codes = {'R28_HOST_ROOT_CHAIN_UNTRUSTED', 'R28_HOST_FILE_INVALID', 'R28_HOST_FILE_CHANGED',
                        'R28_HOST_SOURCE_READ_CHANGED', 'R28_HOST_SOURCE_DIRECTORY_REPLACED'}
        code = message if message in legacy_codes or re.fullmatch('R33_MAIN_DIAG_[A-Z0-9_]+', message) else 'R33_MAIN_DIAG_READ_INCOMPLETE'
        result['readError'] = {'phase': phase, 'errorCode': code,
                               'errno': error.errno if isinstance(error, OSError) else None}
    return result
