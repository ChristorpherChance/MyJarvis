import { useEffect, useRef, useState } from 'react';
import { V1Error } from '../../v1-client';
import { Button, Note } from './common';
import { materialFileUrl, processInboxMaterial, readInboxMaterial, reviewInboxMaterialText, type InboxMaterial, type MaterialExtraction, type MaterialLanguage } from './inbox-material-client';
import { getMaterialIntent, removeMaterialIntent, saveMaterialIntent, type MaterialIntent } from './inbox-material-intents';
import { materialSessionGeneration } from './inbox-material-store';

const languages:[MaterialLanguage,string][]=[['auto','自动识别'],['zh','中文'],['en','英语'],['ja','日语'],['fr','法语'],['de','德语'],['es','西班牙语']];
const clockTime=(value:number)=>{const seconds=Math.max(0,Math.floor(value));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')};
function sourceLabel(segment:MaterialExtraction['segments'][number],index:number):string {
  if(typeof segment.start==='number')return '录音 '+clockTime(segment.start)+(typeof segment.end==='number'?'–'+clockTime(segment.end):'');
  const labels=[typeof segment.page==='number'?'第'+segment.page+'页':'',typeof segment.paragraph==='number'?'第'+segment.paragraph+'段':''].filter(Boolean);
  return labels.join(' · ')||'第'+(index+1)+'处';
}
export function MaterialProcessing({asset:initial,actorId,disabled=false,onChanged,onWorking}:{asset:InboxMaterial;actorId:string;disabled?:boolean;onChanged?:(asset:InboxMaterial)=>void;onWorking?:(working:boolean)=>void}) {
  const [asset,setAsset]=useState(initial),[busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false),[issue,setIssue]=useState(''),[notice,setNotice]=useState(''),[cloud,setCloud]=useState(false),[language,setLanguage]=useState<MaterialLanguage>('auto'),[editing,setEditing]=useState<{text:string;version:number}|null>(null);
  const name='asset:'+initial.id;
  const [pending,setPending]=useState<MaterialIntent|null>(()=>{try{return actorId?getMaterialIntent(actorId,name):null}catch{return null}});
  const alive=useRef(true),submitting=useRef(false),session=useRef(materialSessionGeneration()),callbacks=useRef({onChanged,onWorking});callbacks.current={onChanged,onWorking};
  const current=()=>alive.current&&session.current===materialSessionGeneration();
  const unauthorized=(error:unknown)=>{if(current()&&error instanceof V1Error&&error.status===401)window.dispatchEvent(new Event('jarvis:auth-required'))};
  const accept=(next:InboxMaterial,intent?:MaterialIntent)=>{
    if(!current())return;
    setAsset(next);
    const candidate=intent||pending;
    const processSettled=candidate?.kind==='process'&&next.processing?.commandId===candidate.input.commandId&&['complete','failed','interrupted'].includes(next.processing.status);
    const reviewSettled=candidate?.kind==='review'&&next.textReview?.text===candidate.input.text&&(next.revision||0)>candidate.input.expectedVersion;
    if(candidate&&(processSettled||reviewSettled)){removeMaterialIntent(actorId,name,candidate);setPending(null);if(reviewSettled)setEditing(null)}
    callbacks.current.onChanged?.(next);
  };
  useEffect(()=>{
    alive.current=true;
    let restored:MaterialIntent|null=null;
    try{restored=actorId?getMaterialIntent(actorId,name):null;setPending(restored)}catch(error){setIssue(error instanceof Error?error.message:'处理编号暂时无法恢复。')}
    void readInboxMaterial(initial.id).then(next=>{if(current())accept(next,restored||undefined)}).catch(error=>{unauthorized(error);if(current())setIssue(error instanceof Error?error.message:'文字状态暂时无法读取，请稍后刷新。')});
    const invalidate=()=>{alive.current=false};window.addEventListener('jarvis:inbox-materials-invalidated',invalidate);
    return()=>{alive.current=false;window.removeEventListener('jarvis:inbox-materials-invalidated',invalidate)};
  },[initial.id,actorId]);
  const refresh=async()=>{if(submitting.current||refreshing||!current())return;setRefreshing(true);setIssue('');try{accept(await readInboxMaterial(asset.id))}catch(error){unauthorized(error);if(current())setIssue(error instanceof TypeError?'文字状态暂时无法读取，请恢复网络后再刷新。':error instanceof Error?error.message:'状态刷新未完成。')}finally{if(current())setRefreshing(false)}};
  const run=async(intent:MaterialIntent)=>{
    if(disabled||submitting.current||!actorId||!current()||intent.kind==='link')return;
    submitting.current=true;setBusy(true);setIssue('');setNotice('');callbacks.current.onWorking?.(true);
    try{
      saveMaterialIntent(actorId,name,intent);setPending(intent);
      const result=intent.kind==='process'?await processInboxMaterial(asset.id,intent.input):await reviewInboxMaterialText(asset.id,intent.input);
      if(!current())return;
      accept(result,intent);
      if(intent.kind==='review'&&result.textReview)setNotice('校正文字已保存，原识别结果和原件仍保留。');
      else if(result.processing?.status==='complete')setNotice('处理结果已保存，请对照原件核对文字。');
    }catch(error){
      unauthorized(error);if(!current())return;
      setIssue(error instanceof TypeError?'处理结果尚未确认，原件仍保留。请确认同一次处理，暂时不要另发一轮。':error instanceof Error?error.message:'处理结果待确认，请确认同一次处理。');
      if(error instanceof V1Error&&([400,403,404,409,422,503].includes(error.status))){
        try{const latest=await readInboxMaterial(asset.id);if(!current())return;accept(latest,intent);if(intent.kind==='process'&&latest.processing?.commandId!==intent.input.commandId||intent.kind==='review'){removeMaterialIntent(actorId,name,intent);setPending(null)}if(error.status===409&&intent.kind==='review')setIssue('材料版本已经变化。请保留校正输入，对照新版本后重新开始校正。')}catch(readError){unauthorized(readError);/* Unknown outcomes retain the immutable command for explicit confirmation. */}
      }
    }finally{submitting.current=false;if(current()){setBusy(false);callbacks.current.onWorking?.(false)}}
  };
  const start=()=>{
    if(pending){void run(pending);return}
    if(asset.processing?.status==='running'){const previous=asset.processing;void run({kind:'process',assetId:asset.id,input:{commandId:previous.commandId,expectedVersion:previous.expectedVersion,operation:previous.operation,cloudConsent:previous.cloudConsent,...(previous.language?{language:previous.language}:{})}});return}
    if(!Number.isSafeInteger(asset.revision)||!asset.revision){setIssue('材料版本尚未确认，请先刷新文字状态。');return}
    void run({kind:'process',assetId:asset.id,input:{commandId:crypto.randomUUID(),expectedVersion:asset.revision,operation:asset.mediaKind==='audio'?'transcribe':'extract',cloudConsent:cloud,language}});
  };
  const saveReview=()=>{if(!editing?.text.trim()){setIssue('请保留实际文字；空白内容没有保存。');return}void run({kind:'review',assetId:asset.id,input:{commandId:crypto.randomUUID(),expectedVersion:editing.version,text:editing.text}})};
  const processing=asset.processing,extraction=asset.extraction,text=asset.textReview?.text??extraction?.text??asset.extractedText??'';
  const retryable=!processing||!['failed','interrupted'].includes(processing.status)||processing.retryable;
  const isPending=!!pending||processing?.status==='running';
  return <div className="inbox-material-processing" aria-label={'文字处理 '+asset.filename}>
    <div className="op-actions"><Button kind="ghost" disabled={busy||refreshing} onClick={()=>void refresh()}>{refreshing?'正在读取状态…':'刷新文字状态'}</Button>{actorId&&<Button kind="ghost" disabled={disabled||busy||refreshing||!!editing&&!pending||!retryable} onClick={start}>{busy?'正在处理…':pending?.kind==='review'?'确认校正保存':pending?'确认上次处理':processing?.status==='running'?'确认处理中状态':asset.mediaKind==='audio'?(extraction?'重新转写':'转成文字'):(extraction?'重新提取文字':'提取文字')}</Button>}</div>
    {actorId&&!isPending&&<details className="inbox-material-process-options"><summary>处理选项</summary><label>识别语言<select aria-label={'识别语言 '+asset.filename} disabled={disabled||busy} value={language} onChange={event=>setLanguage(event.target.value as MaterialLanguage)}>{languages.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label className="inbox-material-consent"><input type="checkbox" checked={cloud} disabled={disabled||busy} onChange={event=>setCloud(event.target.checked)}/>本次允许已配置的云端服务处理这份原件</label><small>默认不授予本次云端许可；实际处理仍受当前隐私偏好和引擎配置约束。费用只记录，不设消费上限，无法取得的金额单列未知。</small></details>}
    {processing?.status==='running'&&<Note>服务端仍在处理。可刷新状态或确认同一次处理，不会自动另发一轮。</Note>}
    {processing&&['failed','interrupted'].includes(processing.status)&&<Note tone="warn">{processing.error?.message||'这次文字处理未完成，原件仍保留。'}{processing.retryable?' 可再次明确点击处理。':' 请先核对引擎配置或原件内容。'}</Note>}
    {pending&&<small>上次请求结果待确认，已保留同一编号与处理选项。</small>}
    {text&&<details className="inbox-material-result" open><summary>{asset.textReview?'已保存的校正文字':'材料文字 · 待核对'}</summary><p className="inbox-material-candidate">这里只保留材料文字候选，不会自动加入长期记忆或发布知识。</p>{editing?<><textarea aria-label={'校正文字 '+asset.filename} value={editing.text} maxLength={120000} rows={8} disabled={busy||!!pending} onChange={event=>setEditing({...editing,text:event.target.value})}/><div className="op-actions"><Button disabled={disabled||busy||!!pending||!editing.text.trim()} onClick={saveReview}>保存校正文字</Button><Button kind="ghost" disabled={busy||!!pending} onClick={()=>setEditing(null)}>取消校正</Button></div></>:<><pre className="op-code">{text}</pre>{actorId&&extraction&&<Button kind="ghost" disabled={disabled||busy||!!pending} onClick={()=>setEditing({text,version:asset.revision||0})}>校正文字</Button>}</>}{asset.textTruncated&&<small>文字超过保存范围，当前显示部分内容，完整内容见原件。</small>}{asset.textReview&&<small>校正保存于 {asset.textReview.reviewedAt}</small>}{extraction&&<><details><summary>处理与原件信息</summary><small>识别引擎：{extraction.engine}</small><small>原件 SHA-256：{extraction.sourceSha256}</small>{asset.textReview&&<small>校正来源文字指纹：{asset.textReview.sourceTextSha256}</small>}</details>{!!extraction.warnings?.length&&<Note tone="warn">{extraction.warnings.join('；')}</Note>}{!!extraction.segments?.length&&<details><summary>对照来源定位 · {extraction.segments.length} 段</summary>{extraction.segments.map((segment,index)=><article className="op-evidence" key={index}><strong>{sourceLabel(segment,index)}</strong><details><summary>来源详情</summary><small>{segment.location}</small><small>段落文字 SHA-256：{segment.sha256}</small>{typeof segment.start==='number'&&<small>原始时间定位：{segment.start}{typeof segment.end==='number'?'–'+segment.end:''} 秒</small>}</details>{typeof segment.start==='number'&&<a href={`${materialFileUrl(asset.id)}#t=${segment.start}${typeof segment.end==='number'?','+segment.end:''}`} target="_blank" rel="noopener noreferrer">回听此段</a>}<pre className="op-code">{segment.text}</pre></article>)}</details>}{asset.textReview&&<details><summary>保留的原识别文字</summary><pre className="op-code">{extraction.text}</pre></details>}</>}</details>}
    {notice&&<p role="status">{notice}</p>}{issue&&<p className="error" role="alert">{issue}</p>}
  </div>;
}
