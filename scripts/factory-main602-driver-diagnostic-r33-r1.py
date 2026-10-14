"""One bounded diagnostic: two pinned terminal files, then the fixed public main tree.

No default activation, CLI, process census, candidate execution or protection waiver.
The reader functions below are copied exactly from their frozen sources.
"""
import base64, contextlib, datetime, hashlib, json, os, re, signal, stat, sys, time
from pathlib import Path
from types import ModuleType

SOURCE = '/home/superopen/All-Projects/msf'
HELPER = '/opt/jarvis-development/software-factory/project-autonomy-evidence.py'
HELPER_SHA256 = '57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2'
NAMESPACE = '/var/lib/jarvis-development/101/r33-pg4-qa-startup-main602-pgready-r7/454f612e7c27a68f5197006b99aa4f7d'
EXPECTED = {'sha256': '11446020cbec373e92ab22293352bde874b18e82cca11f3a5757454dc9b9e212',
            'files': 602, 'metadataSHA': 'ac7131117c9782bbdb3a064568d3d4b6ce42f952eebbe9e80e84c907625dec06',
            'identity': {'device': 66306, 'inode': 14417953}}
RECORDS = {
    'work/retained-pg4-driver-result.json': {'sha256': '6d030223a2afdcfe9fd8ad18f3b81b955526c50ba9d7d221cb8b6c33468cf5ef', 'bytes': 613},
    'work/startup-and-four-cases-9f4576f61038a95a.json': {'sha256': 'a7e462c6870b2a7713b6db7ed32a8faec1e093eea15e7a949ac585e6d8118e09', 'bytes': 1316},
}
REQUEST = {'schemaVersion': 1, 'kind': 'r33-main602-driver-diagnostic-r1-request',
           'purpose': 'main-four-conjunct-and-terminal-driver-two-file-diagnostic-only',
           'attempt': '454f612e7c27a68f5197006b99aa4f7d', 'maximumSeconds': 60,
           'fileStageSeconds': 15, 'mainStageSeconds': 30}

# FROZEN_FUNCTIONS_BEGIN
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

def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else str(v).encode()).hexdigest()

def canonical(v):return json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()

def stat_key(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]

@contextlib.contextmanager
def held(fd,phase):
    primary=None
    try:yield fd
    except BaseException as e:
        primary=e
        if not hasattr(e,'pg4_phase'):e.pg4_phase=phase
        raise
    finally:
        try:os.close(fd)
        except BaseException as e:
            if primary is None:e.pg4_phase=phase+'_CLOSE';raise
            primary.pg4_secondary=getattr(primary,'pg4_secondary',[])+[{'phase':phase+'_CLOSE','errorCode':'PG4_D_CLOSE_INCOMPLETE','errno':getattr(e,'errno',None)}]

@contextlib.contextmanager
def chain(path,owner=0):
    need(type(path) is str and path.startswith('/') and all(x not in ('','.','..') for x in path.split('/')[1:]),'PG4_D_PATH_CHANGED')
    with contextlib.ExitStack() as stack:
        fd=stack.enter_context(held(os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW),'ROOT'))
        for i,name in enumerate(path.split('/')[1:]):
            before=os.stat(name,dir_fd=fd,follow_symlinks=False);uid=owner if i==len(path.split('/'))-2 else 0
            need(stat.S_ISDIR(before.st_mode) and before.st_uid==before.st_gid==uid and not before.st_mode&0o022,'PG4_D_DIRECTORY_UNTRUSTED')
            child=stack.enter_context(held(os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=fd),'DIRECTORY'))
            need(stat_key(before)==stat_key(os.fstat(child)),'PG4_D_DIRECTORY_REPLACED');fd=child
        before=stat_key(os.fstat(fd));yield fd
        need(before==stat_key(os.fstat(fd))==stat_key(os.stat(path,follow_symlinks=False)),'PG4_D_DIRECTORY_CHANGED')

