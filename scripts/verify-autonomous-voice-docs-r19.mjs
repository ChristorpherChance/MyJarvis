/** Verify final MD/HTML source identity and real local reference targets. */
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
const sources=['docs/全天持续研发与快速语音实施方案.md','docs/快慢模型路由与等待回复.md','docs/execution-runtime.md','docs/软件工厂首项目交付计划.md','docs/贾维斯建设档案.md','docs/贾维斯建设日志.md'];
const checks=[];
for(const path of sources){
 const bytes=await readFile(path),source=bytes.toString('utf8'),htmlPath=path.replace(/\.md$/,'.html'),html=await readFile(htmlPath,'utf8');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const hash=html.match(/<meta name="jarvis-source-sha256" content="([a-f0-9]{64})"/);
 const body=source.replace(/^(```|~~~)[\s\S]*?^\1.*$/gm,'').replace(/<!--[^]*?-->/g,'');
 const references=[];
 for(const match of body.matchAll(/\]\(([^\s)]+)\)/g)){
  let target=match[1];if(/^(https?:|app:|#)/i.test(target))continue;
  target=decodeURIComponent(target.split('#')[0].split('?')[0].replace(/\\([\-_.])/g,'$1'));if(!target)continue;
  const absolute=resolve(dirname(path),target);let exists=false;try{exists=(await stat(absolute)).isFile();}catch{}
  references.push({target,exists});
 }
 checks.push({path,htmlPath,sha256,sameSource:hash?.[1]===sha256,localReferences:references.length,missingReferences:references.filter(r=>!r.exists).map(r=>r.target)});
}
const report={at:new Date().toISOString(),passed:checks.every(c=>c.sameSource&&c.missingReferences.length===0),scope:'Source identity and actual local reference existence; no phone, browser visual or product acceptance',checks,modelCalls:0};
const output=process.argv.includes('--audit-addendum')?'artifacts/unattended-r19/final-document-verification-with-audit.json':'artifacts/unattended-r19/final-document-verification.json';
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
