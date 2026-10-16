import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { V1Error, type V1Scope } from '../../v1-client';
import { Button, Note } from './common';
import { downloadLocalMaterial, extractInboxLink, MATERIAL_MAX_COUNT, MATERIAL_MAX_SIZE, materialFileUrl, materialStatus, readInboxMaterial, safeSourceUrl, uploadInboxMaterial, type InboxMaterial } from './inbox-material-client';
import { getInboxMaterialDraft, materialSessionGeneration, saveInboxMaterialDraft, type LocalInboxMaterial } from './inbox-material-store';
import { MaterialProcessing } from './MaterialProcessing';
import { getMaterialIntent, removeMaterialIntent, saveMaterialIntent, type LinkMaterialIntent } from './inbox-material-intents';

export interface CaptureMaterialsHandle { ensureUploaded:()=>Promise<string[]>; finishRecording:()=>Promise<void> }
export interface MaterialCaptureState {count:number;working:boolean;recording:boolean;loading:boolean;pendingLink?:boolean}
type Props={actorId:string;draftId:string;scope:V1Scope;sourceUrl?:string;attachmentIds:string[];locked:boolean;onTouch:(ids?:string[])=>boolean;onState:(state:MaterialCaptureState)=>void};
const extensions:Record<string,string>={txt:'text/plain',md:'text/markdown',markdown:'text/markdown',csv:'text/csv',json:'application/json',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',webm:'audio/webm',ogg:'audio/ogg',oga:'audio/ogg',wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4'};
function LocalPreview({item}:{item:LocalInboxMaterial}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{if(!item.blob){setUrl('');return}const next=URL.createObjectURL(item.blob);setUrl(next);return()=>URL.revokeObjectURL(next)},[item.blob]);
  return item.mime.startsWith('audio/')?<audio aria-label={'回听 '+item.filename} controls preload="metadata" src={url||(item.asset?materialFileUrl(item.asset.id):undefined)}/>:null;
}
function SavedMaterialSource({item,actorId}:{item:InboxMaterial;actorId:string}) {
  const [asset,setAsset]=useState(item);
  return <article className="inbox-material-row"><strong>{asset.filename}</strong><small>{materialStatus(asset)} · {(asset.size/1024/1024).toFixed(2)} MiB</small>{asset.mediaKind==='audio'&&<audio controls preload="metadata" src={materialFileUrl(asset.id)} aria-label={'回听 '+asset.filename}/>}<a className="inbox-material-download" href={materialFileUrl(asset.id)} target="_blank" rel="noopener noreferrer" download={asset.filename}>查看 / 下载原件</a><MaterialProcessing asset={asset} actorId={actorId} onChanged={setAsset}/></article>;
}

export function InboxMaterialSources({sourceUrl,attachments,actorId=''}:{sourceUrl?:unknown;attachments?:unknown;actorId?:string}) {
  const list=Array.isArray(attachments)?attachments as InboxMaterial[]:[];
  // All source links pass the same allowlist as capture; historical values never become executable URLs.
  const source=safeSourceUrl(sourceUrl);
  if(!source&&!list.length)return null;
  return <section className="inbox-material-sources" aria-label="来源与原件">{source&&<p>来源链接：<a href={source} target="_blank" rel="noopener noreferrer">{source}</a><small>保留原始链接；只有明确点击提取才获取网页正文。</small></p>}{list.map(item=><SavedMaterialSource key={item.id} item={item} actorId={actorId}/>)}</section>;
}

