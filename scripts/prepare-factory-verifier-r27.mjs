/** Offline R27 preparation only. No remote connection, installation, model or test dispatch. */
import {readFile,open,mkdir,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {repairScope as S,canonical,sha} from './run-factory-main-repair-r26.mjs';
import {verifierScope as OLD,fixedToolSHA} from './prepare-factory-repair-verifier-r26.mjs';

const H=/^[a-f0-9]{64}$/,need=(v,c)=>{if(!v)throw Error(c);},same=(a,b)=>canonical(a)===canonical(b);
export const r27VerifierScope=Object.freeze({projectId:S.projectId,machineId:S.machineId,workspace:'/home/superopen/All-Projects/msf-repair-r27/source',parent:'/home/superopen/All-Projects/msf-repair-r27',localWorkspace:'.jarvis-dev/workspaces/msf-repair-r27/source',entry:'/usr/local/libexec/jarvis-msf-main-acceptance-r27',configRoot:'/etc/jarvis-development/main-acceptance-r27',evidenceRoot:'/var/lib/jarvis-development/101/main-acceptance-r27',collectorPath:'/opt/jarvis-development/software-factory/project-autonomy-fa01-collector-r27.mjs',containerCollectorPath:'/tools/project-autonomy-fa01-collector-r27.mjs',inputPath:'.jarvis-dev/maintenance/factory-r27-verifier-input.json',artifactDirectory:'artifacts/software-factory/acceptance-r27'});
export const r27AuthPolicyException=Object.freeze({id:'INVALID_LOGIN_NOT_DENIED',status:'not-applicable',executed:false,required:false,source:'explicit-user-request',authorization:'R27-BAD-LOGIN-401-EXEMPTION',scope:'invalid-credentials-must-return-401-only',originalFailurePreserved:true,countsAsPassedCheck:false});
export const r27AuthenticationPolicy=Object.freeze({mode:'simple-valid-login-invalid-401-exempt-v1',exceptions:Object.freeze([r27AuthPolicyException]),validLoginRequired:true,cookieRequired:true,writeReadbackRequired:true,realBrowserRequired:true});
export const r27SandboxImageContract=Object.freeze({version:'existing-broker-d9-fixed-contract-v1',imageId:'sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc',reference:'alpine@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc',architecture:'amd64',os:'linux',brokerSHA256:fixedToolSHA['factory-sandbox-broker.py'],originalBrokerChanged:false,unlistedImageRejectionRequired:true,networkReadOnlyTimeoutQuotaRequired:true});

const BAD_LOGIN_LINE="      const bad = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'jarvis-invalid', password: 'invalid' }) }); need(bad.status === 401, 'INVALID_LOGIN_NOT_DENIED');\n";
const AUTH_FROM="      const anonymous = await request('/api/projects'); need(anonymous.status === 401, 'UNAUTHENTICATED_ACCESS_NOT_DENIED');\n      const who = await request('/api/auth/whoami'); need(who.status === 200 && who.value?.enabled === true && who.value.user === null, 'AUTH_NOT_ENABLED');\n"+BAD_LOGIN_LINE+"      const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: childEnv.MSF_AUTH_USER, password: childEnv.MSF_AUTH_PASS }) });\n      const setCookie = login.response.headers.get('set-cookie'); need(login.status === 200 && login.value?.ok === true && setCookie?.includes('HttpOnly') && setCookie?.includes('SameSite=Lax'), 'AUTH_LOGIN_OR_COOKIE_INVALID');\n      cookie = setCookie.split(';')[0];\n";
export const r27AuthHelperSource=`export const r27AuthPolicyExceptions = Object.freeze([Object.freeze(${JSON.stringify(r27AuthPolicyException)})]);
export async function validateSimpleR27Login(request, childEnv) {
  const anonymous = await request('/api/projects'); need(anonymous.status === 401, 'UNAUTHENTICATED_ACCESS_NOT_DENIED');
  const who = await request('/api/auth/whoami'); need(who.status === 200 && who.value?.enabled === true && who.value.user === null, 'AUTH_NOT_ENABLED');
  // The user waived only the old wrong-password HTTP-401 probe. It is not executed or counted as passed.
  const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: childEnv.MSF_AUTH_USER, password: childEnv.MSF_AUTH_PASS }) });
  const setCookie = login.response.headers.get('set-cookie'); need(login.status === 200 && login.value?.ok === true && setCookie?.includes('HttpOnly') && setCookie?.includes('SameSite=Lax'), 'AUTH_LOGIN_OR_COOKIE_INVALID');
  const cookie = setCookie.split(';')[0];
  need(/^msf_auth=[^;\\s]+$/.test(cookie), 'AUTH_LOGIN_OR_COOKIE_INVALID');
  return { cookie, proof: { anonymousRejected: true, loginConfirmed: true, invalidLoginRejected: null, invalidLoginCheck: r27AuthPolicyExceptions[0], privateCredentialsExported: false } };
}
`;
function replaceExactly(body,from,to,count=1){need(body.split(from).length-1===count,'R27_VERIFIER_PATCH_TARGET_CHANGED');return body.split(from).join(to);}
export function renderR27Collector(original){
 need(sha(original)===fixedToolSHA['project-autonomy-fa01-collector.mjs'],'R27_VERIFIER_ORIGINAL_COLLECTOR_CHANGED');
 let source=Buffer.isBuffer(original)?original.toString('utf8'):original;
 source=replaceExactly(source,'async function runtime() {',r27AuthHelperSource+'\nasync function runtime() {');
 source=replaceExactly(source,AUTH_FROM,"      const authentication = await validateSimpleR27Login(request, childEnv); cookie = authentication.cookie;\n");
 source=replaceExactly(source,'invalidLoginRejected: true','invalidLoginRejected: null, invalidLoginCheck: r27AuthPolicyExceptions[0]');
 source=replaceExactly(source,'installed-package-authentication-and-project-create-update-archive-readback','installed-package-valid-login-and-project-create-update-archive-readback');
 source=replaceExactly(source,"'/tools/project-autonomy-fa01-collector.mjs'","'"+r27VerifierScope.containerCollectorPath+"'");
 return source;
}

export function renderR27Wrapper(original,{candidateFingerprint,collectorSHA256}){
 need(sha(original)===OLD.templateSHA,'R27_VERIFIER_ORIGINAL_WRAPPER_CHANGED');
 need(H.test(candidateFingerprint??'')&&candidateFingerprint!==S.baselineSHA&&H.test(collectorSHA256??''),'R27_VERIFIER_SOURCE_BINDING_REQUIRED');
 const V=r27VerifierScope;let source=Buffer.isBuffer(original)?original.toString('utf8'):original;
 source=replaceExactly(source,"WORKSPACE = '"+S.source+"'","WORKSPACE = '"+V.workspace+"'");
 source=replaceExactly(source,"SOURCE_SHA256 = '"+S.baselineSHA+"'","SOURCE_SHA256 = '"+candidateFingerprint+"'");
 source=replaceExactly(source,"'/usr/local/libexec/jarvis-msf-main-acceptance-r26-4'","'"+V.entry+"'",2);
 source=replaceExactly(source,"'/etc/jarvis-development/main-acceptance-r26-4'","'"+V.configRoot+"'");
 source=replaceExactly(source,"'/var/lib/jarvis-development/101/main-acceptance-r26-4'","'"+V.evidenceRoot+"'");
 source=replaceExactly(source,'main_acceptance_coordinator_r26_4','main_acceptance_coordinator_r27');
 source=replaceExactly(source,"        need(result.get('sha256') == SOURCE_SHA256, 'MAIN_ACCEPTANCE_SNAPSHOT_CHANGED')\n        return result","        need(result.get('sha256') == SOURCE_SHA256, 'MAIN_ACCEPTANCE_SNAPSHOT_CHANGED')\n        after = helper.fingerprint(workspace)\n        need(after == before and after.get('sha256') == SOURCE_SHA256, 'MAIN_ACCEPTANCE_SOURCE_CHANGED_DURING_SNAPSHOT')\n        return result");
 const constantsCode=`R27_COLLECTOR_PATH = '${V.collectorPath}'\nR27_COLLECTOR_SHA256 = '${collectorSHA256}'\nR27_AUTHENTICATION_POLICY = json.loads(${JSON.stringify(JSON.stringify(r27AuthenticationPolicy))})\nR27_SANDBOX_IMAGE_CONTRACT = json.loads(${JSON.stringify(JSON.stringify(r27SandboxImageContract))})\n`;
 const patchCode=String.raw`
def patched_r27_coordinator_body(body):
    result = patched_coordinator_body(body)
    replacements = [
        (b"COLLECTOR = TOOLS / 'project-autonomy-fa01-collector.mjs'", b"COLLECTOR = TOOLS / 'project-autonomy-fa01-collector-r27.mjs'"),
        (b"            command += [ids['node'], 'node', '/tools/project-autonomy-fa01-collector.mjs', mode]", b"            command += [ids['node'], 'node', '/tools/project-autonomy-fa01-collector-r27.mjs', mode]"),
        (b"    report.update(wait_metadata)\n", b"    report.update(wait_metadata)\n    report['scopeExceptions'] = R27_AUTHENTICATION_POLICY['exceptions']\n    report['authenticationPolicy'] = R27_AUTHENTICATION_POLICY['mode']\n    report['sandboxImageContract'] = R27_SANDBOX_IMAGE_CONTRACT\n    report['productObjectivesAccepted'] = False\n"),
    ]
    for before, after in replacements:
        need(result.count(before) == 1, 'R27_VERIFIER_COORDINATOR_PATCH_TARGET_CHANGED')
        result = result.replace(before, after, 1)
        need(result.count(after) == 1, 'R27_VERIFIER_COORDINATOR_PATCH_NOT_UNIQUE')
    return result

`;
 const brokerLine="BROKER_ROOT = '/var/lib/jarvis-development/101/full-validation'\n";
 source=replaceExactly(source,brokerLine,brokerLine+constantsCode+patchCode);
 source=replaceExactly(source,"def validate_config(policy, baseline):\n","def validate_config(policy, baseline):\n    need(policy.get('authenticationPolicy') == R27_AUTHENTICATION_POLICY, 'R27_VERIFIER_AUTH_EXCEPTION_NOT_APPROVED')\n    need(policy.get('sandboxImageContract') == R27_SANDBOX_IMAGE_CONTRACT, 'R27_VERIFIER_SANDBOX_CONTRACT_CHANGED')\n");
 source=replaceExactly(source,"        result[name] = body\n    return result\n","        result[name] = body\n    collector = read_trusted(R27_COLLECTOR_PATH)\n    need(hashlib.sha256(collector).hexdigest() == R27_COLLECTOR_SHA256, 'R27_VERIFIER_NEW_COLLECTOR_CHANGED')\n    result['project-autonomy-fa01-collector-r27.mjs'] = collector\n    return result\n");
 source=replaceExactly(source,"patched_coordinator_body(bodies['project-autonomy-fa01-coordinator.py'])","patched_r27_coordinator_body(bodies['project-autonomy-fa01-coordinator.py'])");
 source=replaceExactly(source,"    coordinator.BASELINE = Path(BASELINE)\n","    coordinator.BASELINE = Path(BASELINE)\n    coordinator.R27_AUTHENTICATION_POLICY = json.loads(json.dumps(R27_AUTHENTICATION_POLICY))\n    coordinator.R27_SANDBOX_IMAGE_CONTRACT = json.loads(json.dumps(R27_SANDBOX_IMAGE_CONTRACT))\n");
 source=replaceExactly(source,'revision R26-4.','revision R27.');
 return source;
}

export function assertR27Observation(v){
 need(v?.schemaVersion===1&&v.kind==='software-factory-r27-source-observation'&&v.workspace===r27VerifierScope.workspace&&v.parent===r27VerifierScope.parent&&H.test(v.candidateFingerprint??'')&&v.candidateFingerprint!==S.baselineSHA&&H.test(v.candidateMetadataSHA256??'')&&H.test(v.originSHA256??'')&&Number.isSafeInteger(v.files)&&v.files>=45&&v.files<=20000&&v.mainFingerprint===S.baselineSHA&&v.mainFiles===593&&v.helperSHA256===fixedToolSHA['project-autonomy-evidence.py']&&v.helperVerified===true&&v.originBound===true&&v.originalMainUnchanged===true&&v.publicFilesOnly===true&&v.privateEnvironmentCopied===false&&v.gitHistoryCopied===false,'R27_VERIFIER_REAL_SOURCE_OBSERVATION_REQUIRED');
 return Object.fromEntries(['schemaVersion','kind','workspace','parent','candidateFingerprint','candidateMetadataSHA256','originSHA256','files','mainFingerprint','mainFiles','helperSHA256','helperVerified','originBound','originalMainUnchanged','publicFilesOnly','privateEnvironmentCopied','gitHistoryCopied'].map(k=>[k,v[k]]));
}
export function cloneR27Configuration(baseline,policy,observation){
 assertR27Observation(observation);need(baseline?.requiredTestFiles?.length===45&&baseline?.requiredPrototypeSuites?.length===30&&baseline.minimumCoverage?.lines>=90&&baseline.minimumCoverage?.branches>=80,'R27_VERIFIER_DENOMINATOR_CHANGED');
 const V=r27VerifierScope;
 return {baseline:{...structuredClone(baseline),workspace:V.workspace,sourceEvidence:'r27-independent-candidate-full-validation-with-explicit-auth-exception',sourceFingerprintObserved:observation.candidateFingerprint},policy:{...structuredClone(policy),workspace:V.workspace,evidenceRoot:V.evidenceRoot,sourceFingerprint:observation.candidateFingerprint,authenticationPolicy:structuredClone(r27AuthenticationPolicy),sandboxImageContract:structuredClone(r27SandboxImageContract)}};
}
export function prepareR27Verifier({originalWrapperBytes,originalCollectorBytes,baselineBytes,policyBytes,sourceObservation}){
 const publicObservation=assertR27Observation(sourceObservation);need(sha(baselineBytes)===OLD.oldBaselineSHA&&sha(policyBytes)===OLD.oldPolicySHA,'R27_VERIFIER_ORIGINAL_POLICY_BYTES_CHANGED');
 const collector=renderR27Collector(originalCollectorBytes),collectorSHA256=sha(collector),wrapper=renderR27Wrapper(originalWrapperBytes,{candidateFingerprint:sourceObservation.candidateFingerprint,collectorSHA256}),config=cloneR27Configuration(JSON.parse(baselineBytes),JSON.parse(policyBytes),sourceObservation);
 return {wrapper,collector,config,manifest:{schemaVersion:1,kind:'software-factory-r27-independent-verifier-preparation',scope:r27VerifierScope,sourceObservation:publicObservation,sourceObservationSHA256:sha(publicObservation),authenticationPolicy:structuredClone(r27AuthenticationPolicy),sandboxImageContract:structuredClone(r27SandboxImageContract),oldFixedTools:fixedToolSHA,newCollectorSHA256:collectorSHA256,wrapperSHA256:sha(wrapper),baselineSHA256:sha(JSON.stringify(config.baseline,null,2)+'\n'),policySHA256:sha(JSON.stringify(config.policy,null,2)+'\n'),requiredTestFiles:45,requiredPrototypeSuites:30,minimumCoverage:structuredClone(config.baseline.minimumCoverage),preparedOffline:true,actualSourceFreshReadRequired:true,actualPermissionAndIdleReadRequired:true,installed:false,installerImplemented:false,verificationDispatched:false,fullValidationExecuted:false,productAccepted:false,modelsInvoked:false,remoteReadsPerformed:false,remoteMutationsPerformed:false}};
}
async function safeLocalRead(path){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=4*1024*1024,'R27_VERIFIER_LOCAL_FILE_INVALID');const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));try{const a=await f.stat();need(a.dev===s.dev&&a.ino===s.ino&&a.size===s.size,'R27_VERIFIER_LOCAL_FILE_CHANGED');const bytes=await f.readFile(),b=await f.stat(),z=await lstat(path);need(bytes.length===a.size&&['dev','ino','size','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]&&a[k]===z[k]),'R27_VERIFIER_LOCAL_FILE_CHANGED');return bytes;}finally{await f.close();}}
export async function localR27Main(args){
 need(args.length<=1&&['inspect','prepare'].includes(args[0]??'inspect'),'R27_VERIFIER_PREPARE_ONLY');
 if((args[0]??'inspect')==='inspect')return {schemaVersion:1,kind:'software-factory-r27-verifier-readiness',scope:r27VerifierScope,ready:false,reason:'Real final candidate observation and root policy bytes still required; no installer or dispatcher is connected.',authenticationPolicy:r27AuthenticationPolicy,installed:false,verificationDispatched:false,modelsInvoked:false,remoteReadsPerformed:false,remoteMutationsPerformed:false};
 const input=JSON.parse(await safeLocalRead(r27VerifierScope.inputPath));need(input?.schemaVersion===1&&input.kind==='software-factory-r27-verifier-input'&&typeof input.baselineBase64==='string'&&typeof input.policyBase64==='string','R27_VERIFIER_INPUT_INVALID');
 const result=prepareR27Verifier({originalWrapperBytes:await safeLocalRead('scripts/factory-main-acceptance-wrapper-r26-4.py'),originalCollectorBytes:await safeLocalRead('scripts/project-autonomy-fa01-collector.mjs'),baselineBytes:Buffer.from(input.baselineBase64,'base64'),policyBytes:Buffer.from(input.policyBase64,'base64'),sourceObservation:input.sourceObservation});
 await mkdir('.jarvis-dev/maintenance',{recursive:true});const job=randomUUID(),dir='.jarvis-dev/maintenance/verifier-r27-preparation-'+job;await mkdir(dir,{recursive:false,mode:0o700});
 for(const [name,body] of [['wrapper.py',result.wrapper],['collector.mjs',result.collector],['baseline.json',JSON.stringify(result.config.baseline,null,2)+'\n'],['policy.json',JSON.stringify(result.config.policy,null,2)+'\n']]){const f=await open(dir+'/'+name,'wx',0o600);try{await f.writeFile(body);await f.sync();}finally{await f.close();}}
 await mkdir(r27VerifierScope.artifactDirectory,{recursive:true});const output=r27VerifierScope.artifactDirectory+'/verifier-preparation-'+job+'.json',f=await open(output,'wx',0o644);try{await f.writeFile(JSON.stringify(result.manifest,null,2)+'\n');await f.sync();}finally{await f.close();}
 return {output:resolve(output),privatePreparationDirectory:resolve(dir),...result.manifest};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await localR27Main(process.argv.slice(2))));}catch(error){const m=String(error?.message??'');console.error(JSON.stringify({errorCode:/^R27_VERIFIER_[A-Z0-9_]+$/.test(m)?m:'R27_VERIFIER_PREPARATION_FAILED',installed:false,verificationDispatched:false,modelsInvoked:false,rawErrorExported:false,remoteReadsPerformed:false,remoteMutationsPerformed:false}));process.exitCode=1;}}
