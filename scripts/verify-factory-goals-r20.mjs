/** Check document identity and local links; this is not product acceptance. */
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
const preLog=process.argv.includes('--pre-log');
const sources=['docs/软件工厂端到端目标与验收标准.md','docs/软件工厂首项目交付计划.md','docs/贾维斯建设档案.md',...(!preLog?['docs/贾维斯建设日志.md']:[])];
const checks=[];
for(const path of sources){
 const bytes=await readFile(path),source=bytes.toString('utf8'),htmlPath=path.replace(/\.md$/,'.html'),html=await readFile(htmlPath,'utf8');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const hash=html.match(/<meta name="jarvis-source-sha256" content="([a-f0-9]{64})"/);
 const body=source.replace(/^(```|~~~)[\s\S]*?^\1.*$/gm,'').replace(/<!--[^]*?-->/g,'');
 const missingReferences=[];let localReferences=0;
 for(const match of body.matchAll(/\]\(([^\s)]+)\)/g)){
  let target=match[1];if(/^(https?:|app:|#)/i.test(target))continue;
  target=decodeURIComponent(target.split('#')[0].split('?')[0].replace(/\\([\-_.])/g,'$1'));if(!target)continue;
  localReferences++;try{if(!(await stat(resolve(dirname(path),target))).isFile())missingReferences.push(target);}catch{missingReferences.push(target);}
 }
 checks.push({path,htmlPath,sha256,sameSource:hash?.[1]===sha256,localReferences,missingReferences});
}
const report={at:new Date().toISOString(),passed:checks.every(c=>c.sameSource&&c.missingReferences.length===0),scope:'MD/HTML source identity and real local links; no visual UI, model, deployment or product acceptance',checks,projectModelCalls:0};
const output='artifacts/software-factory/goals-r20/'+(preLog?'document-verification-before-log.json':'document-verification.json');
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
