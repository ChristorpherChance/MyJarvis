import {useEffect,useRef,useState} from 'react';
import {materialSessionGeneration} from '../operations/inbox-material-store';
import {decryptOfflinePackage,type OfflineVaultDraft} from './offline-vault';

export function OfflineDraftImport({enabled,onImport}:{enabled:boolean;onImport:(draft:OfflineVaultDraft,current:()=>boolean)=>Promise<void>}){
 const [file,setFile]=useState<File|null>(null),[passphrase,setPassphrase]=useState(''),[preview,setPreview]=useState<OfflineVaultDraft|null>(null),[busy,setBusy]=useState(false),[issue,setIssue]=useState('');
 const alive=useRef(true),generation=useRef(0),enabledNow=useRef(enabled),session=useRef(materialSessionGeneration()),input=useRef<HTMLInputElement>(null);enabledNow.current=enabled;
 const clear=()=>{generation.current++;setPreview(null);setFile(null);setPassphrase('');setBusy(false);if(input.current)input.current.value=''};
 useEffect(()=>{alive.current=true;const invalidated=()=>{clear();setIssue('登录已变化，已隐藏离线草稿，请重新验证后再导入。')};const storage=(event:StorageEvent)=>{if(event.key===null||event.key==='jarvis-inbox-material-session-v1'||event.key==='jarvis-member-session-epoch-v1')invalidated()};window.addEventListener('storage',storage);window.addEventListener('jarvis:inbox-materials-invalidated',invalidated);return()=>{alive.current=false;generation.current++;window.removeEventListener('storage',storage);window.removeEventListener('jarvis:inbox-materials-invalidated',invalidated)}},[]);
 useEffect(()=>{if(!enabled)clear()},[enabled]);
 async function unlock(){
  if(!enabledNow.current||busy||!file)return;const turn=++generation.current,epoch=materialSessionGeneration();session.current=epoch;setBusy(true);setIssue('');setPreview(null);
  const current=()=>alive.current&&enabledNow.current&&generation.current===turn&&materialSessionGeneration()===epoch;
  try{const value=await decryptOfflinePackage(file,passphrase);if(current())setPreview(value)}catch(error){if(current())setIssue(error instanceof Error?error.message:'密文草稿未能解锁。')}finally{if(current()){setPassphrase('');setBusy(false)}}
 }
 async function confirm(){
  if(!preview||busy||!enabledNow.current)return;const value=preview,turn=++generation.current,epoch=session.current;setBusy(true);setIssue('');
  const current=()=>alive.current&&enabledNow.current&&turn===generation.current&&materialSessionGeneration()===epoch;
  try{if(!current())throw new DOMException('Aborted','AbortError');await onImport(value,current);if(alive.current){clear();setIssue('已导入当前浏览器草稿。尚未上传或提交，请核对后点击“保存记录”。')}}catch(error){if(current())setIssue(error instanceof Error&&error.name!=='AbortError'?error.message:'登录或草稿已变化，本次没有继续导入。')}finally{if(current())setBusy(false)}
 }
 return <details className="inbox-offline-import"><summary>离线收件与密文草稿导入</summary><p><a href="/offline-capture.html" target="_blank" rel="noopener noreferrer">打开独立离线收件</a> · 首次需联网准备，断网后用本机口令恢复。离线页不读取平台知识、记忆或身份。</p><p>选取从离线页导出的密文文件，在本机解锁后核对。导入会转为当前已登录浏览器的普通草稿，不自动上传、提取链接或保存到收件。每次导入创建一份新草稿，不是后台同步。</p>{!enabled&&<p>请先保存或明确清除当前草稿，再导入。</p>}
  <label>离线密文文件<input ref={input} aria-label="离线密文文件" type="file" accept=".jarvis-draft,application/json" disabled={!enabled||busy} onChange={event=>{generation.current++;setPreview(null);setPassphrase('');setFile(event.target.files?.[0]??null);setIssue('')}}/></label>
  <label>本机解锁口令<input aria-label="离线草稿解锁口令" type="password" autoComplete="off" maxLength={256} disabled={!enabled||busy} value={passphrase} onChange={event=>setPassphrase(event.target.value)}/></label>
  <button type="button" disabled={!enabled||busy||!file||!passphrase} onClick={()=>void unlock()}>{busy?'正在处理密文…':'解锁导入预览'}</button>
  {preview&&<section aria-label="离线草稿导入预览"><h3>{preview.title||'未填写标题的离线草稿'}</h3><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.rawText}</p>{preview.sourceUrl&&<p>来源链接：{preview.sourceUrl}</p>}<p>范围：{({private:'私人',personal:'个人',family:'家庭',company:'公司'})[preview.scope]} · {preview.materials.length} 份原件</p><ul>{preview.materials.map(item=><li key={item.id}>{item.filename} · {(item.size/1024/1024).toFixed(2)} MiB</li>)}</ul><button type="button" disabled={!enabled||busy} onClick={()=>void confirm()}>确认导入当前草稿</button><button type="button" disabled={busy} onClick={clear}>取消并隐藏预览</button></section>}
  {issue&&<p role="status">{issue}</p>}
 </details>;
}