export const CaptureMaterials=forwardRef<CaptureMaterialsHandle,Props>(function CaptureMaterials(props,ref){
  const {actorId,draftId,scope,locked}=props;
  const callbacks=useRef(props);callbacks.current=props;
  const [items,setItems]=useState<LocalInboxMaterial[]>([]),[working,setWorking]=useState(false),[recording,setRecording]=useState(false),[loading,setLoading]=useState(true),[issue,setIssue]=useState(''),[warning,setWarning]=useState(''),[seconds,setSeconds]=useState(0),[drag,setDrag]=useState(false);
  const [processingCount,setProcessingCount]=useState(0),[pendingLink,setPendingLink]=useState<LinkMaterialIntent|null>(()=>{try{const intent=getMaterialIntent(actorId,'link:'+draftId);return intent?.kind==='link'?intent:null}catch{return null}});
  const isWorking=working||processingCount>0;
  const current=useRef(items),active=useRef(true),mutating=useRef(false),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),finish=useRef<Promise<void>|null>(null),saveChain=useRef(Promise.resolve()),session=useRef(materialSessionGeneration());
  const input=useRef<HTMLInputElement>(null);
  const unauthorized=(error:unknown)=>{if(active.current&&session.current===materialSessionGeneration()&&error instanceof V1Error&&error.status===401)window.dispatchEvent(new Event('jarvis:auth-required'));};
  const publish=(next:LocalInboxMaterial[])=>{current.current=next;if(active.current)setItems(next)};
  const retain=(next:LocalInboxMaterial[]):Promise<void>=>{
    publish(next);
    const pending=saveChain.current.catch(()=>{}).then(()=>saveInboxMaterialDraft(actorId,draftId,next,session.current));
    saveChain.current=pending;
    return pending.then(()=>{if(active.current)setWarning('')}).catch(()=>{if(active.current)setWarning('附件尚未可靠保留在此浏览器，请保持页面打开，先下载本机原件或上传保存。');});
  };
  useEffect(()=>{
    active.current=true;let cancelled=false;
    void (async()=>{
      let restored:LocalInboxMaterial[]=[];
      try{restored=await getInboxMaterialDraft(actorId,draftId)}catch{if(!cancelled)setWarning('此浏览器暂时无法恢复附件草稿。新附件可先上传；未上传的录音请下载保留。')}
      for(const id of props.attachmentIds){if(restored.some(item=>item.id===id))continue;try{const asset=await readInboxMaterial(id);restored.push({id,filename:asset.filename,mime:asset.mime,size:asset.size,scope:asset.scope||scope,asset})}catch(error){unauthorized(error);if(!cancelled)setIssue('有原件暂时无法读取，请恢复网络后重新打开草稿。')}}
      if(!cancelled){publish(restored);setLoading(false)}
    })();
    try{const intent=getMaterialIntent(actorId,'link:'+draftId);if(intent?.kind==='link')setPendingLink(intent)}catch(error){setIssue(error instanceof Error?error.message:'网页提取编号暂时无法恢复。')}
    const invalidated=()=>{active.current=false;recorder.current?.state==='recording'&&recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop());};
    window.addEventListener('jarvis:inbox-materials-invalidated',invalidated);
    return()=>{cancelled=true;active.current=false;window.removeEventListener('jarvis:inbox-materials-invalidated',invalidated);if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop());};
  },[actorId,draftId]);
  useEffect(()=>{callbacks.current.onState({count:items.length,working:isWorking,recording,loading,pendingLink:!!pendingLink})},[items.length,isWorking,recording,loading,!!pendingLink]);
  useEffect(()=>{if(!recording)return;const started=Date.now();const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-started)/1000)),500);return()=>clearInterval(timer)},[recording]);
  useEffect(()=>{const protect=(event:BeforeUnloadEvent)=>{if(recording||working){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect)},[recording,working]);
  const addFiles=async(files:File[])=>{
    if(locked||isWorking||recording||mutating.current||loading||!active.current)return;
    if(files.length+current.current.length>MATERIAL_MAX_COUNT){setIssue('每条记录最多保留 5 个原件。');return}
    const additions:LocalInboxMaterial[]=[];
    for(const file of files){const ext=file.name.split('.').at(-1)?.toLowerCase()||'',mime=extensions[ext];if(!mime){setIssue('请选择 txt、md、csv、json、pdf、docx、图片或音频文件。');return}if(file.size===0||file.size>MATERIAL_MAX_SIZE){setIssue('原件不能为空，每个原件最多 25 MiB。');return}additions.push({id:crypto.randomUUID(),filename:file.name,mime,size:file.size,scope,blob:file})}
    if(!additions.length||!callbacks.current.onTouch())return;
    mutating.current=true;setWorking(true);setIssue('');try{await retain([...current.current,...additions])}finally{mutating.current=false;if(active.current)setWorking(false)}
  };
  const remove=async(id:string)=>{const next=current.current.filter(item=>item.id!==id);if(locked||recording||mutating.current||!callbacks.current.onTouch(next.filter(item=>item.asset).map(item=>item.id)))return;mutating.current=true;setWorking(true);try{await retain(next)}finally{mutating.current=false;if(active.current)setWorking(false)}};
  const uploadAll=async()=>{
    if(loading||mutating.current||recorder.current?.state==='recording')throw new Error('请先停止录音，等待本机保存完成。');
    mutating.current=true;setWorking(true);setIssue('');
    try{for(const item of [...current.current]){
      if(!active.current||session.current!==materialSessionGeneration())throw new Error('会话已变化，已停止上传。');
      if(item.scope!==scope)throw new Error('原件的可见范围与草稿不一致，请移除原件后重新选择。');
      if(item.asset?.status==='stored'||item.asset?.sha256)continue;
      if(!item.blob)throw new Error('本机原件暂时不可用，请重新添加。');
      if(item.blob.size>MATERIAL_MAX_SIZE)throw new Error('原件超过 25 MiB，请下载保留后缩短再添加。');
      const asset=await uploadInboxMaterial({id:item.id,filename:item.filename,mime:item.mime,blob:item.blob,scope:item.scope});
      if(!active.current||session.current!==materialSessionGeneration())throw new Error('会话已变化，已停止上传。');
      if(!callbacks.current.onTouch(current.current.filter(row=>row.asset||row.id===item.id).map(row=>row.id)))throw new Error('草稿无法持久保存，已停止提交。');
      await retain(current.current.map(row=>row.id===item.id?{...row,asset}:row));
    }return current.current.map(item=>item.id)}catch(error){unauthorized(error);if(active.current)setIssue(error instanceof Error?error.message:'原件上传未完成，原件仍保留在这里。');throw error}finally{mutating.current=false;if(active.current)setWorking(false)}
  };
  const extractLink=async()=>{
    if(locked||isWorking||recording||loading||mutating.current||!active.current)return;
    const url=safeSourceUrl(props.sourceUrl);if(!pendingLink&&!url){setIssue('请先填写完整的 http 或 https 来源链接。');return}
    if(current.current.length>=MATERIAL_MAX_COUNT&&!current.current.some(item=>item.id===pendingLink?.input.id)){setIssue('每条记录最多保留 5 个原件，请先移除一个附件。');return}
    const intent:LinkMaterialIntent=pendingLink||{kind:'link',input:{id:crypto.randomUUID(),url:url!,scope}};
    if(intent.input.scope!==scope){setIssue('上次网页提取的范围与当前草稿不一致，请重新打开原草稿确认。');return}
    if(!callbacks.current.onTouch())return;
    mutating.current=true;setWorking(true);setIssue('');
    try{
      saveMaterialIntent(actorId,'link:'+draftId,intent);setPendingLink(intent);
      const asset=await extractInboxLink(intent.input);
      if(!active.current||session.current!==materialSessionGeneration())return;
      if(asset.id!==intent.input.id)throw new Error('网页提取尚未收到完整保存回执，请确认同一次提取。');
      if(asset.status==='failed'){removeMaterialIntent(actorId,'link:'+draftId,intent);setPendingLink(null);throw new Error(asset.processing?.error?.message||'这次网页正文提取未完成，链接仍保留。可核对后再次点击提取。')}
      if(asset.status!=='stored')throw new Error('网页正文仍在提取，稍后请确认同一次提取。');
      if(!callbacks.current.onTouch([...new Set([...current.current.filter(item=>item.asset).map(item=>item.id),asset.id])]))throw new Error('网页正文已经保存，但草稿引用尚未保留，请确认同一次提取。');
      await retain([...current.current.filter(item=>item.id!==asset.id),{id:asset.id,filename:asset.filename,mime:asset.mime,size:asset.size,scope:intent.input.scope,asset}]);
      removeMaterialIntent(actorId,'link:'+draftId,intent);setPendingLink(null);
      if(asset.processing?.status==='failed')setIssue('网页原件已保存，但正文提取未完成。可查看原件，并在这份材料下重新提取文字。');
    }catch(error){unauthorized(error);if(active.current&&session.current===materialSessionGeneration()){setIssue(error instanceof TypeError?'网页提取结果尚未确认，请确认同一次提取。':error instanceof Error?error.message:'网页提取结果待确认。');if(error instanceof V1Error&&[400,403,404,422,503].includes(error.status)){try{await readInboxMaterial(intent.input.id)}catch(readError){unauthorized(readError);if(active.current&&session.current===materialSessionGeneration()&&readError instanceof V1Error&&readError.status===404){try{removeMaterialIntent(actorId,'link:'+draftId,intent);setPendingLink(null)}catch{/* Keep the original intent if local storage is unavailable. */}}}}}}
    finally{mutating.current=false;if(active.current)setWorking(false)}
  };
  const startRecording=async()=>{
    if(locked||isWorking||recording||loading||mutating.current)return;
    if(current.current.length>=MATERIAL_MAX_COUNT){setIssue('每条记录最多保留 5 个原件。');return}
    if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder){setIssue('此浏览器无法直接录音，可以选择已有音频文件上传。');return}
    if(!callbacks.current.onTouch())return;
    mutating.current=true;setWorking(true);setIssue('');
    let recordingTimer:ReturnType<typeof setTimeout>|undefined;
    try{
      const microphone=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!active.current||session.current!==materialSessionGeneration()){microphone.getTracks().forEach(track=>track.stop());return}
      stream.current=microphone;
      const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
      const next=new MediaRecorder(microphone,mime?{mimeType:mime}:undefined);recorder.current=next;
      const parts:Blob[]=[],id=crypto.randomUUID(),baseMime=(next.mimeType||'audio/webm').split(';')[0],ext=baseMime.includes('mp4')?'m4a':baseMime.includes('ogg')?'ogg':'webm',filename='灵感录音-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+ext;
      let bytes=0,resolveFinish:()=>void=()=>{};finish.current=new Promise<void>(resolve=>{resolveFinish=resolve});
      next.ondataavailable=event=>{if(!event.data.size||!active.current)return;parts.push(event.data);bytes+=event.data.size;
        if(bytes>MATERIAL_MAX_SIZE){setIssue('录音达到 25 MiB 上限，已停止；请删除或下载后缩短再上传。');if(next.state==='recording')next.stop()}
        const blob=new Blob(parts,{type:baseMime});void retain([...current.current.filter(item=>item.id!==id),{id,filename,mime:baseMime,size:blob.size,scope,blob}]);
      };
      next.onerror=()=>{if(active.current)setIssue('录音发生错误，已收到的片段会保留在本机。');if(next.state==='recording')next.stop()};
      recordingTimer=setTimeout(()=>{if(active.current)setIssue('录音达到 10 分钟上限，已停止并保留。');if(next.state==='recording')next.stop()},10*60*1000);
      next.onstop=()=>{clearTimeout(recordingTimer);microphone.getTracks().forEach(track=>track.stop());recorder.current=null;stream.current=null;void saveChain.current.catch(()=>{}).then(()=>{if(active.current){setRecording(false);setWorking(false)}resolveFinish();finish.current=null;});};
      setSeconds(0);setRecording(true);next.start(1000);
    }catch(error){clearTimeout(recordingTimer);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;recorder.current=null;finish.current=null;if(active.current){setRecording(false);setIssue(error instanceof DOMException&&error.name==='NotAllowedError'?'麦克风尚未获准使用，可以在浏览器中允许，或选择已有音频文件。':'无法开始录音，可以选择已有音频文件上传。')}}finally{mutating.current=false;if(active.current)setWorking(false)}
  };
  const stop=async()=>{if(recorder.current?.state==='recording')recorder.current.stop();if(finish.current)await finish.current;await saveChain.current.catch(()=>{});};
  useImperativeHandle(ref,()=>({ensureUploaded:uploadAll,finishRecording:stop}));
  return <section className={'inbox-material-capture'+(drag?' is-dragging':'')} aria-label="文档与录音" onDragOver={event=>{event.preventDefault();if(!locked)setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={event=>{event.preventDefault();setDrag(false);void addFiles([...event.dataTransfer.files])}}>
    <div className="op-row between"><strong>文档、图片与录音</strong><small>{items.length} / 5 个原件</small></div>
    <p>可拖入原件，每个最多 25 MiB。录音最长 10 分钟，仅在点击后使用麦克风。</p>
    <input ref={input} type="file" multiple accept={Object.keys(extensions).map(ext=>'.'+ext).join(',')} aria-label="选择文档或音频" disabled={locked||isWorking||recording||loading} onChange={event=>{void addFiles([...event.target.files||[]]);event.target.value=''}}/>
    <div className="op-actions"><Button kind="ghost" disabled={locked||isWorking||recording||loading} onClick={()=>input.current?.click()}>选择文档 / 音频</Button>{recording?<Button onClick={()=>void stop()}>停止录音 · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</Button>:<Button kind="ghost" disabled={locked||isWorking||loading} onClick={()=>void startRecording()}>开始录音</Button>}{!!items.some(item=>!item.asset)&&<Button kind="ghost" disabled={locked||isWorking||recording||loading} onClick={()=>void uploadAll().catch(()=>{})}>上传原件</Button>}</div>
    {recording&&<Note>正在录音，每秒尝试保留本机片段。请先停止录音，再关闭或刷新页面。</Note>}
    {loading&&<p role="status">正在恢复本机附件…</p>}{isWorking&&<p role="status">正在保存或处理材料，请稍候…</p>}
    {(safeSourceUrl(props.sourceUrl)||pendingLink)&&<div className="inbox-link-extraction"><Button kind="ghost" disabled={locked||isWorking||recording||loading} onClick={()=>void extractLink()}>{pendingLink?'确认上次网页提取':'提取链接正文'}</Button><small>点击后才访问链接；需当前连接器允许该网站，失败时仍保留链接。</small>{pendingLink&&<small>上次提取结果待确认：{pendingLink.input.url}</small>}</div>}<div className="inbox-material-list">{items.map(item=><article className="inbox-material-row" key={item.id}><strong>{item.filename}</strong><small>{item.asset?materialStatus(item.asset):'本机草稿 · 尚未上传'} · {(item.size/1024/1024).toFixed(2)} MiB</small><LocalPreview item={item}/><div className="op-actions">{item.blob&&<Button kind="ghost" onClick={()=>downloadLocalMaterial(item.blob!,item.filename)}>下载本机原件</Button>}{item.asset&&<a href={materialFileUrl(item.id)} download={item.filename} target="_blank" rel="noopener noreferrer">下载已保存原件</a>}<Button kind="ghost" disabled={locked||isWorking||recording} onClick={()=>void remove(item.id)}>移除附件</Button></div>{item.asset&&<MaterialProcessing asset={item.asset} actorId={actorId} disabled={locked||isWorking||recording} onChanged={asset=>{void retain(current.current.map(row=>row.id===asset.id?{...row,asset}:row))}} onWorking={value=>setProcessingCount(count=>Math.max(0,count+(value?1:-1)))}/>}</article>)}</div>
    {!!items.length&&<small>附件范围已固定。先移除全部附件，才能更改可见范围；移除引用不会删除已上传的原件。</small>}
    {warning&&<Note tone="warn">{warning}</Note>}{issue&&<p className="error" role="alert">{issue}</p>}
  </section>;
});