def file_row(root,name,pin,out):
    parent,_,leaf=name.rpartition('/');owner=1000 if parent=='evidence' else 0
    with chain(root+('/'+parent if parent else ''),owner) as fd:
        before=os.stat(leaf,dir_fd=fd,follow_symlinks=False);need(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==owner and before.st_nlink==1 and not before.st_mode&0o022 and before.st_size==pin['bytes'],'PG4_D_RECORD_UNTRUSTED')
        with held(os.open(leaf,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=fd),'RECORD') as f:
            need(stat_key(before)==stat_key(os.fstat(f)),'PG4_D_RECORD_REPLACED');raw=b''
            try:
                while len(raw)<=before.st_size:
                    block=os.read(f,min(65536,before.st_size+1-len(raw)))
                    if not block:break
                    raw+=block
                row={'sha256':digest(raw),'bytes':len(raw),'metadata':stat_key(before),'metadataSHA256':digest(canonical(stat_key(before))),'readComplete':True}
                if name in ('control/postgres.env','control/pg4-runner.env','tools/pg4-db-url.txt'):row['privateEnvironmentBytesWithheld']=True
                else:row['base64']=base64.b64encode(raw).decode()
                out[name]=row
                need(len(raw)==before.st_size and row['sha256']==pin['sha256'] and stat_key(before)==stat_key(os.fstat(f))==stat_key(os.stat(leaf,dir_fd=fd,follow_symlinks=False)),'PG4_D_RECORD_CHANGED')
            except BaseException:
                out[name]={'prefixBase64':None if name in ('control/postgres.env','control/pg4-runner.env','tools/pg4-db-url.txt') else base64.b64encode(raw).decode(),'prefixSHA256':digest(raw),'prefixBytes':len(raw),'readComplete':False};raise
        return row
# FROZEN_FUNCTIONS_END

ERROR_CODES = frozenset({
    'R28_HOST_ROOT_CHAIN_UNTRUSTED', 'R28_HOST_FILE_INVALID', 'R28_HOST_FILE_CHANGED',
    'R28_HOST_SOURCE_READ_CHANGED', 'R28_HOST_SOURCE_DIRECTORY_REPLACED',
    'EVIDENCE_PATH_INVALID', 'EVIDENCE_RELATIVE_PATH_INVALID', 'EVIDENCE_PRIVATE_PATH_REFUSED',
    'EVIDENCE_FILE_NOT_REGULAR_SINGLE_LINK', 'EVIDENCE_FILE_LIMIT', 'SOURCE_CHANGED_DURING_READ',
    'SOURCE_SYMLINK_NOT_ALLOWED', 'SOURCE_HARDLINK_NOT_ALLOWED', 'SOURCE_MANIFEST_LIMIT',
    'SOURCE_SPECIAL_FILE_NOT_ALLOWED', 'PG4_D_PATH_CHANGED', 'PG4_D_DIRECTORY_UNTRUSTED',
    'PG4_D_DIRECTORY_REPLACED', 'PG4_D_DIRECTORY_CHANGED', 'PG4_D_RECORD_UNTRUSTED',
    'PG4_D_RECORD_REPLACED', 'PG4_D_RECORD_CHANGED', 'PG4_D_CLOSE_INCOMPLETE',
    'R33_MAIN_DRIVER_DIAG_FIXED_REQUEST_REQUIRED', 'R33_MAIN_DRIVER_DIAG_PROFILE_REQUIRED',
    'R33_MAIN_DRIVER_DIAG_PARENT_TIMER_REQUIRED', 'R33_MAIN_DRIVER_DIAG_DEADLINE',
    'R33_MAIN_DRIVER_DIAG_TWO_READS_CHANGED', 'R33_MAIN_DRIVER_DIAG_HELPER_CHANGED',
    'R33_MAIN_DRIVER_DIAG_HELPER_LIMITS_CHANGED', 'R33_MAIN_DRIVER_DIAG_HELD_ROOT_CHANGED',
    'R33_MAIN_DRIVER_DIAG_FINAL_ROOT_CHANGED', 'R33_MAIN_DRIVER_DIAG_READ_INCOMPLETE',
})
EXCEPTION_CLASSES = frozenset({'RuntimeError', 'ValueError', 'OSError', 'FileNotFoundError',
    'PermissionError', 'NotADirectoryError', 'IsADirectoryError', 'BlockingIOError',
    'InterruptedError', 'TimeoutError', 'MemoryError', 'RecursionError', 'UnicodeDecodeError'})
