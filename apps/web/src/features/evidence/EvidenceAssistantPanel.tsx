import {useEffect, useRef, useState, type FormEvent} from 'react';
import {V1Error} from '../../v1-client';
import {subscribeMemberSession} from '../family/member-session';
import {askEvidence, evidenceStatus, resolveEvidence, type EvidenceDomain, type EvidenceHit, type EvidenceResolved, type EvidenceResult, type EvidenceStatus} from './evidence-client';
import './evidence-assistant.css';

export function EvidenceAssistantPanel({domain, profileId, onAuthenticationRequired}: {domain: EvidenceDomain; profileId?: string; onAuthenticationRequired?: () => void}) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState<EvidenceStatus | null>(null), [result, setResult] = useState<EvidenceResult | null>(null), [enabled, setEnabled] = useState(false), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [issue, setIssue] = useState(''), [blocked, setBlocked] = useState(false), [reader, setReader] = useState<{hit: EvidenceHit; value?: EvidenceResolved; error?: string} | null>(null);
  const alive = useRef(true), serial = useRef(0), blockedNow = useRef(false), abort = useRef<AbortController | null>(null), dialog = useRef<HTMLDialogElement>(null);
  const label = domain === 'memory' ? '本人记忆' : '知识';
  const clear = () => {serial.current++; abort.current?.abort(); abort.current = null; setResult(null); setReader(null); setBusy(false); setIssue('');};
  useEffect(() => {
    alive.current = true; const turn = ++serial.current, controller = new AbortController(); abort.current = controller;
    const current = () => alive.current && !blockedNow.current && serial.current === turn;
    evidenceStatus(domain, {signal: controller.signal, current, profileId}).then(value => {if (current()) setStatus(value);}).catch(error => {if (current() && !controller.signal.aborted) setIssue(error instanceof Error ? error.message : '无法读取模型状态。');});
    const invalidated = () => {blockedNow.current = true; setBlocked(true); clear(); setQuery(''); setEnabled(false); setConsent(false); setStatus(null);};
    const unsubscribe = subscribeMemberSession(invalidated);
    const changed = (event: StorageEvent) => {if (event.key === null || event.key === 'jarvis-inbox-material-session-v1' || event.key === 'jarvis-member-session-epoch-v1') invalidated();};
    window.addEventListener('storage', changed); window.addEventListener('jarvis:inbox-materials-invalidated', invalidated); window.addEventListener('jarvis:member-session-changed', invalidated);
    return () => {alive.current = false; serial.current++; controller.abort(); abort.current?.abort(); unsubscribe(); window.removeEventListener('storage', changed); window.removeEventListener('jarvis:inbox-materials-invalidated', invalidated); window.removeEventListener('jarvis:member-session-changed', invalidated);};
  }, [domain, profileId]);
  useEffect(() => {if (reader && !dialog.current?.open) dialog.current?.showModal(); if (!reader && dialog.current?.open) dialog.current.close();}, [reader]);
  const failure = (error: unknown) => {if (error instanceof V1Error && (error.status === 401 || error.code === 'IDENTITY_CHANGED')) onAuthenticationRequired?.(); return error instanceof Error ? error.message : '查询未完成，请重试。';};
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!enabled || !status?.configured || busy || blockedNow.current || !query.trim()) return;
    clear(); const turn = ++serial.current, controller = new AbortController(); abort.current = controller; setBusy(true);
    const current = () => alive.current && !blockedNow.current && serial.current === turn;
    try {const value = await askEvidence(domain, query.trim(), consent, {signal: controller.signal, current, profileId, actorId: status.actorId}); if (current()) setResult(value);} catch (error) {if (current() && !controller.signal.aborted) setIssue(failure(error));} finally {if (current()) {setBusy(false); abort.current = null;}}
  }
  async function open(hit: EvidenceHit) {
    if (!result || blockedNow.current || busy) return;
    abort.current?.abort(); const turn = ++serial.current, controller = new AbortController(); abort.current = controller; setReader({hit});
    const current = () => alive.current && !blockedNow.current && serial.current === turn;
    try {const value = await resolveEvidence(result.queryId, hit.refId, {signal: controller.signal, current, profileId, actorId: result.actorId}); if (current()) setReader({hit, value});} catch (error) {if (current() && !controller.signal.aborted) setReader({hit, error: failure(error)});} finally {if (current()) abort.current = null;}
  }
  const close = () => {serial.current++; abort.current?.abort(); abort.current = null; setReader(null);};
  if (blocked) return <section className="evidence-assistant" aria-label={`${label}模型问答`}><h3>{label}模型问答</h3><p>登录已变化，已清除问题、回答与出处。请重新打开后验证当前身份。</p></section>;
  return <section className="evidence-assistant" aria-label={`${label}模型问答`}><h3>{label}模型问答</h3><p>模型扩展问题中的含义，再从当前授权{domain === 'memory' ? '本人已确认记忆' : '已保存原文'}检索、回答并核对引用。模型解读需要你打开出处复核。</p>
    <p>{status ? status.configured ? `当前模型：${status.provider} / ${status.model}（${status.local ? '本地' : '云端'}）` : '当前模型尚未配置，原有逐字查询仍可使用。' : '正在读取模型状态…'}</p>
    <form onSubmit={event => void submit(event)}><label>{label}语义问题<input aria-label={`${label}语义问题`} maxLength={1000} value={query} disabled={busy || !status} onChange={event => {setQuery(event.target.value); clear();}} placeholder={domain === 'memory' ? '换一种说法，查询我已确认的习惯或事实' : '用自己的话问已保存资料中的问题'} /></label>
      <label className="evidence-check"><input type="checkbox" checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} />本次启用模型查询；最多3次模型请求，按真实用量记账，未知价格保留未知。</label>
      {status?.configured && !status.local && <label className="evidence-check"><input type="checkbox" checked={consent} disabled={busy || status.privacy === 'local'} onChange={event => setConsent(event.target.checked)} />同意本次将问题和当前授权摘录发送给云端模型。{status.privacy === 'local' && '本人设置目前只允许本地模型。'}</label>}
      <div className="evidence-actions"><button type="submit" disabled={busy || !enabled || !status?.configured || !query.trim() || !status.local && status.privacy !== 'allowed' && !consent}>{busy ? '模型正在核对证据…' : `用模型查询${label}`}</button><button type="button" onClick={() => {clear(); setQuery('');}}>清除模型查询</button></div></form>
    {issue && <p role="alert">{issue}</p>}{busy && <p role="status">正在扩展查询、查找授权摘录并核对结论。取消或换身份后不会显示迟到结果。</p>}
    {result && <div className="evidence-result" aria-label={`${label}模型回答`}><p role="status">{result.status === 'answered' ? '已生成有出处的模型回答' : '证据不足，未生成事实结论'}</p>{result.claims.map((claim, index) => <article key={index}><p>{claim.text}</p><div className="evidence-actions">{claim.citations.map(citation => {const hit = result.records.find(record => record.refId === citation.refId)!; return <button type="button" key={citation.refId} onClick={() => void open(hit)}>核对出处：{hit.title}{hit.page !== undefined ? ` · 第${hit.page}页` : ''}</button>;})}</div></article>)}<p>{result.notice}</p><small>本次模型请求 {result.model.calls} 次。问题及提示未写入聊天或检索历史；引用五分钟内有效。{result.model.priceNotice}</small></div>}
    {reader && <dialog ref={dialog} className="evidence-reader" aria-label="模型问答出处" onCancel={event => {event.preventDefault(); close();}}><header><h3>模型问答出处</h3><button type="button" onClick={close} aria-label="关闭模型问答出处">关闭</button></header>{reader.error ? <p role="alert">{reader.error}</p> : !reader.value ? <p role="status">正在重新核对授权、版本和正文…</p> : <><h4>{reader.value.title}</h4><p>{reader.value.sourceName}{reader.value.page !== undefined ? ` · 第${reader.value.page}页` : ''}</p>{reader.value.quoteKind === 'external-source-unreviewed' && <p>已保存来源正文，尚未人工审核。</p>}<p className="evidence-context">{reader.value.hasEarlierText && '…'}{reader.value.text.slice(0, reader.value.quoteStart)}<mark>{reader.value.quote}</mark>{reader.value.text.slice(reader.value.quoteStart + reader.value.quote.length)}{reader.value.hasLaterText && '…'}</p><p>{reader.value.notice}</p></>}</dialog>}
  </section>;
}
