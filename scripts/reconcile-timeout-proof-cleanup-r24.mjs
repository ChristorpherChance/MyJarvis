/** Readback only: preserve the failed aggregate, do not rerun any fixture. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const dir='artifacts/software-factory/acceptance-r24',id='435dafbe-77ad-4e2f-a5de-43f318f96f48';
const priorPath=dir+'/timeout-linux-proof-'+id+'.json',raw=await readFile(priorPath),prior=JSON.parse(raw);
if(prior.proof?.passed!==true||prior.exitCode!==0||prior.errorCode!=='TIMEOUT_PROOF_CLEANUP_UNCONFIRMED')throw Error('TIMEOUT_PROOF_PRIOR_BINDING_INVALID');
const observed=JSON.parse(remote(lanProfile,'jarvis-101',python({id},String.raw`import subprocess,json,datetime
name='jarvis-timeout-proof-r24-'+p['id'].replace('-','')
inspect=subprocess.run(['/usr/bin/docker','inspect','--type','container',name],capture_output=True,text=True,timeout=10)
listed=subprocess.run(['/usr/bin/docker','container','ls','--all','--filter','name='+name,'--format','{{.Names}}'],capture_output=True,text=True,timeout=10)
absent=inspect.returncode!=0 and listed.returncode==0 and name not in [v.strip() for v in listed.stdout.splitlines()]
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'id':p['id'],'exactContainerAbsent':absent,'inspectExitCode':inspect.returncode,'filteredListExitCode':listed.returncode,'containerRemovedByThisReadback':False,'fixtureRerun':False,'modelInvoked':False}))
`),true));
const result={schemaVersion:1,kind:'project-autonomy-timeout-proof-cleanup-reconciliation',priorReport:priorPath,priorReportSha256:createHash('sha256').update(raw).digest('hex'),
 originalAggregatePassed:prior.passed,actualProofPassed:prior.proof.passed,sourceFingerprints:prior.sourceFingerprints,imageId:prior.imageId,...observed,
 passed:prior.proof.passed&&observed.exactContainerAbsent,scope:'Actual fixed Linux infrastructure proof plus subsequent independent exact-container absence readback; no product acceptance.',
 installed:false,rawLogsExported:false,productAcceptance:false};
const output=dir+'/timeout-linux-proof-cleanup-readback-'+id+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
