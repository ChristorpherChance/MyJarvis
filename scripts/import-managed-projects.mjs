/** Import verified deployed applications; never invent or import login secrets. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const root='artifacts/managed-servers';
const onboarding=JSON.parse(await readFile(root+'/onboarding.json','utf8'));
const probes=JSON.parse(await readFile(root+'/project-url-checks.json','utf8'));
const specs=[
 ['112','jarvis-platform.service','贾维斯','https://192.168.10.112:3140/','中央平台与家庭管家','https://192.168.10.112:3140/api/health'],
 ['101','jarvis-platform.service','贾维斯（冷备）','','已部署，业务停机待命',''],
 ['116','cs02-restore-inspireflash.service','InspirationFlash','https://cc-inspire.ikvein.com/','灵感记录与整理',''],
 ['116','cs02-restore-marrow.service','Marrow','https://cc-marrow.ikvein.com/','现有 Marrow 项目',''],
 ['116','cs02-restore-myfamily.service','MyFamily','https://cc-family.ikvein.com/','家庭应用','https://cc-family.ikvein.com/login'],
 ['116','cs02-restore-oss-radar-platform.service','OSS Radar','https://cc-ghradar.ikvein.com/','开源项目雷达',''],
 ['116','cs02-restore-oss-radar-platform-dev.service','OSS Radar（开发）','http://192.168.10.116:18901/','雷达开发实例',''],
 ['116','lucky-draw.service','Lucky Draw','https://cc-game1.ikvein.com/','抽奖应用',''],
 ['116','cs02-restore-ccr.service','CCR（116）','https://cc-gateway.ikvein.com/','模型路由入口',''],
 ['116','cs02-restore-openconnector.service','Open Connector','','连接器，仅监听服务器本机3000端口',''],
 ['gz','mv-gateway.service','语音网关','https://cc-mvoice.ikvein.com/','现有语音网关，根地址返回404',''],
 ['jp','ccr.service','CCR（日本）','https://gw.superopen.top/','模型路由入口',''],
 ['jp','cliproxyapi.service','CLIProxyAPI','','VPN内部接口，仅监听10.66.0.1:8317',''],
];
const report=[];
await withPlatform(async({api})=>{
 const existing=[];for(let page=1;;page++){const result=await api('/api/runtime/applications?limit=100&page='+page);existing.push(...result.items);if(page>=result.pages)break;}
 for(const [nodeId,unit,name,url,description,healthOverride] of specs){
  const node=onboarding.nodes.find(n=>n.id===nodeId),binding=node?.services.find(s=>s.unit===unit);if(!binding)throw Error('SERVICE_BINDING_MISSING '+nodeId+' '+unit);
  const found=existing.find(p=>p.machineId===node.machineId&&p.serviceIds.includes(binding.serviceId));
  if(found){report.push({node:nodeId,id:found.id,name:found.name,reused:true});continue;}
  const inspection=JSON.parse(await readFile(root+'/'+nodeId+'-application-inspection.json','utf8'));
  const working=inspection.services.find(s=>s.Id===unit)?.WorkingDirectory;
  const directory=working&&working!=='/'&&!working.includes('/jarvis/current')?working:'';
  const verified=probes.find(p=>p.url===url),enabled=nodeId==='112'||!!(verified?.status===200);
  const loginUrl=verified?.finalUrl!==url&&verified?.finalUrl?verified.finalUrl:'';
  const data={name,description,machineId:node.machineId,serviceIds:[binding.serviceId],environment:name.includes('开发')?'test':'production',status:nodeId==='101'?'paused':'active',url,loginUrl,directory,notes:nodeId==='101'?'冷备停机为预期状态，接管后再启用访问检测。':nodeId==='112'?'目录占用统计发布代码，不包括平台数据目录。':!url?'尚无经过核实的浏览器访问地址，请配置入口后补充。':nodeId==='gz'?'根地址404为实际结果，健康路径尚未确认；不以404判定业务整体故障。':'访问地址由实际监听端口、FRP及反向代理配置核对。',health:{enabled,url:healthOverride||url,expectedStatus:200,intervalSec:60,timeoutSec:5}};
  const result=await api('/api/runtime/applications',{commandId:randomUUID(),expectedVersion:0,data});
  if(enabled)await api('/api/runtime/applications/'+result.id+'/check',{});
  report.push({node:nodeId,id:result.id,name,url,directory,healthEnabled:enabled,credentialsImported:false,reused:false});
 }
});
await writeFile(root+'/projects-import.json',JSON.stringify({at:new Date().toISOString(),projects:report,credentialsImported:false},null,2));
console.log(JSON.stringify({projects:report.length,created:report.filter(p=>!p.reused).length,credentialsImported:false}));