CLOSE_PHASES = frozenset({'ROOT_CLOSE', 'DIRECTORY_CLOSE', 'RECORD_CLOSE',
                         'MAIN_ROOT_CLOSE', 'MAIN_NAMED_ROOT_CLOSE'})


def safe_errno(error):
    value = getattr(error, 'errno', None)
    return value if type(value) is int and 0 < value <= 4095 else None


def closed(error, phase):
    message = str(error)
    secondary = []
    for item in getattr(error, 'pg4_secondary', []):
        secondary.append({'phase': item.get('phase') if item.get('phase') in CLOSE_PHASES else 'UNKNOWN_CLOSE',
                          'errorCode': 'PG4_D_CLOSE_INCOMPLETE',
                          'errno': item.get('errno') if type(item.get('errno')) is int and 0 < item['errno'] <= 4095 else None})
    return {'phase': phase, 'errorCode': message if message in ERROR_CODES else 'R33_MAIN_DRIVER_DIAG_READ_INCOMPLETE',
            'exceptionClass': type(error).__name__ if type(error).__name__ in EXCEPTION_CLASSES else 'OtherException',
            'errno': safe_errno(error), 'secondaryFailures': secondary}


def deadline(*_):
    raise RuntimeError('R33_MAIN_DRIVER_DIAG_DEADLINE')


def arm_until(absolute_end):
    remaining = absolute_end - time.monotonic()
    need(remaining > 0, 'R33_MAIN_DRIVER_DIAG_DEADLINE')
    signal.setitimer(signal.ITIMER_REAL, remaining)


def expected_matches(value):
    return {'fingerprint': value['sha256'] == EXPECTED['sha256'],
            'files': value['files'] == EXPECTED['files'],
            'metadata': value['metadataSHA'] == EXPECTED['metadataSHA'],
            'rootIdentity': value['identity'] == EXPECTED['identity']}


def read_terminal_pair(result, total_end):
    phase = 'FILES_BEGIN'
    stage_end = min(total_end, time.monotonic() + REQUEST['fileStageSeconds'])
    try:
        arm_until(stage_end)
        for index, (name, pin) in enumerate(RECORDS.items()):
            slot = result['files'][name]
            first, second = {}, {}
            try:
                phase = 'DRIVER_FIRST' if index == 0 else 'CAPTURE_FIRST'
                arm_until(stage_end)
                file_row(NAMESPACE, name, pin, first)
                phase = 'DRIVER_SECOND' if index == 0 else 'CAPTURE_SECOND'
                arm_until(stage_end)
                file_row(NAMESPACE, name, pin, second)
                need(first[name] == second[name], 'R33_MAIN_DRIVER_DIAG_TWO_READS_CHANGED')
                slot['twoReadsStable'] = True
                slot['readComplete'] = True
            except BaseException as error:
                slot['error'] = closed(error, phase)
                result['errors'].append(slot['error'])
            finally:
                slot['first'] = first.get(name)
                slot['second'] = second.get(name)
        result['readComplete'] = all(row['readComplete'] for row in result['files'].values())
        result['allReaderDescriptorsClosed'] = result['readComplete']
    except BaseException as error:
        result['errors'].append(closed(error, phase))


