import { Store } from '../apps/api/dist/store.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Register this real work only; never invent other machines' liveness or agent progress.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const store=new Store(process.env.JARVIS_DATA_DIR || resolve(root,'.jarvis'));
try{
  let project=store.list('projects').find(p=>p.path===root);
  if(!project)project=store.create('projects',{name:'贾维斯系统平台',description:'以 Pi SDK 为底座，建设家庭管家、设备项目管理、开发监督与双神殿。',deviceId:'local',status:'active',path:root});
  const specs=[
    {title:'S0 · 平台底座',status:'done',notes:'已建立真实管理界面、登录、业务存储、Pi SDK 接入与测试。验收记录：artifacts/runtime-qa/result.json；真实模型回答需配置凭证后验证。'},
    {title:'S1 · 设备与开发监督',status:'queued',notes:'接入一个独立执行器：设备心跳、任务租约、真实事件、预算、停止和交付验收。尚未开始自动执行。'},
    {title:'S2 · 客厅语音与成员身份',status:'queued',notes:'先建立个人身份，再接高算力 STT/TTS、唤醒和打断。客厅先行，书房后接，厨房现场验证；卧室不接入。'},
    {title:'S3 · 知识神殿与记忆神殿',status:'queued',notes:'原件、识别版本、多轮校对、人审、来源索引与学习规划；个人记忆和共享知识隔离。'},
  ];
  for(const spec of specs)if(!store.list('tasks').some(t=>t.projectId===project.id && t.title===spec.title))store.create('tasks',{...spec,projectId:project.id,executor:'manual'});
  const title='部分更新必须保留未提交字段';
  if(!store.list('experiences').some(e=>e.title===title))store.create('experiences',{title,content:'本次开发发现：Zod 4 在部分更新中仍会应用字段默认值，可能清空描述、路径与成员偏好。修复：PATCH 使用没有默认值的可选字段；用真实 HTTP 回归检查只改名称时其他字段保持不变。',tags:['开发','数据保存','Zod'],memberId:'owner',projectId:project.id,source:'当前贾维斯开发与复核',status:'verified'});
  store.audit('project.bootstrap',project.id,{source:'current-authorized-build',version:'0.1.0'});
  console.log('已登记本次真实建设与后续待办。');
}finally{store.close();}
