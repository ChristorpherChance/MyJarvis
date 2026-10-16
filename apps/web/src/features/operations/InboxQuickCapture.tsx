import { useEffect, useRef, useState, type FormEvent } from 'react';
import { V1Error } from '../../v1-client';
import { Button, Dialog, Note, receiptId, scopes, type Act, type Props } from './common';
import { createInboxDraft, getInboxDraft, saveInboxDraft, removeInboxDraft, clearInboxDrafts,
  INBOX_DRAFT_KEY_PREFIX, INBOX_DRAFT_MAX_TEXT, type InboxDraft } from './inbox-draft';
import './inbox-capture.css';
import { CaptureMaterials, type CaptureMaterialsHandle, type MaterialCaptureState } from './CaptureMaterials';
import { safeSourceUrl } from './inbox-material-client';
import { removeInboxMaterialDraft,materialSessionGeneration } from './inbox-material-store';
import {OfflineDraftImport} from '../offline/OfflineDraftImport';
import {importOfflineInboxDraft} from '../offline/offline-import';
import type {OfflineVaultDraft} from '../offline/offline-vault';
import { getMaterialIntent, removeMaterialIntent } from './inbox-material-intents';

const kinds = [['idea','灵感想法'],['experience','问题经验'],['lesson','经验教训'],['skill','通用技能'],['book','资料书籍'],['memory','记忆候选']];
const fields = (d: InboxDraft) => ({rawText:d.rawText,title:d.title,kind:d.kind,scope:d.scope,terminalId:d.terminalId,projectId:d.projectId,...(d.sourceUrl?{sourceUrl:d.sourceUrl}:{}),...(d.attachmentIds?.length?{attachmentIds:d.attachmentIds}:{})});
const terminal = () => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? '手机网页' : '电脑网页';

