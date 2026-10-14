/** Read-only release verification; reports contain counts and operational metadata only. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withPlatform} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',release='20261010-factory-usage-r18-1';
const result=await withPlatform(async({api})=>{
 const [health,state,projects,summary,page,projectSummary,capabilities]=await Promise.all([
  api('/api/health'),api('/api/runtime/software-factory'),api('/api/runtime/software-factory/projects'),api('/api/runtime/governance/usage/summary'),api('/api/runtime/governance/usage?limit=25&page=1'),api('/api/runtime/governance/usage/summary?projectId='+projectId),api('/api/v1/execution/capabilities')
 ]);
 assert.equal(health.build,release);assert.equal(state.connected,true);assert.equal(state.sourceProjectId,projectId);assert.equal(projects.verification,'factory-reported');
 assert.equal(page.total,page.summary.records);assert(page.summary.totalTokens>=page.items.reduce((sum,item)=>sum+(item.total_tokens??0),0));assert(page.items.length<=25);assert.equal(summary.currency,'USD');
 for(const item of page.items)if(item.measurement_status==='unknown')assert.equal(item.total_tokens,null);
 const probes=[...new Map([projects.items[0],projects.items.find(p=>p.id.startsWith('00000000-')),...projects.items.slice(0,3)].filter(Boolean).map(p=>[p.id,p])).values()].slice(0,3);
 const details=await Promise.all(probes.map(p=>api('/api/runtime/software-factory/projects/'+p.id)));
 for(const detail of details){assert.equal(detail.boundaries.internalDevelopment,'mock-development-pipeline');assert.equal(detail.boundaries.automaticAcceptance,false);assert.deepEqual(detail.partialErrors,[]);}
 const external=await api('/api/runtime/governance/usage?projectId='+projectId+'&source=external-cli&limit=25');
 const sourceApp=(await api('/api/runtime/applications?search='+encodeURIComponent('软件工厂')+'&limit=100')).items.find(a=>a.projectId===projectId);
 assert(sourceApp,'Registered software factory runtime application is required');
 assert.equal(sourceApp.projectId,projectId);
 return {release,health:'healthy',factory:{connected:state.connected,sourceProjectId:state.sourceProjectId,internalProjectCount:projects.total,detailProbes:details.length,legacyGuidProbed:details.some(d=>d.project.id.startsWith('00000000-')),sectionErrors:0,automaticAcceptance:false},usage:{totals:summary.totals,project:projectSummary.totals,externalRecords:external.total,paginationVerified:true,unknownIsNull:true,invoicesConnected:page.invoicesConnected},development:capabilities.data,runtimeApplication:{registered:!!sourceApp,projectLinked:sourceApp?.projectId===projectId},readOnly:true,chatContentStored:false,credentialsStored:false};
});
await mkdir('artifacts/software-factory',{recursive:true});await writeFile('artifacts/software-factory/published-verification.json',JSON.stringify({...result,at:new Date().toISOString()},null,2));console.log(JSON.stringify(result));
