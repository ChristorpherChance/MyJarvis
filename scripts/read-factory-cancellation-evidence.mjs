import {writeFile} from 'node:fs/promises';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const runId='c7371ba5ca53fa324aaafdf7ce78ad20e109fa38';
const report=JSON.parse(remote(lanProfile,'jarvis-101',python({runId},`import os,stat,json,hashlib,importlib.machinery,importlib.util,subprocess,re
from pathlib import Path
core_path='/usr/local/libexec/jarvis-msf-full-validation'
for item in [Path(core_path),*Path(core_path).parents]:
 s=item.lstat()
 if s.st_uid!=0 or stat.S_ISLNK(s.st_mode) or s.st_mode&0o022:raise RuntimeError('TRUSTED_CORE_REQUIRED')
loader=importlib.machinery.SourceFileLoader('full_test_forensics',core_path);spec=importlib.util.spec_from_loader(loader.name,loader);core=importlib.util.module_from_spec(spec);loader.exec_module(core)
root=Path(core.ROOT)/p['runId'];before=json.loads((root/'copy.json').read_text());actual=core.snapshot(core.load_helper(),None)
b={r['path']:r for r in before['manifest']};a={r['path']:r for r in actual['manifest']}
changes=[]
for name in sorted(set(a)|set(b)):
 if a.get(name)!=b.get(name):changes.append({'path':name,'kind':'added' if name not in b else 'removed' if name not in a else 'modified','before':b.get(name),'after':a.get(name)})
r=subprocess.run(['journalctl','-u','jarvis-software-factory-development.service','--since','2026-10-10 13:12:00 UTC','--until','2026-10-10 13:31:00 UTC','-o','json','--no-pager'],capture_output=True,text=True,timeout=20)
codes=[];categories={};entries=0
for line in r.stdout.splitlines():
 try:row=json.loads(line)
 except ValueError:continue
 entries+=1;message=str(row.get('MESSAGE',''))
 found=set(re.findall(r'\\b(?:AGENT_HTTP_[0-9]{3}|API_[0-9]{3}|TimeoutError|ECONNRESET|ECONNREFUSED|ETIMEDOUT|LEASE_EXPIRED|LEASE_NOT_FOUND|LEASE_CONFLICT|RUN_NOT_FOUND|RUN_NOT_RUNNING|RUN_STOPPED|INVALID_SIGNATURE|INVALID_NONCE|STALE_TIMESTAMP|LOG_LIMIT_EXCEEDED)\\b',message))
 if found:codes.append({'atUnixMicroseconds':row.get('__REALTIME_TIMESTAMP'),'codes':sorted(found)})
 for token,label in [('Stopping','unit-stop-request'),('Stopped','unit-stopped'),('Started','unit-started'),('Traceback','python-traceback'),('abort','abort-reference'),('heartbeat','heartbeat-reference'),('rate limit','rate-limit-reference')]:
  if token.lower() in message.lower():categories[label]=categories.get(label,0)+1
print(json.dumps({'runId':p['runId'],'sourceBefore':before['sha256'],'sourceCurrent':actual['sha256'],'sourceCurrentGit':actual['git'],'beforeFiles':before['files'],'currentFiles':actual['files'],'sourceStableDuringRead':True,'changes':changes,'applicationOrPackageChanges':[r['path'] for r in changes if r['path'].startswith(('apps/','packages/'))],'nodeJournal':{'entries':entries,'readExitCode':r.returncode,'fixedErrorCodes':codes,'categories':categories,'rawMessagesExported':False},'sourceChangeIsProvenCancellationCause':False}))
`),true));
await writeFile('artifacts/software-factory/full-test/source-change-and-node-errors-r2-retry1.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sourceBefore:report.sourceBefore,sourceCurrent:report.sourceCurrent,changes:report.changes,applicationOrPackageChanges:report.applicationOrPackageChanges,nodeJournal:report.nodeJournal}));
