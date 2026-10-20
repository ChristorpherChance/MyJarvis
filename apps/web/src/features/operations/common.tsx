import { useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, Empty, Panel, Tag } from '../../ui';
import type { DemoData, DemoRecord } from '../../demo/types';
import type { V1Record } from '../../v1-client';
import { Icon, type IconName } from '../../icons';
export { Button, Dialog, Empty, Panel, Tag };
export type RecordItem = DemoRecord;
export type Act = (action: string, payload?: Record<string, unknown>) => void | Promise<unknown>;
// DemoContext reports rejected commands; button handlers swallow the rethrow.
// Form submit callbacks stay raw so FormDialog retains their input on rejection.
export const safe = (callback: () => unknown) => { try {
    const result = callback();
    if (result && typeof (result as Promise<unknown>).catch === 'function') void (result as Promise<unknown>).catch(() => {});
}
catch { /* the shared failure notice is already visible */ } };
export type Props = {
    data: DemoData;
    act: Act;
    navigate: (route: string) => void;
    target?: string;
    real?: { capturePolicies: V1Record[]; releases: V1Record[] };
};
export const isLive = (data: DemoData) => data.runtime?.mode === 'live';
export const targetId = (target?: string) => { const id=target?.split('/').slice(1).join('/').split('?')[0] || ''; return id==='new'?'':id; };
export const newProjectTarget = (target?: string) => target?.split('/')[1]?.startsWith('new?') ? new URLSearchParams(target.slice(target.indexOf('?')+1)).get('projectId') || '' : '';
export const receiptId = (receipt: unknown) => typeof (receipt as {data?:{id?:unknown}})?.data?.id === 'string' ? (receipt as {data:{id:string}}).data.id : '';
/** Capture the version and scope at form opening; never silently rebase a failed form. */
export const recordSnapshot = (r?: RecordItem): Record<string, unknown> => r ? { expectedVersion: r.revision, recordScope: r.scope } : { expectedVersion: 0 };
export const unavailable = (message: string): never => { throw new Error(message + '（尚未接入，未修改记录）'); };
export const labels: Record<string, string> = { online: '在线', offline: '离线', unknown: '待核实', unreported: '未上报', sleeping: '休眠', waking: '待唤醒', healthy: '健康', degraded: '异常', down: '故障', ready: '待执行', requested: '待审批', verifying: '验证中', failed: '未通过', restoring: '恢复中', restored: '已恢复', rejected: '已拒绝', pending: '待处理', approved: '已批准', executed: '已执行', rolledback: '已回滚', running: '执行中', queued: '待执行', validating: '验收中', blocked: '已阻塞', waitingResource: '等待节点', waitingQuota: '等待预算', waitingUser: '等待输入', paused: '已暂停', approval: '等待审批', completed: '已交付', cancelled: '已停止', inbox: '新灵感', discussion: '讨论完善', researching: '研究中', review: '待决定', accepted: '已采纳', deferred: '已暂存', converted: '已立项', created: '已备份', verified: '已验证', merged: '已合并', pass: '已通过', fail: '未通过', duplicate: '重复记录', routed: '已归档', waitingTarget: '待确认', ignored: '已忽略', personal: '个人工作', company: '公司范围', family: '家庭共享', private: '本人私有', test: '测试', staging: '预发布', production: '生产', managed: '管家托管', observe: '只读跟踪', idea: '灵感', experience: '经验', book: '资料', memory: '记忆', support: '支持证据', counter: '反证限制', material: '资料候选', research: '灵感研究' };
export const name = (value: unknown) => labels[String(value)] || String(value ?? '—');
Object.assign(labels,{planned:'计划中',active:'进行中',delivered:'已交付',archived:'已归档',published:'已发布',deprecated:'已停用',unverified:'待核对',development:'开发',lesson:'经验教训',skill:'通用技能',runbook:'操作手册',manual:'主动记录',voice:'语音记录',device:'设备摘要'});
export const arr = <T = RecordItem,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
export const visible = (r: RecordItem, data: DemoData) => r.scope === 'private' ? r.owner === data.profile : data.profile === 'me' || r.owner === data.profile || r.scope === 'family';
export const modifiable = (r: RecordItem, data: DemoData) => visible(r, data) && (data.profile === 'me' || r.owner === data.profile);
export const money = (n: unknown) => '¥' + Number(n || 0).toFixed(2);
export const machineName = (d: DemoData, id: unknown) => d.machines.find(m => m.id === id)?.name || String(id || '未指定');
export const projectName = (d: DemoData, id: unknown) => d.projects.find(p => p.id === id)?.name || String(id || '未关联');
export const personName = (d: DemoData, id: unknown) => d.profiles.find(p => p.id === id)?.name || String(id || '本人');
export const exportText = (filename: string, text: string) => { const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); };
export function Status({ value }: {
    value: unknown;
}) { const v = String(value || 'unknown'); const tone = ['healthy', 'online', 'completed', 'accepted', 'converted', 'restored', '可用', '已验证', 'executed'].includes(v) ? 'complete' : ['down', 'failed', 'blocked', 'rejected', 'cancelled'].includes(v) ? 'failed' : ['pending', 'requested', 'approval', 'waitingQuota', 'waitingResource', 'degraded', 'review', 'verifying', '待验证', '待发布'].includes(v) ? 'queued' : ''; return <Tag tone={tone}>{name(v)}</Tag>; }
export function Header({ title, description, children }: {
    title: string;
    description: string;
    children?: ReactNode;
}) { return <div className="op-heading"><div><h2>{title}</h2><p>{description}</p></div><div className="op-actions">{children}</div></div>; }
export function Tabs({ items, value, onChange }: {
    items: [
        string,
        string
    ][];
    value: string;
    onChange: (v: string) => void;
}) { return <div className="op-tabs" role="tablist">{items.map(([id, label]) => <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{label}</button>)}</div>; }
export function Toolbar({ search, setSearch, children, placeholder = '搜索标题、来源或关联项目' }: {
    search: string;
    setSearch: (v: string) => void;
    children?: ReactNode;
    placeholder?: string;
}) { return <div className="op-toolbar"><div className="op-actions">{children}</div><input aria-label={placeholder} placeholder={placeholder} value={search} onChange={e => setSearch(e.target.value)}/></div>; }
export type MetricIcon = IconName;
export function Metrics({ items }: {
    items: {
        icon: MetricIcon;
        label: string;
        value: ReactNode;
        note?: string;
        percent?: number;
    }[];
}) { return <div className="op-metrics">{items.map((m, i) => <div key={m.label} className="op-metric"><div className={'op-metric-mark op-mark-' + i}>{m.percent !== undefined ? <svg viewBox="0 0 44 44" aria-label={`${m.label} ${Math.round(m.percent)}%`}><circle cx="22" cy="22" r="17" fill="none" stroke="var(--line)" strokeWidth="4"/><circle cx="22" cy="22" r="17" fill="none" stroke="currentColor" strokeWidth="4" pathLength="100" strokeDasharray={`${Math.max(0, Math.min(100, m.percent))} 100`} transform="rotate(-90 22 22)"/></svg> : <Icon name={m.icon} size={24} />}</div><div><span>{m.label}</span><strong>{m.value}</strong>{m.note && <small>{m.note}</small>}</div></div>)}</div>; }
export function Progress({ value, label }: {
    value: number;
    label?: string;
}) { return <div className="op-progress-wrap">{label && <span>{label}</span>}<div className="op-progress" role="progressbar" aria-valuenow={Math.round(value || 0)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }}/></div><small>{Math.round(value || 0)}%</small></div>; }
export function KV({ items }: {
    items: [
        string,
        ReactNode
    ][];
}) { return <dl className="op-kv">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>; }
export function Timeline({ items }: {
    items: unknown[];
}) { return items.length ? <ol className="op-timeline">{items.map((item, i) => { const r = typeof item === 'string' ? { text: item } : item as Record<string, unknown>; return <li key={i}>{(r.time || r.at) != null && <small>{String(r.time || r.at)}</small>}<span>{String(r.text || r.action || r.message || r.reason || (r.objectId ? `引用 ${r.objectId} · ${r.version || ''}` : '已记录'))}</span></li>; })}</ol> : <Empty title="暂无记录"/>; }
export const eventText = (events: unknown[]) => events.map(item => typeof item === 'string' ? item : (() => {const r=item as Record<string,unknown>; return [r.time||r.at,r.text||r.action||r.reason].filter(Boolean).join(' · ');})()).join('\n');
export function Note({ children, tone = '' }: {
    children: ReactNode;
    tone?: string;
}) { return <div className={'op-note ' + tone}>{children}</div>; }
export const scopes: [
    string,
    string
][] = [['personal', '个人工作'], ['family', '家庭共享'], ['private', '本人私有'], ['company', '公司指定范围']];
export type InputField = {
    key: string;
    label: string;
    type?: 'textarea' | 'number' | 'select' | 'checkbox' | 'password';
    required?: boolean;
    min?: number;
    max?: number;
    options?: [
        string,
        string
    ][];
    hint?: string;
    disabled?: boolean;
};
export type FormSpec = {
    title: string;
    description?: string;
    fields: InputField[];
    initial?: Record<string, unknown>;
    submitLabel?: string;
    submit: (values: Record<string, any>) => void | Promise<unknown>;
};
export function FormDialog({ spec, onClose }: {
    spec: FormSpec;
    onClose: () => void;
}) { const [values, setValues] = useState<Record<string, any>>(() => ({ ...Object.fromEntries(spec.fields.filter(f => f.type === 'select' || f.type === 'checkbox').map(f => [f.key, f.type === 'select' ? (f.options?.[0]?.[0] ?? '') : false])), ...spec.initial })); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const submitting = useRef(false); const close = () => { if (!submitting.current) onClose(); }; return <Dialog title={spec.title} onClose={close} wide><form aria-busy={busy} onSubmit={async e => { e.preventDefault(); if (submitting.current) return; submitting.current = true; setBusy(true); setError(''); try {
    const submitted = { ...values };
    for (const f of spec.fields) {
        if (f.disabled) continue;
        if (f.required && (f.type === 'checkbox' ? submitted[f.key] !== true : !String(submitted[f.key] ?? '').trim()))
            throw new Error('请填写' + f.label);
        if (f.type === 'number') {
            if (!f.required && (submitted[f.key] === '' || submitted[f.key] === undefined)) { delete submitted[f.key]; continue; }
            const n = Number(submitted[f.key]);
            if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max))
                throw new Error(f.label + '超出允许范围');
            submitted[f.key] = n;
        }
    }
    await spec.submit(submitted);
    onClose();
}
catch (err) {
    const conflict = (err as { status?: number })?.status === 409;
    setError((err instanceof Error ? err.message : '请核对输入') + (conflict ? '。输入已保留；关闭后刷新记录，复核新版本再提交。' : ''));
} finally { submitting.current = false; setBusy(false); } }}>{spec.description && <Note>{spec.description}</Note>}<div className="op-form">{spec.fields.map(f => <label key={f.key} className={f.type === 'textarea' ? 'op-full' : ''}><span>{f.label}{f.required ? ' *' : ''}</span>{f.type === 'select' ? <select disabled={busy || f.disabled} aria-label={f.label} value={values[f.key] ?? f.options?.[0]?.[0] ?? ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })}>{f.options?.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select> : f.type === 'textarea' ? <textarea disabled={busy || f.disabled} aria-label={f.label} rows={4} required={f.required} value={values[f.key] || ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })}/> : f.type === 'checkbox' ? <input disabled={busy || f.disabled} required={f.required} type="checkbox" aria-label={f.label} checked={!!values[f.key]} onChange={e => setValues({ ...values, [f.key]: e.target.checked })}/> : <input disabled={busy || f.disabled} aria-label={f.label} type={f.type || 'text'} step={f.type === 'number' ? 'any' : undefined} min={f.min} max={f.max} required={f.required} value={values[f.key] ?? ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })}/>} {f.hint && <small>{f.hint}</small>}</label>)}</div>{error && <p className="error" role="alert">{error}</p>}<div className="op-form-footer"><Button kind="ghost" disabled={busy} onClick={close}>取消</Button><Button disabled={busy} type="submit">{busy ? '正在保存…' : spec.submitLabel || '保存记录'}</Button></div></form></Dialog>; }
export function EvidenceList({ items, removalUnavailable = false }: {
    items: RecordItem[];
    removalUnavailable?: boolean;
}) { return <div className="op-stack">{items.map(e => <article key={e.id} className="op-evidence"><div className="op-row"><Tag>{name(e.type)}</Tag><strong>{e.title}</strong></div><p>{e.summary}</p><small>{e.source} · {e.locator || '待补定位'} · {name(e.status || '待核对')}</small>{removalUnavailable && <div className="op-actions"><Button disabled title="证据移除接口尚未接入，历史证据不会被隐式删除" kind="ghost">移除证据 · 待接入</Button></div>}</article>)}{!items.length && <Empty title="暂无证据" detail="录入来源、位置和核对状态。"/>}</div>; }
export const split = (text: unknown) => String(text || '').split(/[\n,，]/).map(s => s.trim()).filter(Boolean);
export const find = (records: RecordItem[], id: string) => records.find(r => r.id === id);
