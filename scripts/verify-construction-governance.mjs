/** Read-only evidence for this governance setup; no model call or project execution. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
import {readConstructionRecords} from './construction-records.mjs';

const journal=JSON.parse(await readFile('artifacts/construction-history/platform-sync.json','utf8'));
assert.equal(journal.completed,true);assert.equal(journal.result.tasksCreated,false);assert.equal(journal.result.modelsInvoked,false);
const metadata=await withPlatform(async({api,records})=>{
 const [construction,source,caps]=await Promise.all([api('/api/v1/projects/'+journal.constructionProjectId),api('/api/v1/projects/'+journal.sourceProjectId),api('/api/v1/execution/capabilities')]);
 assert.equal(construction.data.name,'贾维斯建设');assert.equal(construction.data.scope,'personal');assert.equal(construction.data.ownerId,'server-admin');
 assert.equal(construction.data.milestones[0].completed,true);assert(construction.data.milestones.slice(1).every(m=>m.completed===false));
 assert(source.data.environmentInfo.notes.includes('ee7a0c228377d8fb9559cb045fb59695a7b1d4c89ead898effbc20202bb1ddeb'));
 assert.equal(source.data.environmentInfo.notes.split('[首项目治理记录 2026-10-10]').length-1,1);assert(source.data.milestones.every(m=>m.completed===false));assert.equal(caps.data.supervised,false);
 const experiences=await Promise.all(journal.result.experienceIds.map(id=>api('/api/v1/experiences/'+id)));assert.equal(experiences.length,2);
 for(const item of experiences){assert.equal(item.data.kind,'runbook');assert.notEqual(item.data.status,'published');assert.notEqual(item.data.verified,true);}
 const projects=await records('projects');assert.equal(projects.filter(p=>p.name==='贾维斯建设'&&p.ownerId==='server-admin').length,1);
 assert(Object.values(journal.intents).every(i=>['projects','experiences'].includes(i.domain)));
 return {constructionProjectId:construction.data.id,constructionRevision:construction.data.revision,sourceProjectId:source.data.id,sourceRevision:source.data.revision,sourceBaselinePreserved:true,sourceMilestonesUntouched:true,governanceMarkerCount:1,candidateRunbooks:experiences.map(r=>({id:r.data.id,status:r.data.status,verified:r.data.verified??false})),supervised:caps.data.supervised,sourceDevelopmentDispatched:false};
});
const views=[];
for(const stem of ['贾维斯建设档案','贾维斯建设日志','软件工厂首项目交付计划']){
 const md=await readFile('docs/'+stem+'.md','utf8'),html=await readFile('docs/'+stem+'.html','utf8'),digest=createHash('sha256').update(md).digest('hex');
 assert(html.includes('name="jarvis-source-sha256" content="'+digest+'"'));
 const missing=[];
 for(const match of md.matchAll(/\]\(([^)]+)\)/g)){
  let href=match[1];if(/^(?:https?:|#)/.test(href))continue;
  href=decodeURI(href.split('#')[0]);if(!href)continue;
  try{await readFile(resolve(dirname('docs/'+stem+'.md'),href));}catch{missing.push(href);}
 }
 assert.deepEqual(missing,[]);views.push({name:stem,sameSource:true,localLinksValid:true,sourceSHA256:digest});
}
const ledger=await readConstructionRecords(),report={at:new Date().toISOString(),passed:true,metadata,views,ledger:{records:ledger.length,retrospective:ledger.filter(r=>r.retrospective).length,headHash:ledger.at(-1)?.hash??null,integrityVerified:true},tasksCreated:false,modelsInvoked:false,credentialsRecorded:false};
await writeFile('artifacts/construction-history/verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
