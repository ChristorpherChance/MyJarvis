/** Register existing MSF source and runtime. No code changes or AI task launch. */
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {withPlatform} from './managed-server-client.mjs';
const machineId='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',directory='/home/superopen/All-Projects/msf';
if(!process.argv.includes('--execute')){console.log(JSON.stringify({prepared:true,machineId,directory,launchAI:false}));process.exit();}
const doctor=JSON.parse(await readFile('artifacts/software-factory/101-doctor.json','utf8'));
if(!doctor.checks.health.healthy||doctor.git.branch!=='main'||!doctor.git.commit)throw Error('FACTORY_BASELINE_NOT_VERIFIED');
await withPlatform(async({api,records,command})=>{
 const matches=(await records('projects')).filter(p=>p.name==='软件工厂');if(matches.length>1)throw Error('DUPLICATE_FACTORY_PROJECT');
 let project=matches[0];
 if(project&&!project.copies?.some(c=>c.machineId===machineId&&c.path===directory))throw Error('FACTORY_PROJECT_BINDING_CONFLICT');
 if(!project)project=await command('projects','register',{name:'软件工厂',description:'101 上的 MSF 源码项目；开发、测试与交付由贾维斯统一监督。',goal:'完善软件工厂现有源码。每项开发目标需要真实代码变更、固定测试与构建日志、独立验收和可追溯交付；内部模拟流程的状态不能代替源码项目验收。',copies:[{machineId,path:directory,branch:doctor.git.branch,environment:'development'}],milestones:['确认代码与真实测试基线','完成真实执行及测试能力','完成独立验收与交付']});
 const info={environment:'101 · Ubuntu · Claude Code '+doctor.clis.claude.version+' · pnpm '+doctor.clis.pnpm.version,runCommand:'pnpm dev',verifyCommand:'使用贾维斯固定隔离验证；完整集成测试须使用独立测试数据与服务',notes:'接入检查时源版本 '+doctor.git.commit+'；后续源版本与测试证据由实际运行记录更新。私有 deploy/101/msf.env 保留在原服务器，不同步。Codex 尚未安装；仅配置实际可用 Claude 执行器。内部业务执行和部分自测为模拟状态，真实源码验证由贾维斯独立记录。'};
 if(!project.environmentInfo)project=await command('projects','environment-info',{projectId:project.id,environmentInfo:info},project.revision);
 const existing=await api('/api/runtime/applications?machineId='+encodeURIComponent(machineId)+'&search='+encodeURIComponent('软件工厂')+'&limit=100');
 let application=existing.items.find(a=>a.name==='软件工厂'&&a.directory===directory);
 if(!application){const saved=await api('/api/runtime/applications',{commandId:randomUUID(),expectedVersion:0,data:{name:'软件工厂',description:'MSF 已运行的开发前后端，关联源码研发项目。',machineId,projectId:project.id,serviceIds:[],environment:'test',status:'active',url:'http://192.168.10.101:5173',loginUrl:'',directory,notes:'前端 5173，后端 8080；软件工厂业务台账仅作附属运行观察。源码开发进度来自贾维斯真实任务与测试。',health:{enabled:true,url:'http://192.168.10.101:8080/health',expectedStatus:200,intervalSec:60,timeoutSec:5}}});application=await api('/api/runtime/applications/'+saved.id);}
 const health=await api('/api/runtime/applications/'+application.id+'/check',{});
 const report={at:new Date().toISOString(),projectId:project.id,projectRevision:project.revision,applicationId:application.id,machineId,directory,branch:doctor.git.branch,commit:doctor.git.commit,health,AIStarted:false,sourceChanged:false};
 await mkdir('artifacts/software-factory',{recursive:true});await writeFile('artifacts/software-factory/onboarding.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