export function InboxQuickCapture({ data, act, onClose, onSaved }: Pick<Props,'data'> & {
  act: Act; onClose: () => void; onSaved: (id: string) => void;
}) {
  const actorId = String(data.runtime?.capabilities?.identity?.actorId || '');
  const fresh = () => createInboxDraft({rawText:'',title:'',kind:'idea',scope:'private',terminalId:terminal(),projectId:''});
  const [initial] = useState(() => {
    try { return {draft: actorId ? getInboxDraft(actorId) || fresh() : fresh(), issue: actorId ? '' : '身份尚未加载，请关闭后刷新。'}; }
    catch { return {draft:fresh(),issue:'此浏览器的草稿暂时无法恢复。输入仅在当前窗口保留，可先导出草稿。'}; }
  });
  const [draft,setDraft] = useState(initial.draft);
  const [storageIssue,setStorageIssue] = useState(initial.issue);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [invalidated,setInvalidated] = useState(false);
  const [clearing,setClearing] = useState(false);
  const [saved,setSaved] = useState<{id:string;title:string}|null>(null);
  const materials=useRef<CaptureMaterialsHandle>(null);
  const [materialState,setMaterialState]=useState<MaterialCaptureState>({count:0,working:false,recording:false,loading:true});
  const current = useRef(draft); current.current = draft;
  const alive = useRef(true), blocked = useRef(false), submitting = useRef(false);
  useEffect(() => {
    alive.current = true;
    const changed = (event: StorageEvent) => {
      if (event.key !== null && !event.key.startsWith(INBOX_DRAFT_KEY_PREFIX)) return;
      try {
        const latest = getInboxDraft(actorId), here = current.current;
        if (latest && JSON.stringify(latest) === JSON.stringify(here)) return;
        if (!latest && here.revision === 0) return;
      } catch { /* An unreadable replacement must not leave a stale editable draft. */ }
      blocked.current = true;
      setDraft(fresh());
      setInvalidated(true);
    };
    const sessionChanged=()=>{blocked.current=true;setDraft(fresh());setInvalidated(true);};
    window.addEventListener('storage',changed);
    window.addEventListener('jarvis:inbox-materials-invalidated',sessionChanged);
    return () => { alive.current = false; window.removeEventListener('storage',changed);window.removeEventListener('jarvis:inbox-materials-invalidated',sessionChanged); };
  }, [actorId]);
  const persist = (value: InboxDraft, requireDurable = false): InboxDraft|null => {
    if (!alive.current || blocked.current || !actorId) return null;
    if (!requireDurable) { setDraft(value); current.current = value; }
    try {
      const stored = saveInboxDraft(actorId,value);
      setDraft(stored); current.current = stored; setStorageIssue('');
      return stored;
    } catch (e) {
      if ((e as {code?:string}).code === 'CONFLICT') {
        blocked.current = true; setDraft(fresh()); setInvalidated(true); return null;
      }
      setStorageIssue(requireDurable ? '本机草稿未能可靠保存，这次没有发送。请先导出原话，恢复浏览器存储后再试。'
        : '此浏览器未能保留草稿，请保持页面打开或先导出；关闭后可能丢失。');
      return requireDurable ? null : value;
    }
  };
  const update = (patch: Partial<InboxDraft>) => {
    if (submitting.current || current.current.status === 'pending' || blocked.current) return;
    persist({...current.current,...patch}); setError(''); setClearing(false);
  };
  const close = async () => { if ((!submitting.current&&!materialState.working) || blocked.current) {await materials.current?.finishRecording();onClose();} };
  const exportDraft = () => {
    const value=current.current;
    const url = URL.createObjectURL(new Blob([value.rawText+(value.sourceUrl?'\n\n来源链接：'+value.sourceUrl:'')+(value.attachmentIds?.length?'\n\n已上传原件编号：\n'+value.attachmentIds.join('\n'):'')],{type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href=url; link.download='灵感草稿.txt'; link.click(); URL.revokeObjectURL(url);
  };
  const discard = async () => {
    try {
      await materials.current?.finishRecording();
      await removeInboxMaterialDraft(actorId,current.current.id);
      for(const name of ['link:'+current.current.id,...(current.current.attachmentIds||[]).map(id=>'asset:'+id)]){const intent=getMaterialIntent(actorId,name);if(intent)removeMaterialIntent(actorId,name,intent)}
      if (storageIssue) clearInboxDrafts();
      else if (current.current.revision > 0 && !removeInboxDraft(actorId,current.current.id)) {
        blocked.current=true; setDraft(fresh()); setInvalidated(true); return;
      }
      const next=fresh(); setDraft(next); current.current=next; setClearing(false); setError(''); setStorageIssue('');
    } catch { setStorageIssue('浏览器未能清除本机草稿，请在浏览器设置中清除本站数据。'); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || blocked.current || !actorId) return;
    if(materialState.recording||materialState.working||materialState.loading||materialState.pendingLink){setError('请先停止录音，确认网页提取并等待材料保存完成。');return;}
    if(current.current.sourceUrl?.trim()&&!safeSourceUrl(current.current.sourceUrl)){setError('请填写完整的 http 或 https 链接，链接中不能包含账号或密码。');return;}
    if (!current.current.rawText.trim()&&!safeSourceUrl(current.current.sourceUrl)&&!materialState.count&&!current.current.attachmentIds?.length) { setError('写下内容、贴入链接，或添加文档和录音后保存。'); return; }
    if (!navigator.onLine) {
      const retained=persist(current.current);
      if (retained) setError('网络暂不可用。联网后请再次点击保存，草稿不会自动发送。');
      return;
    }
    submitting.current=true; setBusy(true); setError('');
    let sent:InboxDraft|null=null;
    try {
      const ids=current.current.status==='pending'?current.current.attachmentIds||[]:await materials.current?.ensureUploaded()||[];
      if(!alive.current||blocked.current)return;
      sent = persist(current.current.status === 'pending' ? current.current : {...current.current,attachmentIds:ids,
        sourceUrl:safeSourceUrl(current.current.sourceUrl)||'',rawText:current.current.rawText.trim()?current.current.rawText:'',
        title:current.current.title.trim(),terminalId:current.current.terminalId.trim()||terminal(),status:'pending'},true);
      if(!sent)return;
      const result = await act('op.inbox',{command:'capture',expectedVersion:0,commandId:sent.id,patch:fields(sent)});
      if (!alive.current || blocked.current) return;
      const id=receiptId(result);
      if (!id) throw new Error('尚未收到明确的保存回执。');
      try { removeInboxDraft(actorId,sent.id); }
      catch { setStorageIssue('记录已保存，但本机草稿未能清除；下次重试会核对同一条记录。'); }
      try{await removeInboxMaterialDraft(actorId,sent.id)}catch{setStorageIssue('记录已保存，但本机附件草稿未能清理；退出后请核对浏览器清理提示。')}
      setSaved({id,title:String((result as {data?:{title?:string}})?.data?.title || sent.title || sent.rawText.trim().slice(0,80)||sent.sourceUrl||'原件记录')});
    } catch (e) {
      if (!alive.current || blocked.current) return;
      if (e instanceof V1Error && e.status === 401) return;
      if(!sent){setError(e instanceof Error?e.message:'原件上传未完成，草稿仍保留在这里。');return;}
      if (e instanceof V1Error && [400,403,404,422].includes(e.status)) {
        try {
          if (removeInboxDraft(actorId,sent.id) || sent.revision===0) persist(createInboxDraft(fields(sent)));
          else { blocked.current=true; setDraft(fresh()); setInvalidated(true); }
        } catch { setStorageIssue('请先导出草稿；浏览器暂时无法恢复编辑状态。'); }
        setError(e.message);
      } else {
        setError('保存结果待确认，原内容已保留。点击“重试确认”核对同一条记录，请先不要另记一份。');
      }
    } finally { submitting.current=false; if (alive.current) setBusy(false); }
  };
  const importOffline=async(value:OfflineVaultDraft,ready:()=>boolean)=>{
    const original=current.current.id,epoch=materialSessionGeneration();
    const stillCurrent=()=>ready()&&alive.current&&!blocked.current&&current.current.id===original&&materialSessionGeneration()===epoch;
    if(submitting.current||!stillCurrent()||current.current.revision!==0||current.current.rawText||current.current.title||current.current.sourceUrl||materialState.count||materialState.loading||materialState.working||materialState.recording)throw new Error('请先保存或清除当前草稿，再导入。');
    submitting.current=true;setBusy(true);setError('');
    try{const imported=await importOfflineInboxDraft(actorId,value,stillCurrent);if(!stillCurrent())return;current.current=imported;setDraft(imported);setStorageIssue('');setClearing(false);}
    finally{submitting.current=false;if(alive.current&&materialSessionGeneration()===epoch)setBusy(false);}
  };
  const locked=busy||draft.status==='pending';
  const materialTouch=(ids?:string[])=>!!persist({...current.current,materialRevision:(current.current.materialRevision||0)+1,...(ids?{attachmentIds:ids}:{})},true);
  const hasContent=!!draft.rawText.trim()||!!safeSourceUrl(draft.sourceUrl)||materialState.count>0||!!draft.attachmentIds?.length;
  return <Dialog title="快速记录" onClose={()=>void close()} wide>
    {invalidated ? <><Note tone="warn">草稿已在另一个窗口更新或清除。请重新打开快速记录，以免覆盖新内容。</Note><Button onClick={onClose}>关闭</Button></> : saved ?
      <div className="inbox-capture-saved"><h3>已保存到收件</h3><p>{saved.title}</p><p>原话和来源已保留，可以在其他已登录终端整理。</p>{storageIssue&&<Note tone="warn">{storageIssue}</Note>}
        <div className="op-actions"><Button onClick={()=>onSaved(saved.id)}>查看记录</Button><Button kind="ghost" onClick={()=>{const next=fresh();setSaved(null);setDraft(next);current.current=next;setError('');}}>再记一条</Button><Button kind="ghost" onClick={onClose}>关闭</Button></div></div> :
      <form className="inbox-capture-form" onSubmit={event=>void submit(event)} aria-busy={busy}>
        <p className="inbox-capture-intro">写几句、贴链接、丢文档或录一段。标题与分类可以之后再整理。</p>
        <OfflineDraftImport enabled={!!actorId&&draft.revision===0&&!hasContent&&!draft.title&&!materialState.loading&&!materialState.working&&!materialState.recording&&!materialState.pendingLink} onImport={importOffline}/>
        <label className="inbox-capture-text"><span>原始内容（可选）</span><textarea aria-label="原始内容" rows={5} maxLength={INBOX_DRAFT_MAX_TEXT} disabled={locked||!actorId} value={draft.rawText} placeholder="刚想到什么？也可以只保存下面的链接或原件…" onChange={e=>update({rawText:e.target.value})}/></label>
        <label className="inbox-capture-link"><span>来源链接（可选）</span><input aria-label="来源链接" type="url" maxLength={2048} disabled={locked||!actorId||materialState.working||materialState.pendingLink} value={draft.sourceUrl||''} placeholder="https://…" onChange={e=>update({sourceUrl:e.target.value})}/><small>仅保存 http / https 链接；点击下方“提取链接正文”才访问网页。</small></label>
        <CaptureMaterials key={draft.id} ref={materials} actorId={actorId} draftId={draft.id} scope={draft.scope} sourceUrl={draft.sourceUrl} attachmentIds={draft.attachmentIds||[]} locked={locked||!actorId} onTouch={materialTouch} onState={setMaterialState}/>
        <div className="inbox-capture-status" role="status">{draft.status==='pending'?'上次保存结果待确认 · 原内容已锁定':draft.revision>0?'文字与链接草稿已保存在此浏览器':'尚未保存'}<small>附件本机保存和上传状态见上方。来源：{draft.terminalId}</small></div>
        <details className="inbox-capture-options"><summary>更多整理选项</summary><fieldset disabled={locked} className="op-form">
          <label><span>标题（可选）</span><input aria-label="标题（可选）" maxLength={300} value={draft.title} onChange={e=>update({title:e.target.value})} placeholder="留空时根据原话生成"/></label>
          <label><span>记录分类</span><select aria-label="记录分类" value={draft.kind} onChange={e=>update({kind:e.target.value})}>{kinds.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>可见范围</span><select aria-label="可见范围" disabled={materialState.loading||materialState.working||materialState.recording||materialState.pendingLink||materialState.count>0||!!draft.attachmentIds?.length} value={draft.scope} onChange={e=>update({scope:e.target.value as InboxDraft['scope'],projectId:''})}>{scopes.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>来源终端</span><input aria-label="来源终端" maxLength={200} value={draft.terminalId} onChange={e=>update({terminalId:e.target.value})}/></label>
          <label className="op-full"><span>关联项目</span><select aria-label="关联项目" value={draft.projectId} onChange={e=>update({projectId:e.target.value})}><option value="">暂不关联</option>{data.projects.filter(p=>p.scope===draft.scope).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        </fieldset></details>
        {draft.scope==='family'&&<Note tone="warn">保存后，这条记录将与家庭成员共享。</Note>}
        {storageIssue&&<Note tone="warn">{storageIssue}</Note>}
        {error&&<p className="error" role="alert">{error}</p>}
        {clearing&&<Note tone="warn">这会清除此浏览器的文字、链接和附件草稿；已经送达服务器的记录及原件不会撤回。{storageIssue?'其他账号在此浏览器的文字草稿也会清理。':''}<div className="op-actions"><Button kind="danger" onClick={()=>void discard()}>确认清除本机草稿</Button><Button kind="ghost" onClick={()=>setClearing(false)}>保留</Button></div></Note>}
        <div className="op-form-footer inbox-capture-footer"><div className="op-actions">{(hasContent||storageIssue)&&<Button kind="ghost" disabled={busy||materialState.working||materialState.recording} onClick={()=>setClearing(true)}>清除草稿</Button>}{(storageIssue||draft.status==='pending')&&<Button kind="ghost" disabled={busy} onClick={exportDraft}>导出文字 / 链接</Button>}</div><div className="op-actions"><Button kind="ghost" disabled={busy||materialState.working} onClick={()=>void close()}>稍后整理</Button><Button type="submit" disabled={busy||!actorId||!hasContent||materialState.working||materialState.recording||materialState.loading||materialState.pendingLink}>{busy?'正在确认…':draft.status==='pending'?'重试确认':'保存记录'}</Button></div></div>
      </form>}
  </Dialog>;
}
