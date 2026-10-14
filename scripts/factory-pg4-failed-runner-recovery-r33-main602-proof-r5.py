"""One nonforce removal of the exact failed runner; independent post is separate.

Definitions are assembled with the reviewed failure observer/census authority.
The old failed namespace, state and missing created receipt are never amended.
"""
import base64,datetime,json,os,stat,time
RECOVERY_PARENT='/var/lib/jarvis-development/101'
RECOVERY_NAME='r33-pg4-failed-r5-runner-recovery-69e5926d169160f2b70eaab63c1b4e23'
WHOLE_KIND='software-factory-r33-current-main602-single-entry-proof-r2-protection-observation'
WHOLE_SHA='480fd1c871d7ac08668ee11633cb47e5505c478397ec70ce1c97b9ab6599e28e'

def fresh_time(value):
    at=datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
    need(-30<=time.time()-at<300,'PG4_RF_PREFLIGHT_OR_PROTECTION_STALE')

def root_intent(packet):
    # The only mutable directory bookkeeping is our exact newly created sibling.
    with chain(RECOVERY_PARENT) as directory:
        before=stat_key(os.fstat(directory));parent=os.dup(directory)
    with held(parent,'RECOVERY_PARENT'):
        need(before==stat_key(os.fstat(parent))==stat_key(os.stat(RECOVERY_PARENT,follow_symlinks=False)),'PG4_RF_RECOVERY_PARENT_CHANGED')
        try:os.stat(RECOVERY_NAME,dir_fd=parent,follow_symlinks=False)
        except FileNotFoundError:pass
        else:raise RuntimeError('PG4_RF_ROOT_INTENT_EXISTS_NO_REPLAY')
        os.mkdir(RECOVERY_NAME,0o700,dir_fd=parent);os.fsync(parent);after=stat_key(os.fstat(parent))
        need(after[:5]==before[:5] and after[5]==before[5]+1 and after==stat_key(os.stat(RECOVERY_PARENT,follow_symlinks=False)),'PG4_RF_RECOVERY_PARENT_CHANGED')
        with held(os.open(RECOVERY_NAME,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent),'RECOVERY_DIRECTORY') as directory:
            before=stat_key(os.fstat(directory));need(before[2]==before[3]==0 and stat.S_IMODE(before[4])==0o700,'PG4_RF_RECOVERY_DIRECTORY_UNTRUSTED')
            raw=canonical(packet)
            with held(os.open('intent.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=directory),'RECOVERY_INTENT') as fd:
                remaining=memoryview(raw)
                while remaining:
                    written=os.write(fd,remaining);need(written>0,'PG4_RF_RECOVERY_INTENT_SHORT_WRITE');remaining=remaining[written:]
                os.fchmod(fd,0o600);os.fsync(fd)
            os.fsync(directory)
            with held(os.open('intent.json',os.O_RDONLY|os.O_NOFOLLOW,dir_fd=directory),'RECOVERY_INTENT_READBACK') as fd:
                s=os.fstat(fd);need(s.st_uid==s.st_gid==0 and s.st_nlink==1 and stat.S_ISREG(s.st_mode) and stat.S_IMODE(s.st_mode)==0o600 and s.st_size==len(raw),'PG4_RF_RECOVERY_INTENT_UNTRUSTED');observed=os.read(fd,len(raw)+1);need(observed==raw,'PG4_RF_RECOVERY_INTENT_READBACK_CHANGED')
            after=stat_key(os.fstat(directory));need(after[:6]==before[:6] and after==stat_key(os.stat(RECOVERY_NAME,dir_fd=parent,follow_symlinks=False)),'PG4_RF_RECOVERY_DIRECTORY_CHANGED')
    return {'path':RECOVERY_PARENT+'/'+RECOVERY_NAME+'/intent.json','sha256':digest(raw),'bytes':len(raw)}

def recovery_process_clear(frame):
    return all(a['complete'] and a['present'] is False for a in frame['actors']) and frame['unit']['complete'] and frame['unit']['currentStopped'] and frame['cgroup']['complete'] and frame['cgroup']['absent'] and not frame['cgroup']['members']

def recover_failed_runner(payload=None):
    result={'schemaVersion':1,'kind':'r33-pg4-failed-runner-recovery-result','protocol':'PG4_FAILED_SCOPE_RECOVERY_R5_V1','ready':False,'attempt':'69e5926d169160f2b70eaab63c1b4e23','rootIntent':None,'removeAttempted':False,'nonforceRemoveAcknowledged':False,'unknownOriginalRunnerCreationIdentityPreserved':True,'originalPG4Failed':True,'currentResourceScopeClosedVerified':False,'actualPG4Qualified':False,'productAccepted':False,'modelsInvoked':False,'signalsSent':False,'privateCLICaptures':[],'firstClosedError':None}
    if payload is None:result['errorCode']='PG4_RF_ACTUAL_RECOVERY_CONTEXT_REQUIRED';return result
    phase='input'
    try:
        need(type(payload) is dict and set(payload)=={'schemaVersion','kind','protocol','scopeParameters','preflightRootStdoutBase64','protectionBeforeRawBase64','callerSHA256','workerSHA256','preflightWireSHA256'},'PG4_RF_RECOVERY_INPUT_REQUIRED')
        need(payload['schemaVersion']==1 and payload['kind']=='r33-pg4-failed-runner-recovery-input' and payload['protocol']==PROTOCOL and all(H.fullmatch(payload[x]) for x in ('callerSHA256','workerSHA256','preflightWireSHA256')),'PG4_RF_RECOVERY_CONTEXT_CHANGED')
        v=validate_payload(payload['scopeParameters']);need(v['phase']=='preflight','PG4_RF_PREFLIGHT_SCOPE_REQUIRED');proof=decode(base64.b64decode(payload['preflightRootStdoutBase64'],validate=True));protection=decode(base64.b64decode(payload['protectionBeforeRawBase64'],validate=True))
        need(proof['kind']=='r33-pg4-failed-scope-host-observation' and proof['protocol']==PROTOCOL and proof['phase']=='preflight' and proof['attempt']==ATTEMPT and proof['contextSHA256']==v['contextSHA256'] and proof['readyForExactRunnerRecovery'] is True and proof['currentProcessScopeClean'] is True and proof['sourceRawBindingVerified'] is True and proof['recordsStable'] is True and proof['namespaceStable'] is True and proof['unknownOriginalRunnerCreationIdentityPreserved'] is True and proof['originalPG4Failed'] is True and proof['currentResourceScopeClosedVerified'] is False and proof['actualPG4Qualified'] is False,'PG4_RF_ACTUAL_PREFLIGHT_REQUIRED')
        need(protection['kind']==WHOLE_KIND and protection['consumerSHA256']==WHOLE_SHA and protection['ready'] is True,'PG4_RF_ACTUAL_FULL_PROTECTION_REQUIRED');fresh_time(proof['observedAt']);fresh_time(protection['at'])
        need(os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0 and sys.flags.isolated==1,'PG4_RF_ROOT_PROFILE_REQUIRED');saved,prior,runner,resources,old_rows=history(v);v['resources']=resources;globals()['_cli_captures_pg4']=result['privateCLICaptures']
        phase='records';namespace=namespace_read(v,{});stop=original_failure_chain(v,namespace['records'],saved,old_rows);need(stop is not None and namespace['records']==proof['originalRawFileRefs'],'PG4_RF_PREFLIGHT_RECORD_OR_STOP_CHANGED');bind_native_globals(v)
        phase='processes';physical_now=physical(v,runner);need(recovery_process_clear(physical_now),'PG4_RF_CURRENT_PROCESS_SCOPE_UNKNOWN');need(physical_now['docker']['resources']['pg4-runner']['exactPresentRunner'] and all(physical_now['docker']['resources'][r]['absent'] for r in ('postgres','internal-network','postgres-data')),'PG4_RF_EXACT_RESOURCE_PREFLIGHT_CHANGED')
        scan=_census_pg4_original();need(scan_closed(scan) and scan['node']==proof['processScans'][0]['node'] and scan['ack']==proof['processScans'][0]['ack'],'PG4_RF_CURRENT_FD_SOCKET_ACK_CHANGED')
        phase='source';source=_source_byte_revalidation_pg4(v['sourceRevalidation']);need(source['readComplete'] is True and source['sourceBytesAdmitted'] is True and source['dataDescriptorsClosed'] is True,'PG4_RF_CURRENT_SOURCE_REVALIDATION_INCOMPLETE')
        phase='intent';fresh_time(proof['observedAt']);fresh_time(protection['at']);result['rootIntent']=root_intent({'schemaVersion':1,'kind':'r33-pg4-failed-runner-recovery-root-intent','protocol':PROTOCOL,'attempt':ATTEMPT,'runnerID':RUNNER_ID,'callerSHA256':payload['callerSHA256'],'workerSHA256':payload['workerSHA256'],'preflightWireSHA256':payload['preflightWireSHA256'],'originalRunnerReceiptStillMissing':True,'unknownOriginalRunnerCreationIdentityPreserved':True,'originalPG4Failed':True,'maximumRemovals':1,'forcePermitted':False,'automaticRetry':False})
        phase='final-current';namespace=namespace_read(v,{});original_failure_chain(v,namespace['records'],saved,old_rows);need(namespace['records']==proof['originalRawFileRefs'] and not namespace['filesystemSockets'],'PG4_RF_FINAL_ORIGINAL_RECORD_CHANGED');need(recovery_process_clear(physical(v,runner)),'PG4_RF_FINAL_PROCESS_SCOPE_UNKNOWN')
        final_scan=_census_pg4_original();need(scan_closed(final_scan) and final_scan['node']==proof['processScans'][0]['node'] and final_scan['ack']==proof['processScans'][0]['ack'],'PG4_RF_FINAL_FD_SOCKET_ACK_CHANGED')
        for line in Path('/proc/net/unix').read_text().splitlines()[1:]:
            parts=line.split(maxsplit=7);need(len(parts)!=8 or not in_workspace(parts[7].removeprefix('@')),'PG4_RF_FINAL_NAMESPACE_SOCKET_PRESENT')
        current=inspect_one('container',RUNNER_ID);need(current is not None,'PG4_RF_RUNNER_ALREADY_ABSENT');assert_runner(current,runner);fresh_time(proof['observedAt']);fresh_time(protection['at'])
        phase='remove';result['removeAttempted']=True;packet,raw,_=command(['/usr/bin/docker','container','rm',RUNNER_ID]);need(packet['status']==0 and raw.decode('ascii','strict').strip()==RUNNER_ID,'PG4_RF_REMOVE_UNCONFIRMED_NO_REPLAY');result['nonforceRemoveAcknowledged']=True;result['ready']=True
    except BaseException as e:result['firstClosedError']=error(e,phase);result['ready']=False
    result['observedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();return result
