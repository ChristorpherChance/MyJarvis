/** Safe integration metadata, without credentials, personal messages or task output. */
import {withPlatform} from './managed-server-client.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
await withPlatform(async({api,records})=>{
 const [capabilities,config,agents,machines,projects]=await Promise.all([
  api('/api/v1/execution/capabilities'),api('/api/v1/execution/config'),api('/api/v1/execution/agents'),records('machines'),records('projects')
 ]);
 const report={at:new Date().toISOString(),readOnly:true,capabilities:capabilities.data,
  configurationRevision:config.data.revision,templates:config.data.templates.map(t=>({id:t.id,machineId:t.machineId,engine:t.engine,workspaceRoot:t.workspaceRoot,program:t.program,maxRounds:t.maxRounds,validationProgram:t.validation?.program,environmentKeys:Object.keys(t.environment??{})})),
  agents:agents.data.map(a=>({id:a.id,machineId:a.machineId,status:a.status,capabilities:a.capabilities,lastSeenAt:a.lastSeenAt})),
  machines:machines.map(m=>({id:m.id,name:m.name,label:m.label,address:m.address,role:m.role})),
  factoryProjects:projects.filter(p=>/软件工厂|software.?factory|\bmsf\b/i.test(p.name??p.title??'')).map(p=>({id:p.id,name:p.name,title:p.title,revision:p.revision}))};
 await mkdir('artifacts/software-factory',{recursive:true});await writeFile('artifacts/software-factory/jarvis-integration-state.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
});
