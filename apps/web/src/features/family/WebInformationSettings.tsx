import {Icon} from '../../icons';
import {useEffect,useRef,useState,type FormEvent} from 'react';

type Feed={id:string;name:string;url:string;language:'zh'|'en'|'other';category:'general'|'international'|'science'|'health'|'technology'|'business';enabled:boolean};
type Settings={enabled:boolean;searchEnabled:boolean;pageReadEnabled:boolean;newsEnabled:boolean;provider:'bing-rss';timeoutMs:number;maxBytes:number;cacheSeconds:number;callsPerMinute:number;dailyRequestLimit:number;feeds:Feed[];revision:number};
type SearchResult={query:string;fetchedAt:string;results:{title:string;url:string;summary:string;providerDate?:string|null}[];cache?:{status:string;ageSeconds:number}};
type NewsResult={fetchedAt:string;items:{title:string;url:string;summary:string;sourcePublishedAt?:string|null;fetchedAt:string;source:{name:string}}[];sourceStatus:{id:string;name:string;status:string}[];undatedItemsMayBeOld:boolean};
class RequestError extends Error {constructor(message:string,readonly status:number){super(message);}}
async function request<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/runtime/web/'+path,{method,credentials:'same-origin',signal,headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json();if(!response.ok)throw new RequestError(result.error?.message||result.message||'操作未完成',response.status);return result.data??result;
}
function editable(value:Settings):Settings {
 // The GET response also contains read-only notes. Keep the PUT DTO explicit.
 return {enabled:value.enabled,searchEnabled:value.searchEnabled,pageReadEnabled:value.pageReadEnabled,newsEnabled:value.newsEnabled,provider:value.provider,timeoutMs:value.timeoutMs,maxBytes:value.maxBytes,cacheSeconds:value.cacheSeconds,callsPerMinute:value.callsPerMinute,dailyRequestLimit:value.dailyRequestLimit,feeds:value.feeds.map(f=>({id:f.id,name:f.name,url:f.url,language:f.language,category:f.category,enabled:f.enabled})),revision:value.revision};
}
function errorText(error:unknown){return error instanceof RequestError&&error.status===409?error.message+'；输入已保留，请重新加载后核对。':error instanceof Error?error.message:'操作未完成';}
function time(value:string|null|undefined){if(!value)return '未提供';const at=new Date(value);return Number.isNaN(at.getTime())?'未提供':at.toLocaleString('zh-CN',{hour12:false});}
function sourceUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'||u.protocol==='http:'?u.href:null;}catch{return null;}}
function SourceTitle({title,url}:{title:string;url:string}){const safe=sourceUrl(url);return safe?<a href={safe} target="_blank" rel="noopener noreferrer">{title} <Icon name="external" size={14}/></a>:<strong>{title}</strong>;}
const categories=[['general','综合'],['international','国际'],['science','科学'],['health','健康'],['technology','科技'],['business','商业']] as const;

