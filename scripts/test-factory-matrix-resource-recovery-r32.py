"""Production recovery functions with controlled OS/Docker adapters only.
Windows adapters do not establish Linux permissions or actual resource cleanup.
"""
import base64, copy, datetime, hashlib, importlib.util, json, pathlib, types, unittest

PATH=pathlib.Path('scripts/factory-matrix-resource-recovery-r32.py')
spec=importlib.util.spec_from_file_location('controlled_recovery',PATH)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
DIAG_PATH=pathlib.Path('.jarvis-dev/maintenance/r32-matrix-failure-diagnostic-private-1791847729585-9359203e-c95a-42d9-8bb0-355afce03a78.json')
DIAG_RAW=DIAG_PATH.read_bytes();assert m.sha(DIAG_RAW)==m.DIAG_SHA
DIAG=json.loads(json.loads(DIAG_RAW)['stdout'])
PG=json.loads(base64.b64decode(DIAG['exact']['postgres']['stdoutBase64']))[0]
VOL=json.loads(base64.b64decode(DIAG['exact']['postgres-data']['stdoutBase64']))[0]

def reject(fn,code):
    try:fn()
    except RuntimeError as e:assert code in str(e);return
    raise AssertionError('invalid scope accepted')

def module():
    v={k:getattr(m,k) for k in dir(m) if not k.startswith('__')}
    # Rebind real function globals to an isolated controlled namespace.
    for k,value in list(v.items()):
        if isinstance(value,types.FunctionType):v[k]=types.FunctionType(value.__code__,v,k,value.__defaults__)
    return v

def fixture():
    v=module();events=[];files={};dirs=set();now=1791850000
    meta=types.SimpleNamespace(st_mode=0o40700)
    osfake=types.SimpleNamespace(geteuid=lambda:0,getegid=lambda:0,lexists=lambda p:p in dirs,
        path=types.SimpleNamespace(lexists=lambda p:p in dirs),mkdir=lambda *a,**kw:events.append('mkdir'),fsync=lambda _:events.append('dirsync'),fstat=lambda _:meta)
    v.update(os=osfake,signal=types.SimpleNamespace(SIGALRM=1,signal=lambda *a:None,alarm=lambda _:None),time=types.SimpleNamespace(time=lambda:now))
    records={p:x['sha256'] for p,x in DIAG['files'].items()}
    v['original_records']=lambda _:dict(records)
    v['held']=lambda _: [(1,None,None,[0]*9)]
    v['check_chain']=lambda _:None;v['close_chain']=lambda _:None;v['owned_directory_write_done']=lambda *a:None
    v['current']=lambda *a:events.append(('census',a)) or {'postgresPresent':a[0],'postgresVolumePresent':a[1]}
    def wx(path,b):
        assert path not in files;files[path]=b;events.append(('wx',path))
    v['wx']=wx;v['read']=lambda path,*a:files[path]
    def docker(args):
        assert args in [['container','rm',m.PGID],['volume','rm',m.name('postgres-data')]]
        events.append(('docker',args));return types.SimpleNamespace(returncode=0,stdout=(args[-1]+'\n').encode())
    v['docker']=docker
    at=datetime.datetime.fromtimestamp(now,datetime.timezone.utc).isoformat()
    review={'kind':'r32-failed-matrix-resource-recovery-independent-local-review','programSHA256':'a'*64,'callerSHA256':'b'*64,'remainingP0P1':0,'staticPreparationReady':True,'remoteOperations':False}
    protection={'kind':'software-factory-r29-new-protection-contract-observation','at':at,'ready':True,'modelsInvoked':False,**{k:True for k in ['protectedInventoryFullyVerified','fullQueueSQLVerified','nodeACKIdle','queueIdle','profileUnchanged']}}
    pre={'kind':'software-factory-r32-truth-gate-recovery-preflight','at':at,'attempt':m.ATTEMPT,'runID':m.RUN,**{k:True for k in ['ready','currentProcessScopeClean','currentResourcesRemain','originalRecordsUnchanged','unknownOriginalCreationIdentityPreserved']},**{k:False for k in ['originalMatrixCleanupQualified','cleanupIndependentlyVerified','modelsInvoked','resourcesRemoved','remoteMutations']},'evidence':{k:{'path':'controlled.json','sha256':'c'*64} for k in ['host','protectionBefore','protectionAfter']}}
    p={'action':'execute','recoveryNonce':'f'*32,'originalAttempt':m.ATTEMPT,'originalRunID':m.RUN,'programSHA256':'a'*64,'callerSHA256':'b'*64,'diagnosticRawBase64':base64.b64encode(DIAG_RAW).decode()}
    for key,value in [('review',review),('protection',protection),('preflight',pre)]:
        raw=m.canonical(value);p[key+'RawBase64']=base64.b64encode(raw).decode();p[key+'SHA256']=m.sha(raw)
    return v,p,events,files,pre

