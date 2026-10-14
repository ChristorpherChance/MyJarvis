/** Fixed public scripts and whitelisted test markers only; never exports raw test logs. */
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const runId=process.argv[2];if(!/^[0-9a-f]{40}$/.test(runId??''))throw Error('FIXED_REVIEW_RUN_REQUIRED');
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({runId},String.raw`from pathlib import Path
import re,json,hashlib,datetime
run=p['runId'];root=Path('/home/superopen/All-Projects/msf');ev=Path('/var/lib/jarvis-development/101/full-validation')/run/'evidence'
names=['design-boundary','selftest','selftest-boundary','browser','design-helpers','run-all','build-artifact'];out=[]
for name in names:
 q=root/'doc/tests'/(name+'.cjs');row={'name':name,'sourcePath':'doc/tests/'+name+'.cjs','source':None,'log':None}
 if q.is_file() and not q.is_symlink() and q.stat().st_size<400000:
  t=q.read_text();row['source']=t;row['sourceSHA256']=hashlib.sha256(q.read_bytes()).hexdigest()
  titles=sorted(set(re.findall(r'(?:check|test|assert|ok)\(\s*[\'\"]([^\'\"\r\n]{1,180})[\'\"]',t)))
  f=ev/('prototype-'+name+'.log')
  if f.is_file() and not f.is_symlink() and f.stat().st_size<4000000:
   b=f.read_bytes();log=b.decode(errors='replace');rows=[]
   for title in titles:
    if re.search(r'https?://|[?&](?:token|key|secret)=',title,re.I):continue
    lines=[line for line in log.splitlines() if title in line]
    for line in lines:
     status='unclassified'
     if re.search(r'❌|\bFAIL\b|\bfail\b|✗|✘',line[:line.find(title)+1]):status='failed'
     elif re.search(r'✅|\bPASS\b|\bpass\b|✓|✔',line[:line.find(title)+1]):status='passed'
     rows.append({'titleFromPublicScript':title,'statusMarker':status})
   codes=[code for code in ['MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ENOENT','TimeoutError','ETIMEDOUT','ERR_ASSERTION','page.goto','waitForSelector'] if code in log]
   structured=[]
   for line in log.splitlines():
    try:j=json.loads(line)
    except:continue
    if not isinstance(j,dict):continue
    for check in j.get('checks',[]):
     title=check.get('name','')
     if not isinstance(title,str) or not any(title.startswith(v) for v in titles) or re.search(r'https?://|[?&](?:token|key|secret)=',title,re.I):continue
     error=str(check.get('error',''));category=None
     if 'ERR_FILE_NOT_FOUND' in error or 'ENOENT' in error:category='LEGACY_OR_TEST_ASSET_MISSING'
     elif 'MODULE_NOT_FOUND' in error or 'Cannot find module' in error:category='TEST_RUNTIME_MODULE_MISSING'
     elif 'Timeout' in error or 'timeout' in error:category='PLAYWRIGHT_OPERATION_TIMEOUT'
     elif 'Expected values' in error or 'AssertionError' in error or 'evaluated to a falsy value' in error:category='PRODUCT_OR_TEST_EXPECTATION_ASSERTION'
     elif error:category='OTHER_TEST_ERROR_NOT_EXPORTED'
     structured.append({'titleFromPublicScript':title,'passed':check.get('ok') is True,'failureCategory':category,'legacyV18FileReferenced':bool('V1.8' in error)})
   row['log']={'path':f.name,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'lineCount':len(log.splitlines()),'fixedKnownErrorMarkers':codes,'matchedPublicTitles':rows,'structuredChecks':structured,'rawLogsExported':False,'urlsExported':False}
 out.append(row)
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runId':run,'readOnly':True,'modelCalls':0,'entries':out}))
`),true));
await mkdir('artifacts/software-factory/full-test/public-source',{recursive:true});
for(const row of result.entries){if(row.source!==null)await writeFile('artifacts/software-factory/full-test/public-source/doc__tests__'+row.name+'.cjs',row.source);delete row.source;}
await writeFile('artifacts/software-factory/full-test/browser-review-input-'+runId+'.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({written:'browser-review-input-'+runId+'.json',publicScripts:result.entries.length,readOnly:true,rawLogsExported:false}));
