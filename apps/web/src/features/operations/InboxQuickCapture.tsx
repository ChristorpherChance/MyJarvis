import { useEffect, useRef, useState, type FormEvent } from 'react';
import { V1Error } from '../../v1-client';
import { Button, Dialog, Note, receiptId, scopes, type Act, type Props } from './common';
import { createInboxDraft, getInboxDraft, saveInboxDraft, removeInboxDraft, clearInboxDrafts,
  INBOX_DRAFT_KEY_PREFIX, INBOX_DRAFT_MAX_TEXT, type InboxDraft } from './inbox-draft';
import './inbox-capture.css';

const kinds = [['idea','灵感想法'],['experience','问题经验'],['lesson','经验教训'],['skill','通用技能'],['book','资料书籍'],['memory','记忆候选']];
const fields = (d: InboxDraft) => ({rawText:d.rawText,title:d.title,kind:d.kind,scope:d.scope,terminalId:d.terminalId,projectId:d.projectId});
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
    window.addEventListener('storage',changed);
    return () => { alive.current = false; window.removeEventListener('storage',changed); };
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
  const close = () => { if (!submitting.current || blocked.current) onClose(); };
  const exportDraft = () => {
    const url = URL.createObjectURL(new Blob([current.current.rawText],{type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href=url; link.download='灵感草稿.txt'; link.click(); URL.revokeObjectURL(url);
  };
  const discard = () => {
    try {
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
    if (!current.current.rawText.trim()) { setError('先写下想记录的内容。'); return; }
    if (!navigator.onLine) {
      const retained=persist(current.current);
      if (retained) setError('网络暂不可用。联网后请再次点击保存，草稿不会自动发送。');
      return;
    }
    const sent = persist(current.current.status === 'pending' ? current.current : {...current.current,
      title:current.current.title.trim(),terminalId:current.current.terminalId.trim()||terminal(),status:'pending'},true);
    if (!sent) return;
    submitting.current=true; setBusy(true); setError('');
    try {
      const result = await act('op.inbox',{command:'capture',expectedVersion:0,commandId:sent.id,patch:fields(sent)});
      if (!alive.current || blocked.current) return;
      const id=receiptId(result);
      if (!id) throw new Error('尚未收到明确的保存回执。');
      try { removeInboxDraft(actorId,sent.id); }
      catch { setStorageIssue('记录已保存，但本机草稿未能清除；下次重试会核对同一条记录。'); }
      setSaved({id,title:String((result as {data?:{title?:string}})?.data?.title || sent.title || sent.rawText.trim().slice(0,80))});
    } catch (e) {
      if (!alive.current || blocked.current) return;
      if (e instanceof V1Error && e.status === 401) return;
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
  const locked=busy||draft.status==='pending';
  return <Dialog title="快速记录" onClose={close} wide>
    {invalidated ? <><Note tone="warn">草稿已在另一个窗口更新或清除。请重新打开快速记录，以免覆盖新内容。</Note><Button onClick={onClose}>关闭</Button></> : saved ?
      <div className="inbox-capture-saved"><h3>已保存到收件</h3><p>{saved.title}</p><p>原话和来源已保留，可以在其他已登录终端整理。</p>{storageIssue&&<Note tone="warn">{storageIssue}</Note>}
        <div className="op-actions"><Button onClick={()=>onSaved(saved.id)}>查看记录</Button><Button kind="ghost" onClick={()=>{const next=fresh();setSaved(null);setDraft(next);current.current=next;setError('');}}>再记一条</Button><Button kind="ghost" onClick={onClose}>关闭</Button></div></div> :
      <form className="inbox-capture-form" onSubmit={event=>void submit(event)} aria-busy={busy}>
        <p className="inbox-capture-intro">先记下原话，标题与分类可以之后再整理。</p>
        <label className="inbox-capture-text"><span>原始内容</span><textarea aria-label="原始内容" required rows={7} maxLength={INBOX_DRAFT_MAX_TEXT} disabled={locked||!actorId} value={draft.rawText} placeholder="刚想到什么？先写在这里…" onChange={e=>update({rawText:e.target.value})}/></label>
        <div className="inbox-capture-status" role="status">{draft.status==='pending'?'上次保存结果待确认 · 原内容已锁定':draft.revision>0?'草稿已保存在此浏览器':'尚未保存'}<small>仅此浏览器保留草稿，不会自动上传。来源：{draft.terminalId}</small></div>
        <details className="inbox-capture-options"><summary>更多整理选项</summary><fieldset disabled={locked} className="op-form">
          <label><span>标题（可选）</span><input aria-label="标题（可选）" maxLength={300} value={draft.title} onChange={e=>update({title:e.target.value})} placeholder="留空时根据原话生成"/></label>
          <label><span>记录分类</span><select aria-label="记录分类" value={draft.kind} onChange={e=>update({kind:e.target.value})}>{kinds.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>可见范围</span><select aria-label="可见范围" value={draft.scope} onChange={e=>update({scope:e.target.value as InboxDraft['scope'],projectId:''})}>{scopes.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>来源终端</span><input aria-label="来源终端" maxLength={200} value={draft.terminalId} onChange={e=>update({terminalId:e.target.value})}/></label>
          <label className="op-full"><span>关联项目</span><select aria-label="关联项目" value={draft.projectId} onChange={e=>update({projectId:e.target.value})}><option value="">暂不关联</option>{data.projects.filter(p=>p.scope===draft.scope).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        </fieldset></details>
        {draft.scope==='family'&&<Note tone="warn">保存后，这条记录将与家庭成员共享。</Note>}
        {storageIssue&&<Note tone="warn">{storageIssue}</Note>}
        {error&&<p className="error" role="alert">{error}</p>}
        {clearing&&<Note tone="warn">这只清除此浏览器的草稿；已经送达服务器的记录不会撤回。{storageIssue?'其他账号在此浏览器的草稿也会清理。':''}<div className="op-actions"><Button kind="danger" onClick={discard}>确认清除本机草稿</Button><Button kind="ghost" onClick={()=>setClearing(false)}>保留</Button></div></Note>}
        <div className="op-form-footer inbox-capture-footer"><div className="op-actions">{(draft.rawText||storageIssue)&&<Button kind="ghost" disabled={busy} onClick={()=>setClearing(true)}>清除草稿</Button>}{(storageIssue||draft.status==='pending')&&<Button kind="ghost" disabled={busy} onClick={exportDraft}>导出草稿</Button>}</div><div className="op-actions"><Button kind="ghost" disabled={busy} onClick={close}>稍后整理</Button><Button type="submit" disabled={busy||!actorId||!draft.rawText.trim()}>{busy?'正在确认…':draft.status==='pending'?'重试确认':'保存记录'}</Button></div></div>
      </form>}
  </Dialog>;
}
