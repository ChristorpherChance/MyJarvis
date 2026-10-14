import {useEffect,useState} from 'react';
import {usePrivateRuntime} from './usePrivateRuntime';
export default function ServiceLogsPanel({serviceId}:{serviceId:string}){
 const [items,setItems]=useState<any[]>([]),[cursor,setCursor]=useState(0),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const api=usePrivateRuntime(()=>{setItems([]);setCursor(0);setMore(false);});
 async function load(append=false){setBusy(true);try{const result=await api(`/api/v1/execution/services/${encodeURIComponent(serviceId)}/logs?after=${append?cursor:0}&limit=100`);setItems(old=>append?[...old,...result.data.items].slice(-1000):result.data.items);setCursor(result.data.nextAfter);setMore(result.data.hasMore);setNotice(result.data.note);}catch(e){if((e as Error).name!=='AbortError')setNotice((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{setItems([]);setCursor(0);void load();},[serviceId]);
 return <section className="service-log-panel"><div className="op-row"><strong>服务原始日志</strong><button disabled={busy} onClick={()=>void load()}>刷新日志</button>{more&&<button disabled={busy} onClick={()=>void load(true)}>加载后续</button>}</div><p>{notice||'来源为已授权签名节点的固定UTF-8文件。'}</p>{items.length?<pre className="runtime-log">{items.map(l=>`${new Date(l.receivedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} [${l.sourceId}] ${l.text}`).join('\n')}</pre>:<p>暂无已采集日志。请在节点执行设置中登记采集来源，并配置节点本地文件白名单。</p>}</section>;
}
