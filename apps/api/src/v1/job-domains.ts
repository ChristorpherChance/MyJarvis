import { randomUUID } from 'node:crypto';
import { BusinessError, type DomainHandler } from './types.js';
export const jobHandler:DomainHandler={domain:'jobs',commands:['create','cancel'],execute(command,p,c){
 if(command==='create'){
  if(c.expectedVersion!==0)throw new BusinessError('CONFLICT','新作业版本必须为0',409);
  if(c.emergencyStopped())throw new BusinessError('REVIEW_REQUIRED','全局急停中，不能新建智能作业',422);
  if(!c.executorReady('pi-job','local'))throw new BusinessError('NOT_CONFIGURED','请先配置Pi模型与凭证',503);
  if(!['research','knowledge','intent'].includes(p.kind))throw new BusinessError('VALIDATION','作业类型无效');
  if(p.kind==='intent'&&!p.sourceId)throw new BusinessError('VALIDATION','意图作业必须关联真实会话');
  if(typeof p.instruction!=='string'||!p.instruction.trim()||p.instruction.length>12000)throw new BusinessError('VALIDATION','请填写作业目标，最多12000字');
  const source=p.sourceId?c.require(p.kind==='research'?'research':p.kind==='knowledge'?'books':'voice',p.sourceId):null;
  if(source&&p.sourceVersion!==source.revision)throw new BusinessError('CONFLICT','来源已更新，请刷新后提交',409);
  if(p.kind==='knowledge'&&(!source||source.status!=='published'&&source.stage!=='published'))throw new BusinessError('REVIEW_REQUIRED','知识解读须使用已校对发布的原文',422);
  if(p.kind==='knowledge'){const permission=c.require('sources',source!.source);if(permission.kind!=='source'||!permission.active||!permission.authorized)throw new BusinessError('REVIEW_REQUIRED','知识来源未启用或授权已撤销',422);}
  if(c.list('jobs').some(j=>['queued','running'].includes(j.status)&&j.kind===p.kind&&j.sourceId===p.sourceId))throw new BusinessError('CONFLICT','这个来源已有智能作业，请先等待或停止',409);
  const sourceSnapshot=source&&p.kind==='knowledge'?{id:source.id,title:source.title,edition:source.edition,author:source.author,version:source.version,source:source.source,rights:source.rights,pageTexts:(source.pageTexts??[]).map((page:any)=>({page:page.page,text:page.text})),scanHash:source.scanHash}:source;
  const r=c.create('jobs',{kind:p.kind,title:p.title||'Pi智能作业',instruction:p.instruction,sourceId:source?.id??null,sourceVersion:source?.revision??null,sourceSnapshot:sourceSnapshot??null,status:'queued',result:null,error:null,sessionPath:null,startedAt:null,finishedAt:null,createdAt:c.now,updatedAt:c.now,execution:{engine:'pi-sdk',promptRunsLimit:1,automaticRetry:false,toolsEnabled:false,sourceContextLimit:16000,verification:'ai_unverified',externalExecution:false}});
  c.emit('jobs',r.id,'queued',{kind:r.kind,sourceId:r.sourceId});return r;
 }
 const r=c.require('jobs',p.jobId);c.check(r);
 if(command==='cancel'){
  if(!['queued','running'].includes(r.status))throw new BusinessError('CONFLICT','作业已结束',409);
  if(r.kind==='intent'){const session=c.get('voice',r.sourceId);if(session?.jobId===r.id&&session.status==='analyzing'){c.update('voice',session.id,{status:'idle',intents:[],error:null,updatedAt:c.now});c.emit('voice',session.id,'interrupted',{jobId:r.id});}}
  const next=c.update('jobs',r.id,{status:'cancelled',finishedAt:c.now,updatedAt:c.now,error:null});c.emit('jobs',r.id,'cancelled');return next;
 }
 // Internal worker transitions are never registered as public commands.
 if(command==='preflight-failed'){if(r.status!=='queued')throw new BusinessError('CONFLICT','作业已变化',409);const next=c.update('jobs',r.id,{status:'failed',error:'来源状态或授权已变化，未发送模型；请刷新后重新提交。',finishedAt:c.now,updatedAt:c.now});c.emit('jobs',r.id,'failed');return next;}
 if(command==='running'){
  if(r.status!=='queued')throw new BusinessError('CONFLICT','作业不再等待执行',409);
  if(r.kind==='knowledge'){const source=c.require('books',r.sourceId),permission=c.require('sources',source.source);if(source.status!=='published'||!permission.active||!permission.authorized)throw new BusinessError('REVIEW_REQUIRED','原文状态或来源授权已变化，未发送模型',422);}
  const next=c.update('jobs',r.id,{status:'running',startedAt:c.now,updatedAt:c.now});c.emit('jobs',r.id,'running');return next;
 }
 if(command==='settle'){
  if(r.status!=='running')throw new BusinessError('CONFLICT','作业已取消或结束',409);
  const status=['completed','failed','interrupted'].includes(p.status)?p.status:'failed';
  const source=r.sourceId?c.get(r.kind==='research'?'research':r.kind==='knowledge'?'books':'voice',r.sourceId):null;
  const sourceStale=!!source&&(r.kind==='intent'?source.jobId!==r.id||source.turn!==r.sourceSnapshot?.turn:source.revision!==r.sourceVersion);
  const next=c.update('jobs',r.id,{status,result:status==='completed'?p.result:null,error:p.error??null,sourceStale,finishedAt:c.now,updatedAt:c.now});
  c.emit('jobs',r.id,status,{sourceId:r.sourceId,sourceStale:next.sourceStale});return next;
 }
 if(command==='session-path')return c.update('jobs',r.id,{sessionPath:p.path,updatedAt:c.now});
 throw new BusinessError('VALIDATION','未知作业操作');
}};

export const jobCommandId=()=>randomUUID();
