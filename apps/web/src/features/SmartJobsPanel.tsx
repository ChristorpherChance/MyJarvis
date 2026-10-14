import { useEffect, useState } from 'react';
import { useDemo } from '../demo/context';
import { Button, Dialog, Empty, Panel, Tag } from '../ui';
import { FormDialog, type FormSpec } from './operations/common';
import type { V1Record } from '../v1-client';
const labels:Record<string,string>={queued:'等待处理',running:'Pi处理中',completed:'待审阅',failed:'未完成',interrupted:'已中断',cancelled:'已取消'};
export function SmartJobsPanel({kind,sourceId,sourceVersion,title}:{kind:'research'|'knowledge';sourceId?:string;sourceVersion?:number;title?:string}){
 const {mode,real,act,refresh,data}=useDemo();const [form,setForm]=useState<FormSpec|null>(null),[selected,setSelected]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState('');
 const jobs=(real?.records.jobs||[]).filter(r=>r.kind===kind&&(!sourceId||r.sourceId===sourceId)&&(data.profile==='me'||r.scope==='family'));
 const active=jobs.some(j=>['queued','running'].includes(String(j.status))),job=jobs.find(j=>j.id===selected);
 useEffect(()=>{if(!active)return;let open=true;const timer=setInterval(()=>{if(open)void refresh().catch(()=>{})},2000);return()=>{open=false;clearInterval(timer)}},[active,refresh]);
 if(mode!=='live')return null;
 function create(){const version=sourceVersion;setForm({title:kind==='knowledge'?'Pi知识解读':'Pi研究作业',description:'单轮后台分析，结果需人工审阅。不会自动归档、发布或执行；模型费用按已配置供应商计费。',fields:[{key:'title',label:'作业标题',required:true},{key:'instruction',label:'分析目标',type:'textarea',required:true}],initial:{title:title||'Pi研究',instruction:kind==='knowledge'?'根据已发布原文梳理知识脉络，给出适合家人的独立故事提纲、页码引用和还需补充的资料。区分原文事实与解读。':''},submit:v=>act('pi.job',{command:'create',kind,title:v.title,instruction:v.instruction,sourceId,sourceVersion:version})})}
 async function cancel(r:V1Record){setPending(r.id);setError('');try{await act('pi.job',{command:'cancel',jobId:r.id,expectedVersion:r.revision})}catch(e){setError(e instanceof Error?e.message:'停止未确认')}finally{setPending('')}}
 return <Panel title={kind==='knowledge'?'Pi知识解读':'Pi后台研究'} actions={<Button kind="ghost" disabled={active||data.profile==='public'} onClick={create}>新建作业</Button>}>
 <p className="muted">单轮分析 · 待人工审阅 · 不自动付费续跑</p>
 <div className="op-stack">{jobs.map(r=><article className="op-evidence" key={r.id}><div className="op-row between"><strong>{String(r.title)}</strong><Tag>{labels[String(r.status)]||String(r.status)}</Tag></div><small>{String(r.createdAt)} · 来源修订 {String(r.sourceVersion??'无关联')} {r.sourceStale?'· 来源已更新':''}</small><div className="op-actions"><Button kind="ghost" onClick={()=>setSelected(r.id)}>查看作业</Button>{['queued','running'].includes(String(r.status))&&<Button disabled={!!pending} kind="ghost" onClick={()=>void cancel(r)}>{pending===r.id?'正在停止…':'停止作业'}</Button>}</div></article>)}</div>
 {!jobs.length&&<Empty title="暂无后台作业" detail="配置Pi模型后，可生成带来源快照的分析草稿。"/>}{error&&<p role="alert" className="error">{error}</p>}
 {job&&<Dialog title={String(job.title)} wide onClose={()=>setSelected('')}><Tag>{labels[String(job.status)]}</Tag><p>AI结果待审阅{job.sourceStale?' · 原来源已更新，需重新核对':''}</p><h3>分析目标</h3><pre className="op-code">{String(job.instruction)}</pre>{job.result?<><h3>分析草稿</h3><pre className="op-code">{String(job.result)}</pre></>:<p>{String(job.error||'尚无分析结果')}</p>}<small>不修改原文或研究结论。输入最多12,000字，来源上下文最多16,000字；大部头需分段分析。平台最多同时处理一项作业，单轮最长180秒。</small></Dialog>}
 {form&&<FormDialog spec={form} onClose={()=>setForm(null)}/>}</Panel>
}
export default SmartJobsPanel;
