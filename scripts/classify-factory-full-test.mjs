/** Read private test evidence on 101; export only fixed error classes and public test titles. */
import {mkdir,writeFile} from 'node:fs/promises';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const runId=process.argv[2];
if(!/^[0-9a-f]{40}$/.test(runId??'')||process.argv.length!==3)throw Error('FIXED_VALIDATION_RUN_ID_REQUIRED');
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({runId},String.raw`from pathlib import Path
import stat,hashlib,re,collections
root=Path('/var/lib/jarvis-development/101/full-validation')/p['runId']
for q in [root,*root.parents]:
 s=q.lstat()
 if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('PRIVATE_EVIDENCE_BOUNDARY_INVALID')
report=json.loads((root/'report.json').read_text())
if report.get('runId')!=p['runId']:raise RuntimeError('REPORT_RUN_ID_INVALID')
failed=[];skipped=[]
for package in ['packages-shared','apps-server','apps-web']:
 path=root/'evidence'/(package+'-test-report.json')
 if not path.is_file():continue
 parsed=json.loads(path.read_text())
 for file in parsed.get('testResults',[]):
  name=file.get('name','')
  if not name.startswith('/work/source/') or not re.search(r'\.(test|spec)\.tsx?$',name):continue
  for test in file.get('assertionResults',[]):
   status=test.get('status')
   if status not in ['failed','pending','skipped','todo']:continue
   title=re.sub(r'https?://\S+','[public-address]',test.get('fullName') or test.get('title') or '')[:400]
   row={'file':name.removeprefix('/work/source/'),'title':title,'status':status}
   messages='\n'.join(test.get('failureMessages',[]))
   if status!='failed':skipped.append(row);continue
   if '未找到 CJK 字体' in messages:code='CJK_FONT_DEPENDENCY_MISSING'
   elif 'spawnSync git ENOENT' in messages:code='GIT_BINARY_DEPENDENCY_MISSING'
   elif 'storage.service.test.ts' in name and 'sha256%2Fabc123' in messages:code='SIGNED_URL_SLASH_ENCODING_ASSERTION_CONTRACT_MISMATCH'
   elif 'sandbox.integration.test.ts' in name and ('SANDBOX_SPEC_INVALID' in messages or '镜像摘要' in messages or 'digest' in messages.lower()):code='ORIGINAL_SANDBOX_IMAGE_PIN_MISMATCH'
   elif 'AssertionError' in messages:code='ASSERTION_FAILED_REQUIRES_CONTRACT_REVIEW'
   elif 'ECONNREFUSED' in messages or 'ENOTFOUND' in messages:code='ISOLATED_DEPENDENCY_CONNECTION_FAILED'
   else:code='TEST_EXCEPTION_REQUIRES_PUBLIC_SOURCE_REVIEW'
   row['reasonCode']=code;row['rawErrorExported']=False;failed.append(row)
prototype=[]
for stage in report.get('stageSummary',[]):
 if not stage.get('name','').startswith('prototype-'):continue
 path=root/'evidence'/(stage['name']+'.log');text=path.read_text(errors='replace')
 row={'stage':stage['name'],'ok':stage.get('ok'),'exitCode':stage.get('exitCode'),'timeout':stage.get('timeout'),'logSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),'rawErrorExported':False}
 if stage.get('ok'):code='PASSED'
 elif stage.get('timeout'):code='TIMEOUT_REQUIRES_REVIEW'
 elif 'Cannot find module' in text and 'playwright' in text:code='PLAYWRIGHT_DEPENDENCY_MISSING'
 elif ('ENOENT' in text or 'ERR_FILE_NOT_FOUND' in text) and '.html' in text:code='HISTORICAL_OR_TEST_HTML_ASSET_MISSING'
 elif ('not a git repository' in text or 'not a valid object' in text or 'bad revision' in text or 'unknown revision' in text):code='SNAPSHOT_GIT_HISTORY_NOT_INCLUDED'
 elif 'browserType.launch' in text and ('Executable' in text or 'dependencies' in text):code='BROWSER_RUNTIME_DEPENDENCY_FAILED'
 elif 'AssertionError' in text:code='BROWSER_OR_DOCUMENTED_REGRESSION_ASSERTION_FAILED'
 elif re.search(r'\bRED\b|\bFAIL\b|\"pass\"\s*:\s*false|\"ok\"\s*:\s*false',text):code='DOCUMENTED_REGRESSION_NEGATIVE_RESULT'
 else:code='DOCUMENTED_SUITE_ERROR_REQUIRES_SOURCE_REVIEW'
 row['reasonCode']=code
 if code=='HISTORICAL_OR_TEST_HTML_ASSET_MISSING':
  assets=sorted(set(re.findall(r"(?:file://)?/work/source/([^'\"\n\\ ]+\.html)",text)))[:10]
  row['missingPublicAssets']=[]
  for relative in assets:
   q=Path(relative)
   if q.is_absolute() or '..' in q.parts or any(part.startswith('.') for part in q.parts):continue
   original=Path('/home/superopen/All-Projects/msf')/q
   try:s=original.lstat();exists=True;kind='symlink-excluded-by-snapshot' if stat.S_ISLNK(s.st_mode) else 'regular-file' if stat.S_ISREG(s.st_mode) else 'other'
   except FileNotFoundError:exists=False;kind='not-present'
   row['missingPublicAssets'].append({'relativePath':str(q),'presentInCurrentOriginalSource':exists,'originalKind':kind,'copiedTestPathMissing':True})
 prototype.append(row)
summary={'runId':p['runId'],'collectorCompleted':report.get('collectorCompleted') is True,'partialStageEvidence':report.get('collectorCompleted') is not True,'sourceFingerprint':report.get('sourceBefore'),'sourceAtLateCleanup':report.get('sourceAfter'),'sourceChangedDuringRun':report.get('sourceBefore')!=report.get('sourceAfter'),'completedStageCount':len(report.get('stageSummary',[])),'notRunMandatoryStages':[name for name in ['truthfulness-probe','storage-signing-probe'] if name not in [r.get('name') for r in report.get('stageSummary',[])]],'failedAssertions':failed,'skippedAssertions':skipped,'prototypeClassifications':prototype,'assertionReasonCounts':dict(collections.Counter(x['reasonCode'] for x in failed)),'prototypeReasonCounts':dict(collections.Counter(x['reasonCode'] for x in prototype)),'interpretation':'Only completed stage records are classified. The signed run was cancelled if collectorCompleted is false; neither the native validator nor omitted stages are assumed to have run. Failed assertions, missing historical assets and harness dependencies are separately classified; a failed suite count is not a product bug count. Supplemental probes are not included in original Vitest counts.','rawLogsExported':False,'credentialsExported':False}
print(json.dumps(summary,ensure_ascii=False))
`),true));
await mkdir('artifacts/software-factory/full-test',{recursive:true});
await writeFile('artifacts/software-factory/full-test/failure-classification-'+runId+'.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({runId,failed:result.failedAssertions.length,skipped:result.skippedAssertions.length,prototypeReasonCounts:result.prototypeReasonCounts}));