export default function WebInformationSettings(){
 const [form,setForm]=useState<Settings|null>(null),[saved,setSaved]=useState<Settings|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState<'load'|'save'|'search'|'news'|null>('load');
 const [query,setQuery]=useState(''),[count,setCount]=useState(5),[language,setLanguage]=useState('zh-CN'),[searchConsent,setSearchConsent]=useState(false),[newsConsent,setNewsConsent]=useState(false),[search,setSearch]=useState<SearchResult|null>(null),[news,setNews]=useState<NewsResult|null>(null);
 const pending=useRef<AbortController|null>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;pending.current?.abort();};},[]);
 function apply(value:Settings){const next=editable(value);setForm(next);setSaved(next);}
 async function load(){pending.current?.abort();const controller=new AbortController();pending.current=controller;setBusy('load');setNotice('');try{const value=await request<Settings>('settings','GET',undefined,controller.signal);if(mounted.current&&!controller.signal.aborted)apply(value);}catch(error){if(mounted.current&&!controller.signal.aborted)setNotice(errorText(error));}finally{if(mounted.current&&pending.current===controller){pending.current=null;setBusy(null);}}}
 function patch<K extends keyof Settings>(key:K,value:Settings[K]){setForm(old=>old?{...old,[key]:value}:old);}
 function patchFeed<K extends keyof Feed>(index:number,key:K,value:Feed[K]){setForm(old=>old?{...old,feeds:old.feeds.map((feed,i)=>i===index?{...feed,[key]:value}:feed)}:old);}
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!form||busy)return;
  if(new Set(form.feeds.map(f=>f.id)).size!==form.feeds.length){setNotice('新闻源标识不能重复，请调整后保存。');return;}
  if(form.feeds.some(f=>!sourceUrl(f.url))){setNotice('新闻源须为公共 HTTP(S) 地址。');return;}
  const {revision,...values}=editable(form),controller=new AbortController();pending.current=controller;setBusy('save');setNotice('');
  try{const value=await request<Settings>('settings','PUT',{...values,expectedVersion:revision},controller.signal);if(mounted.current&&!controller.signal.aborted){apply(value);setSearch(null);setNews(null);setNotice('联网资料设置已保存。');}}catch(error){if(mounted.current&&!controller.signal.aborted)setNotice(errorText(error));}finally{if(mounted.current&&pending.current===controller){pending.current=null;setBusy(null);}}
 }
 async function trial(kind:'search'|'news',event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;const consent=kind==='search'?searchConsent:newsConsent;if(!consent)return;
  const controller=new AbortController();pending.current=controller;setBusy(kind);setNotice('');setSearchConsent(false);setNewsConsent(false);
  if(kind==='search')setSearch(null);else setNews(null);
  try{
   const body={input:kind==='search'?{query:query.trim(),count,language}:{count:5,withinHours:72},networkConsent:consent};
   if(kind==='search'){const value=await request<SearchResult>('search','POST',body,controller.signal);if(mounted.current&&!controller.signal.aborted)setSearch(value);}
   else{const value=await request<NewsResult>('news','POST',body,controller.signal);if(mounted.current&&!controller.signal.aborted)setNews(value);}
   if(mounted.current&&!controller.signal.aborted)setNotice(kind==='search'?'搜索完成。':'新闻查询完成。');
  }catch(error){if(mounted.current&&!controller.signal.aborted)setNotice(errorText(error));}finally{if(mounted.current&&pending.current===controller){pending.current=null;setBusy(null);}}
 }
 return <div className="runtime-panel">
  <div className="runtime-panel-head"><div><h3>联网资料</h3><p>搜索公开网页、读取正文与查询新闻，保留来源和时间。</p></div><button type="button" disabled={!!busy} onClick={()=>void load()}>重新加载</button></div>
  <p className="runtime-note" role="status">{notice||(busy==='load'?'正在加载设置…':'Bing 公开搜索 RSS 无需 API 密钥；新闻来自下方已启用来源。')}</p>
  {form&&<form onSubmit={save} style={{display:'grid',gap:18}}>
   <fieldset disabled={!!busy}><legend>查询策略 · 版本 {form.revision}</legend>
    <div className="runtime-form-grid">{([['enabled','启用联网资料'],['searchEnabled','允许网页搜索'],['pageReadEnabled','允许读取公开网页'],['newsEnabled','允许新闻查询']] as const).map(([key,title])=><label className="runtime-check" key={key} style={{flexDirection:'row'}}><input type="checkbox" checked={form[key]} onChange={e=>patch(key,e.target.checked)}/>{title}</label>)}</div>
    <details><summary>请求限额与缓存</summary><div className="runtime-form-grid">
     <label>请求超时（秒）<input type="number" min={1} max={20} step={.001} required value={form.timeoutMs/1000} onChange={e=>patch('timeoutMs',Math.round(Number(e.target.value)*1000))}/></label>
     <label>单次读取上限（KiB）<input type="number" min={16} max={2048} step={1/1024} required value={form.maxBytes/1024} onChange={e=>patch('maxBytes',Math.round(Number(e.target.value)*1024))}/></label>
     <label>缓存时间（秒）<input type="number" min={0} max={300} step={1} required value={form.cacheSeconds} onChange={e=>patch('cacheSeconds',Number(e.target.value))}/></label>
     <label>每分钟请求上限<input type="number" min={1} max={30} step={1} required value={form.callsPerMinute} onChange={e=>patch('callsPerMinute',Number(e.target.value))}/></label>
     <label>每日请求上限<input type="number" min={1} max={1000} step={1} required value={form.dailyRequestLimit} onChange={e=>patch('dailyRequestLimit',Number(e.target.value))}/></label>
    </div></details>
   </fieldset>
   <fieldset disabled={!!busy}><legend>新闻来源 · {form.feeds.length}/8</legend><p>填写公开 RSS 地址，至少保留一个来源；停用的来源不会参与查询。</p>
    {form.feeds.map((feed,index)=><fieldset key={index}><legend>新闻源 {index+1}</legend><div className="runtime-form-grid">
     <label>来源名称<input required maxLength={100} value={feed.name} onChange={e=>patchFeed(index,'name',e.target.value)}/></label>
     <label>来源标识<input required maxLength={50} pattern="[a-z0-9-]{1,50}" title="使用小写字母、数字或短横线，且不能重复" value={feed.id} onChange={e=>patchFeed(index,'id',e.target.value)}/></label>
     <label>RSS 地址<input type="url" required maxLength={2000} placeholder="https://example.com/news.xml" value={feed.url} onChange={e=>patchFeed(index,'url',e.target.value)}/></label>
     <label>来源语言<select aria-label="来源语言" value={feed.language} onChange={e=>patchFeed(index,'language',e.target.value as Feed['language'])}><option value="zh">中文</option><option value="en">英语</option><option value="other">其他语言</option></select></label>
     <label>来源分类<select aria-label="来源分类" value={feed.category} onChange={e=>patchFeed(index,'category',e.target.value as Feed['category'])}>{categories.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label>
     <label className="runtime-check" style={{flexDirection:'row'}}><input type="checkbox" checked={feed.enabled} onChange={e=>patchFeed(index,'enabled',e.target.checked)}/>启用此来源</label>
    </div><button type="button" disabled={form.feeds.length<=1} onClick={()=>patch('feeds',form.feeds.filter((_,i)=>i!==index))}>移除新闻源 {index+1}</button></fieldset>)}
    <button type="button" disabled={form.feeds.length>=8} onClick={()=>patch('feeds',[...form.feeds,{id:'',name:'',url:'',language:'zh',category:'general',enabled:true}])}>添加新闻源</button>
   </fieldset><button type="submit" style={{justifySelf:'start'}} disabled={!!busy}>{busy==='save'?'保存中…':'保存联网设置'}</button>
  </form>}
  {saved&&<section><h4>查询试验</h4><p>使用已保存的设置。每次点击查询前单独允许联网；仅本地的成员策略仍优先。</p>
   <form onSubmit={e=>void trial('search',e)}><fieldset disabled={!!busy||!saved.enabled||!saved.searchEnabled}><legend>公开网页搜索</legend><div className="runtime-form-grid">
    <label>搜索问题<input required maxLength={300} value={query} onChange={e=>setQuery(e.target.value)} placeholder="输入要查证的问题"/></label>
    <label>结果数量<input type="number" required min={1} max={10} step={1} value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
    <label>搜索语言<select aria-label="搜索语言" value={language} onChange={e=>setLanguage(e.target.value)}><option value="zh-CN">中文</option><option value="en-US">英语</option></select></label>
   </div><label className="runtime-check" style={{flexDirection:'row'}}><input type="checkbox" checked={searchConsent} onChange={e=>setSearchConsent(e.target.checked)}/>允许本次搜索联网</label><button type="submit" disabled={!searchConsent||!query.trim()}>{busy==='search'?'搜索中…':'搜索公开网页'}</button></fieldset></form>
   {search&&<section aria-label="搜索结果"><p>抓取时间：{time(search.fetchedAt)}{search.cache?.status==='cached'?' · 缓存 '+search.cache.ageSeconds+' 秒':''}</p><small>搜索 RSS 日期不代表原文发布时间。</small>{search.results.length?search.results.map((item,index)=><article key={item.url+'-'+index}><p><SourceTitle title={item.title} url={item.url}/></p><p>{item.summary}</p><small>来源：{sourceUrl(item.url)?new URL(item.url).hostname:'地址不可用'} · 搜索来源日期：{time(item.providerDate)}</small></article>):<p>本次没有找到结果。</p>}</section>}
   <form onSubmit={e=>void trial('news',e)}><fieldset disabled={!!busy||!saved.enabled||!saved.newsEnabled}><legend>最近新闻</legend><p>查询已启用来源最近 72 小时的更新，最多显示 5 条。</p><label className="runtime-check" style={{flexDirection:'row'}}><input type="checkbox" checked={newsConsent} onChange={e=>setNewsConsent(e.target.checked)}/>允许本次新闻查询联网</label><button type="submit" disabled={!newsConsent}>{busy==='news'?'查询中…':'查询最近新闻'}</button></fieldset></form>
   {news&&<section aria-label="新闻结果"><p>抓取时间：{time(news.fetchedAt)}</p><small>来源报告的发布时间未经独立核实；已配置新闻源不代表全部新闻。{news.undatedItemsMayBeOld&&' 无日期条目可能较旧。'}</small>{news.items.length?news.items.map((item,index)=><article key={item.url+'-'+index}><p><SourceTitle title={item.title} url={item.url}/></p><p>{item.summary}</p><small>{item.source.name} · 来源发布时间：{time(item.sourcePublishedAt)} · 抓取：{time(item.fetchedAt)}</small></article>):<p>本次没有符合时间范围的新闻。</p>}{news.sourceStatus.some(s=>s.status==='unavailable')&&<p>暂不可用的来源：{news.sourceStatus.filter(s=>s.status==='unavailable').map(s=>s.name).join('、')}</p>}</section>}
  </section>}
 </div>;
}
