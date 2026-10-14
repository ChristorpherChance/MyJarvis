/** Policy metadata only. No task is started and no policy is changed. */
import {withPlatform} from './managed-server-client.mjs';
await withPlatform(async({api,records})=>{
 const [operations,settings,governance,tasks]=await Promise.all([records('operations'),records('settings'),api('/api/runtime/governance'),records('tasks')]);
 const policies=[...operations.filter(r=>r.kind==='resource-policy'),...settings.filter(r=>r.kind==='policy')].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 console.log(JSON.stringify({policies:policies.map(p=>({domain:p.kind==='policy'?'settings':'operations',id:p.id,revision:p.revision,updatedAt:p.updatedAt,humanReserve:p.humanReserve,voiceReserve:p.voiceReserve,batchLimit:p.batchLimit,quiet:p.quiet,autotest:p.autotest,autoWake:p.autoWake,supervise:p.supervise,emergency:p.emergency})),governancePolicy:governance.policy,taskCounts:Object.fromEntries([...new Set(tasks.map(t=>t.status))].map(s=>[s,tasks.filter(t=>t.status===s).length])),factoryTasks:tasks.filter(t=>t.projectId==='70ec346f-6520-46ed-abed-22cac770a3e4').map(t=>({id:t.id,title:t.title,revision:t.revision,status:t.status}))}));
});
