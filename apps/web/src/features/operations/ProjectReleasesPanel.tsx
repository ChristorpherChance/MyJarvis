import {useCallback,useEffect,useRef,useState} from 'react';
import {Button,Empty,Panel,Tag,type Props} from './common';
import {usePrivateRuntime} from './usePrivateRuntime';
import './project-acceptance.css';

type HumanAcceptance={outcome?:string;evidence?:string;tests?:string;artifacts?:string[];reviewerId?:string;at?:string};
type Release={id:string;projectId:string;taskId?:string|null;version:string;artifactIds?:string[];acceptance?:HumanAcceptance;createdAt?:string;revision?:number;scope?:string;ownerId?:string;[key:string]:unknown};
type ReleasePage={items:Release[];total:number;offset:number;limit:number;nextOffset:number|null};
const empty:ReleasePage={items:[],total:0,offset:0,limit:25,nextOffset:null};
const asText=(value:unknown)=>typeof value==='string'&&value.trim()?value:typeof value==='number'&&Number.isFinite(value)?String(value):'未提供';
export default function ProjectReleasesPanel({projectId,navigate}:{projectId:string;navigate:Props['navigate']}){
 const [page,setPage]=useState<ReleasePage>(empty),[offset,setOffset]=useState(0),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[error,setError]=useState('');
 const mounted=useRef(false),flight=useRef(0),denied=useRef(false);
 const api=usePrivateRuntime(()=>{flight.current++;denied.current=true;setPage(empty);setOffset(0);setError('');setFailed(true);setLoading(false);});
 const base=`/api/v1/projects/${encodeURIComponent(projectId)}/releases`;
 const load=useCallback(async(next=0)=>{if(!mounted.current||denied.current)return;const own=++flight.current;setLoading(true);setError('');try{const result=await api<{data:ReleasePage}>(`${base}?offset=${next}&limit=25`);if(own!==flight.current)return;if(result.data.items.some(item=>item.projectId!==projectId))throw new Error('发布清单返回了其他项目记录，已拒绝显示。');setPage(result.data);setOffset(result.data.offset);setFailed(false);}catch(e){if(own===flight.current&&(e as Error).name!=='AbortError'){setError((e as Error).message||'发布清单暂不可读。');setFailed(true);}}finally{if(own===flight.current)setLoading(false);}},[api,base,projectId]);
 const loader=useRef(load);loader.current=load;
 useEffect(()=>{mounted.current=true;denied.current=false;flight.current++;setPage(empty);setOffset(0);setFailed(false);setError('');void loader.current(0);return()=>{mounted.current=false;flight.current++;};},[projectId]);
 const pageTurn=(next:number)=>{setOffset(next);void load(next);};
 return <section className="project-acceptance project-releases" aria-label="项目发布包">
  <Panel title="只读发布记录" actions={<Button kind="ghost" disabled={loading} onClick={()=>void load(offset)}>{loading?'读取中…':'刷新'}</Button>}>
   <p className="pa-intro">仅展示项目已登记的不可变发布记录、人工验收声明与产物引用。此页不会实际打包、部署或发布。</p>
   {error&&<p className="pa-error" role="alert">{error}</p>}{failed&&<p className="pa-warning">读取失败，以下不显示旧项目的缓存结果。</p>}
   {loading&&!page.items.length&&<p role="status">正在读取项目发布记录…</p>}
   {!failed&&!loading&&!page.items.length&&<Empty title="暂无发布记录" detail="此页只读取已登记的项目发布包，不会在此创建或构建。"/>}
   <div className="pa-release-list">{page.items.map(release=><article key={release.id} className="pa-release"><header><div><h3>{release.version}</h3><small>发布记录 ID · <code>{release.id}</code></small></div><Tag>只读 · 不可变</Tag></header><dl className="pa-fields"><div><dt>项目</dt><dd>{release.projectId}</dd></div><div><dt>来源任务</dt><dd>{release.taskId??'未关联'}</dd></div><div><dt>记录时间</dt><dd>{asText(release.createdAt)}</dd></div><div><dt>版本</dt><dd>{release.version}</dd></div></dl>
    <section><h4>人工验收声明</h4>{release.acceptance?<><p>结果：{release.acceptance.outcome==='pass'?'人工声明通过':release.acceptance.outcome==='fail'?'人工声明未通过':asText(release.acceptance.outcome)}</p><p>{asText(release.acceptance.evidence)}</p><p>测试说明：{asText(release.acceptance.tests)}</p><small>记录人 {asText(release.acceptance.reviewerId)} · {asText(release.acceptance.at)}</small></>:<p className="pa-muted">该发布记录没有随附人工验收声明，未推断通过。</p>}</section>
    <section><h4>产物引用</h4>{release.artifactIds?.length?<ul className="pa-artifacts">{release.artifactIds.map((artifact,index)=><li key={`${artifact}-${index}`}><code>{artifact}</code></li>)}</ul>:<p className="pa-muted">没有产物引用。</p>}{((release.acceptance?.artifacts??[]).length>0)&&<><h5>验收时引用的产物</h5><ul className="pa-artifacts">{(release.acceptance?.artifacts??[]).map((artifact,index)=><li key={`${artifact}-${index}`}><code>{artifact}</code></li>)}</ul></>}</section>
    {release.taskId&&<Button kind="ghost" onClick={()=>navigate('tasks/'+encodeURIComponent(release.taskId!))}>查看关联任务</Button>}
    <p className="pa-muted">发布记录为平台既有不可变数据 · revision：{asText(release.revision)} · scope：{asText(release.scope)}</p>
   </article>)}</div>
   {page.total>page.limit&&<div className="pa-pagination"><span>{page.offset+1}–{Math.min(page.offset+page.items.length,page.total)} / {page.total}</span><Button kind="ghost" disabled={offset===0||loading} onClick={()=>pageTurn(Math.max(0,offset-page.limit))}>上一页</Button><Button kind="ghost" disabled={page.nextOffset===null||loading} onClick={()=>pageTurn(page.nextOffset??0)}>下一页</Button></div>}
   <p className="pa-footnote">人工验收声明与产物字符串属于登记信息；本页不验证文件存在性、不自动验收任务，也不表示实际打包或部署成功。</p>
  </Panel>
 </section>;
}