class ControlledRecovery(unittest.TestCase):
    def test_actual_diagnostic_current_identity_and_all_changed_variants(self):
        m.pg_bound(PG);m.volume_bound(VOL)
        for change in [lambda x:x.update(Id='0'*64),lambda x:x['State'].update(Running=True),lambda x:x['State'].update(Pid=1),lambda x:x['Config'].update(User='1000'),lambda x:x['HostConfig'].update(CapAdd=['SYS_ADMIN'])]:
            bad=copy.deepcopy(PG);change(bad);reject(lambda:m.pg_bound(bad),'R32_RECOVERY_')
        bad=copy.deepcopy(VOL);bad['CreatedAt']='changed';reject(lambda:m.volume_bound(bad),'VOLUME_CHANGED')

    def test_intent_and_control_durable_before_only_two_nonforce_removals(self):
        v,p,e,f,_=fixture();r=v['main'](p)
        intent=m.BASE+'/'+p['recoveryNonce']+'/intent.json'
        first=next(i for i,x in enumerate(e) if isinstance(x,tuple) and x[0]=='docker')
        self.assertLess(e.index(('wx',intent)),first)
        self.assertEqual([x[1] for x in e if isinstance(x,tuple) and x[0]=='docker'],[['container','rm',m.PGID],['volume','rm',m.name('postgres-data')]])
        self.assertEqual(r['result']['status'],'removed');self.assertFalse(r['result']['cleanupIndependentlyVerified']);self.assertFalse(r['result']['originalMatrixCleanupQualified'])
        self.assertTrue(all(path.startswith(m.BASE+'/'+p['recoveryNonce']+'/') for path in f));self.assertTrue(r['result']['unknownOriginalCreationIdentityPreserved'])

    def test_preflight_incomplete_or_stale_never_mutates(self):
        for field in ['currentProcessScopeClean','currentResourcesRemain','originalRecordsUnchanged']:
            v,p,e,f,pre=fixture();pre[field]=False;raw=m.canonical(pre);p['preflightSHA256']=m.sha(raw);p['preflightRawBase64']=base64.b64encode(raw).decode()
            reject(lambda:v['main'](p),'PROCESS_SCOPE_UNPROVEN');self.assertFalse(e);self.assertFalse(f)
        v,p,e,_,pre=fixture();pre['at']='2020-01-01T00:00:00Z';raw=m.canonical(pre);p['preflightSHA256']=m.sha(raw);p['preflightRawBase64']=base64.b64encode(raw).decode()
        reject(lambda:v['main'](p),'PREFLIGHT_STALE');self.assertFalse(e)

    def test_private_intent_failure_blocks_all_removal(self):
        v,p,e,_,_=fixture();real=v['wx']
        def wx(path,raw):
            if path.endswith('/intent.json'):raise OSError('controlled save failed')
            return real(path,raw)
        v['wx']=wx
        with self.assertRaises(OSError):v['main'](p)
        self.assertFalse(any(isinstance(x,tuple) and x[0]=='docker' for x in e))

    def test_ambiguous_remove_retains_failed_result_and_no_second_remove(self):
        v,p,e,_,_=fixture()
        def unknown(args):e.append(('docker',args));raise RuntimeError('R32_RECOVERY_CONTAINER_REMOVE_UNKNOWN')
        v['docker']=unknown;r=v['main'](p)
        self.assertEqual(r['result']['status'],'failed');self.assertEqual(r['result']['removedRoles'],[]);self.assertEqual(len([x for x in e if isinstance(x,tuple) and x[0]=='docker']),1)
        self.assertFalse(r['result']['originalMatrixCleanupQualified'])

    def test_old_record_drift_before_first_remove_is_failed_without_removal(self):
        v,p,e,_,_=fixture();count=0
        def drift(_):
            nonlocal count;count+=1;return {'record':'a' if count==1 else 'b'}
        v['original_records']=drift;r=v['main'](p)
        self.assertEqual(r['result']['status'],'failed');self.assertFalse(r['result']['originalRecordsUnchanged']);self.assertFalse(any(isinstance(x,tuple) and x[0]=='docker' for x in e))

    def test_readonly_check_never_replays_removal_and_binds_root_intent(self):
        v,p,e,_,_=fixture();r=v['main'](p);before=len([x for x in e if isinstance(x,tuple) and x[0]=='docker']);p['action']='check';c=v['main'](p)
        self.assertTrue(c['readOnly']);self.assertEqual(c['rootIntent'],r['rootIntent']);self.assertEqual(len([x for x in e if isinstance(x,tuple) and x[0]=='docker']),before)

    def test_owned_directory_write_updates_only_leaf_bookkeeping(self):
        v=module();k=[1,2,0,0,0o40700,2,10,20,30];parent=list(k);parent[1]=1
        def stat_from(a):return types.SimpleNamespace(**dict(zip(['st_dev','st_ino','st_uid','st_gid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns'],a)))
        current={1:list(parent),2:list(k)};current[2][6:]=[11,21,31]
        v['os']=types.SimpleNamespace(fstat=lambda fd:stat_from(current[fd]),stat=lambda *a,**kw:stat_from(current[2]))
        chain=[(1,None,None,parent),(2,1,'child',k)];v['owned_directory_write_done'](chain);self.assertEqual(chain[-1][3],current[2])
        for index in [0,1,2,3,4,5]:
            current[2]=list(k);current[2][index]+=1
            reject(lambda:v['owned_directory_write_done']([(1,None,None,parent),(2,1,'child',k)]),'DIRECTORY_')
        current[2]=list(k);current[2][5]+=1;v['owned_directory_write_done']([(1,None,None,parent),(2,1,'child',k)],True)
        current[1][7]+=1;reject(lambda:v['owned_directory_write_done']([(1,None,None,parent),(2,1,'child',k)],True),'DIRECTORY_CHANGED')

    def test_unknown_absence_status_and_foreign_presence_never_safe(self):
        v=module();v['docker']=lambda _:types.SimpleNamespace(returncode=1,stdout=b'[]',stderr=b'permission denied')
        reject(lambda:v['inspect']('postgres'),'ABSENCE_UNKNOWN')
        v=module();v['inspect']=lambda role:PG if role=='postgres' else VOL if role=='postgres-data' else {'foreign':True} if role=='redis' else None
        reject(lambda:v['current'](True,True),'UNEXPECTED_PRESENT')

if __name__=='__main__':unittest.main()