def read_main_frames(result, total_end):
    phase = 'MAIN_BEGIN'
    stage_end = min(total_end, time.monotonic() + REQUEST['mainStageSeconds'])
    try:
        arm_until(stage_end)
        phase = 'LOAD_FIXED_HELPER'
        helper_body = private_read(HELPER)
        result['helperSHA256'] = digest(helper_body)
        need(result['helperSHA256'] == HELPER_SHA256, 'R33_MAIN_DRIVER_DIAG_HELPER_CHANGED')
        global h
        h = ModuleType('r33_main_driver_trusted_evidence')
        exec(compile(helper_body, HELPER, 'exec'), h.__dict__)
        need((h.MAX_FILES, h.MAX_TOTAL, h.MAX_FILE) == (20000, 209715200, 20971520),
             'R33_MAIN_DRIVER_DIAG_HELPER_LIMITS_CHANGED')
        result['helperVerified'] = True
        phase = 'OPEN_FIXED_MAIN'
        with held(h.open_directory(SOURCE), 'MAIN_ROOT') as root:
            held_identity = identity(root)
            for index in range(2):
                phase = 'MAIN_FRAME_FIRST' if index == 0 else 'MAIN_FRAME_SECOND'
                try:
                    arm_until(stage_end)
                    value, fingerprint = source_state(SOURCE)
                    need(value['identity'] == held_identity, 'R33_MAIN_DRIVER_DIAG_HELD_ROOT_CHANGED')
                    result['frames'][index] = {'tuple': value, 'manifest': fingerprint['manifest'],
                        'rootMetadata9': list(key(os.fstat(root))), 'expectedMatches': expected_matches(value)}
                except BaseException as error:
                    result['errors'].append(closed(error, phase))
            phase = 'FINAL_NAMED_MAIN'
            arm_until(stage_end)
            with held(h.open_directory(SOURCE), 'MAIN_NAMED_ROOT') as named:
                need(identity(named) == identity(root) == held_identity, 'R33_MAIN_DRIVER_DIAG_FINAL_ROOT_CHANGED')
        if all(frame is not None for frame in result['frames']):
            left, right = result['frames']
            result['framesEqual'] = {'tuple': left['tuple'] == right['tuple'],
                'manifest': left['manifest'] == right['manifest'],
                'rootMetadata9': left['rootMetadata9'] == right['rootMetadata9']}
        result['readComplete'] = not result['errors'] and all(frame is not None for frame in result['frames'])
        result['allReaderDescriptorsClosed'] = result['readComplete']
    except BaseException as error:
        result['errors'].append(closed(error, phase))


def run(payload=None):
    # Refuse missing or changed input before any OS observation.
    need(type(payload) is dict and payload == REQUEST and
         all(type(payload.get(key)) is int for key in ('schemaVersion', 'maximumSeconds', 'fileStageSeconds', 'mainStageSeconds')),
         'R33_MAIN_DRIVER_DIAG_FIXED_REQUEST_REQUIRED')
    files = {'readComplete': False, 'allReaderDescriptorsClosed': False,
             'files': {name: {'first': None, 'second': None, 'twoReadsStable': False,
                              'readComplete': False, 'error': None} for name in RECORDS}, 'errors': []}
    main = {'helperSHA256': None, 'helperVerified': False, 'frames': [None, None],
            'framesEqual': None, 'errors': [], 'readComplete': False,
            'allReaderDescriptorsClosed': False, 'perFileMetadataRowsRetained': False}
    value = {'schemaVersion': 1, 'kind': 'r33-main602-driver-diagnostic-r1-observation',
             'request': REQUEST, 'source': SOURCE, 'expected': EXPECTED, 'records': RECORDS,
             'helperSHA256': HELPER_SHA256, 'filesPhase': files, 'mainPhase': main,
             'diagnosticReadComplete': False, 'firstClosedError': None,
             'readOnly': True, 'originalIntegerDomainPreserved': True,
             'mainBaselineQualified': False, 'fullProtectionQualified': False,
             'currentResourceScopeClosedVerified': False, 'actualPG4Qualified': False,
             'productAccepted': False, 'modelsInvoked': False, 'mutationsPerformed': False,
             'observedAt': None}
    phase = 'RUNTIME_GATE'
    try:
        timer_sample_started = time.monotonic()
        remaining, interval = signal.getitimer(signal.ITIMER_REAL)
        need(os.name == 'posix' and os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0
             and sys.flags.isolated == 1, 'R33_MAIN_DRIVER_DIAG_PROFILE_REQUIRED')
        need(0 < remaining <= 60 and interval == 0, 'R33_MAIN_DRIVER_DIAG_PARENT_TIMER_REQUIRED')
        # Sampling before getitimer cannot move the inherited absolute deadline later.
        total_end = timer_sample_started + remaining
        signal.signal(signal.SIGALRM, deadline)
        phase = 'FILES_PHASE'
        read_terminal_pair(files, total_end)
        phase = 'MAIN_PHASE'
        read_main_frames(main, total_end)
        phase = 'FINALIZE'
        arm_until(total_end)
        value['diagnosticReadComplete'] = files['readComplete'] and main['readComplete']
    except BaseException as error:
        value['firstClosedError'] = closed(error, phase)
    value['observedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return value
