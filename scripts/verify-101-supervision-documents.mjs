/** Structural document checks only; this is not browser or product acceptance. */
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
const names=['101监督环境检查与首次完整测试','贾维斯建设档案','软件工厂首项目交付计划','贾维斯建设日志'];
const results=[];
for(const name of names){
 const mdPath=resolve('docs',name+'.md'),htmlPath=resolve('docs',name+'.html');
 const bytes=await readFile(mdPath),md=bytes.toString('utf8'),html=await readFile(htmlPath,'utf8');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const embedded=html.match(/name=["']jarvis-source-sha256["'][^>]*content=["']([0-9a-f]{64})["']/)?.[1];
 const checkedLinks=[],missingLinks=[];
 for(const match of md.matchAll(/(?<!\\)\[[^\]]*\]\(([^)]+)\)/g)){
  const target=match[1].replace(/^<|>$/g,'').split(/[?#]/)[0];
  if(!target||/^[a-z][a-z0-9+.-]*:/i.test(target))continue;
  const path=resolve(dirname(mdPath),decodeURIComponent(target));
  try{await access(path);checkedLinks.push(target);}catch{missingLinks.push(target);}
 }
 results.push({markdown:mdPath,html:htmlPath,sourceSha256:sha256,embeddedSourceSha256:embedded??null,sourceMatches:embedded===sha256,localLinksChecked:checkedLinks.length,missingLinks:[...new Set(missingLinks)],sectionCount:(html.match(/<section\b/g)??[]).length});
}
const passed=results.every(x=>x.sourceMatches&&x.missingLinks.length===0);
const report={formatVersion:1,at:new Date().toISOString(),scope:'MD/HTML source identity and existence of local linked files; no visual browser or product acceptance',passed,documents:results};
const output='artifacts/software-factory/full-test/101-supervision-document-verification.json';
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed,documents:results.map(x=>({name:x.markdown,sourceMatches:x.sourceMatches,localLinksChecked:x.localLinksChecked,missingLinks:x.missingLinks})),output}));
if(!passed)process.exitCode=1;
