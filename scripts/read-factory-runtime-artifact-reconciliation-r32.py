"""Fixed failed 10f attempt: bytes/processes only; never resumes the producer."""
import base64,hashlib,json,os,signal,stat,time
CORE='1d7208c35be27ffb657457dce4d758b51e9473b2dd172db6c74916e674013d10'
NONCE='10f408804b6efae7e0622f19e2e4bfe4'
TREE='9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3'
INSPECTION='acaa2073b6a0be14eb05888713a022cada63010b208aa25c908b4e942aba28fe'
NATIVE='a29fd5e9bb10f8b4023914bbc71a9de2ce479103b8166ce0214c47fc077d6796'
NATIVE_PARAMS='f75e008012f8e6dafb9cbc1f0cd48c8be78aab9238e2ce16eef6fa53bc94f3ff'
def need(v,c):
    if not v: raise RuntimeError(c)
def digest(b):return hashlib.sha256(b).hexdigest()
def main(p):
    need(os.geteuid()==os.getegid()==0,'R32_RECON_ROOT_REQUIRED')
    need(set(p)=={'coreRaw','nativeRaw','nativeSHA256','nativeParams','inspectionRaw','sourceIndex','packageSupplement'},'R32_RECON_INPUT_SET_CHANGED')
    core=base64.b64decode(p['coreRaw'],validate=True);native=base64.b64decode(p['nativeRaw'],validate=True);prior=base64.b64decode(p['inspectionRaw'],validate=True)
    need(digest(core)==CORE and digest(prior)==INSPECTION and digest(native)==p['nativeSHA256']==NATIVE and digest(json.dumps(p['nativeParams'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())==NATIVE_PARAMS,'R32_RECON_INPUT_BYTES_CHANGED')
    c={'__name__':'r32_reconciliation_readonly_core'};exec(compile(core,'<frozen-byte-walker>','exec'),c)
    source=c['validate']({'scope':c['SCOPE'],'action':'inspect','nonce':None,'sourceIndex':p['sourceIndex'],'expectedInspection':None,'programSHA256':CORE,'packageSupplement':p['packageSupplement']})
    expected=json.loads(prior);scope=c['SCOPE'];root=scope['freezeRoot'];old=root+'/'+NONCE
    n={'p':p['nativeParams']};exec(compile(native,'<frozen-native-census>','exec'),n)
    paths=[p['nativeParams']['workspace'],scope['work'],root,old,root+'/'+TREE]
    import re
    def related(v):
        v=v.removesuffix(' (deleted)');return any(v==x or v.startswith(x+'/') for x in paths)
    def argv(v):return any(re.search(r'(?<![A-Za-z0-9_./-])'+re.escape(x)+r'(?=$|[/\s\x00\x22\x27])',v) for x in paths)
    n['in_workspace']=related;n['argv_workspace']=argv
    def sockets():
        found=[]
        for line in open('/proc/net/unix',encoding='utf8').read().splitlines()[1:]:
            parts=line.split(maxsplit=7)
            if len(parts)==8 and related(parts[7].removeprefix('@')):found.append({'pathSHA256':digest(parts[7].encode()),'inode':parts[6]})
        return found
    signal.signal(signal.SIGALRM,lambda *_: (_ for _ in ()).throw(RuntimeError('R32_RECON_TIME_LIMIT')));signal.alarm(150)
    first=n['census']();sockets_first=sockets();chains=[]
    try:
        wc=c['open_chain'](scope['work'],work=True);chains.append(wc);work=c['double_scan'](wc[-1][0])
        need(work==expected['runtime'],'R32_RECON_ORIGINAL_FULL_BYTES_OR_METADATA_CHANGED')
        c['qualify_source'](work,source)
        oc=c['open_chain'](root);chains.append(oc);outer=oc[-1][0];names=sorted(os.listdir(outer));outer_stat=c['meta'](os.fstat(outer));namespace_identity=c['ident'](os.fstat(outer))
        need(NONCE in names,'R32_RECON_FAILED_ATTEMPT_MISSING')
        ac=c['open_chain'](old);chains.append(ac);attempt=ac[-1][0]
        intent,intent_raw=c['read_json'](attempt,'once.json')
        need(intent=={'schemaVersion':1,'kind':'r32-artifact-byte-once-intent','nonce':NONCE,'scope':scope,'qualifiedSHA256':c['sha'](c['raw'](expected)),'programSHA256':CORE,'treeSHA256':TREE},'R32_RECON_ONCE_CHANGED')
        # A failed copy is an inventory, not an artifact. Partial link closure is not certified.
        original_link_check=c['validate_input_links'];c['validate_input_links']=lambda entries:None
        try:partial=c['double_scan'](attempt)
        finally:c['validate_input_links']=original_link_check
        need(partial['rootStat'][2:4]==[0,0] and stat.S_IMODE(partial['rootStat'][4])==0o700 and all(row[3:5]==[0,0] and (row[6]==1 if stat.S_ISLNK(row[5]) else not row[5]&0o022 and (not stat.S_ISREG(row[5]) or row[6]==1)) for row in partial['metadata']),'R32_RECON_PARTIAL_OWNER_OR_HARDLINK_CHANGED')
        c['check_chain'](wc);c['check_chain'](ac);c['check_chain'](oc)
        need(names==sorted(os.listdir(outer)) and outer_stat==c['meta'](os.fstat(outer)),'R32_RECON_NAMESPACE_CHANGED')
        final_present=TREE in names
        need(c['double_scan'](wc[-1][0])==work,'R32_RECON_ORIGINAL_CHANGED_DURING_READ')
        images=c['image_contract']();need(images==expected['images'],'R32_RECON_IMAGES_CHANGED')
    finally:
        for chain in reversed(chains):c['close_chain'](chain)
    second=n['census']();sockets_second=sockets()
    need(first['node']==second['node'] and first['ack']==second['ack'] and sockets_first==sockets_second,'R32_RECON_PROCESS_OR_SOCKET_OBSERVATION_CHANGED')
    proc_clean=all(not x['readIncompletePIDs'] and not x['relatedProcesses'] and not x['allDescendants'] and not x['unitCgroupOtherProcesses'] and not x['workspaceRelatedProcesses'] for x in [first,second]) and not sockets_second and all(x==0 for x in second['ack']['counts'].values())
    signal.alarm(0)
    return {'schemaVersion':1,'kind':'r32-failed-byte-attempt-readonly-reconciliation','observedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'nonce':NONCE,'prospectiveTreeSHA256':TREE,'originalWork':work,'partialAttempt':partial,'partialIntentSHA256':digest(intent_raw),'namespaceIdentity':namespace_identity,'namespaceNames':names,'publishedTreePresent':final_present,'source625FullyVerified':True,'originalInspectionUnchanged':True,'partialTwoCompleteByteReadbacks':True,'partialLinkClosureQualified':False,'images':images,'nativeScans':[first,second],'relatedSockets':sockets_second,'processAndSocketScopeClean':proc_clean,'ready':proc_clean and not final_present,'immutableArtifactQualified':False,'productAccepted':False,'candidateCodeExecuted':False,'modelsInvoked':False,'remoteMutationsPerformed':False,'resourcesRemoved':False,'signalsSent':False}
if __name__=='__main__':print(json.dumps(main(globals().get('p')),separators=(',',':')))
