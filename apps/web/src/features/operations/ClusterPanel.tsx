import { useEffect, useState } from 'react';
import { Panel, Button, KV, Tag, Note } from './common';
import { usePrivateRuntime } from './usePrivateRuntime';

const reasons: Record<string, string> = { NODE_NOT_STANDBY: '不是备用节点', BUSINESS_ALREADY_RUNNING: '业务已运行', CLUSTER_MISMATCH: '中心标识不符', RELEASE_MISMATCH: '版本不符', DEPENDENCIES_NOT_VERIFIED: '运行依赖未验收', NO_VERIFIED_SNAPSHOT: '暂无核验快照', SNAPSHOT_RELEASE_MISMATCH: '快照版本不符', SNAPSHOT_TOO_OLD_OR_FUTURE: '快照过旧或时间异常' };
export default function ClusterPanel() {
  const [state, setState] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [expanded,setExpanded]=useState(false);
  const request = usePrivateRuntime(() => { setState(null); setError(''); setBusy(false); });
  async function load(check = false) {
    setBusy(true); setError('');
    try { setState(await request('/api/runtime/cluster' + (check ? '/check' : ''), check ? 'POST' : 'GET', check ? {} : undefined)); }
    catch (e: any) { if (e.name !== 'AbortError') setError(e.message || '主备状态读取失败'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); const timer=window.setInterval(()=>{void load();},15000);const stop=()=>window.clearInterval(timer);window.addEventListener('jarvis:auth-required',stop);return()=>{stop();window.removeEventListener('jarvis:auth-required',stop);}; }, []);
  return <Panel className={`cluster-panel ${expanded?'expanded':''}`} title="中心主备" actions={<><Button className="cluster-mobile-toggle" kind="ghost" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'收起详情':'主备详情'}</Button><Button kind="ghost" disabled={busy} onClick={() => void load(true)}>{busy ? '检查中…' : '检查节点'}</Button></>}>
    {error && <Note>{error}</Note>}
    {state?.configured&&<p className="cluster-mobile-summary">{state.local.nodeId} · {state.local.role==='primary'?'当前主节点':'开发节点'}<span>{state.nodes.map((node:any)=>`${node.nodeId} · ${node.status==='reachable'?'可连接':node.status==='unreachable'?'校验失败':'待核验'}`).join(' / ')}</span></p>}
    <div className="cluster-details">
    {!state ? <Note>读取节点状态…</Note> : !state.configured ? <Note>当前为开发环境，尚未配置生产主备节点。</Note> : <>
      <div className="op-grid"><article className="op-card"><div className="op-row between"><h3>{state.local.nodeId} · 当前中心</h3><Tag>{state.local.role === 'primary' ? '主节点' : '开发节点'}</Tag></div><KV items={[["正式版本", state.local.build], ['角色代次', String(state.local.epoch)], ['切换方式', '人工受控 · 不自动抢主']]}/></article>
      {state.nodes.map((node: any) => <article className="op-card" key={node.nodeId}><div className="op-row between"><h3>{node.nodeId} · 备用检查</h3><Tag>{node.status === 'reachable' ? '节点可连接' : node.status === 'unreachable' ? '校验失败' : '状态待核验'}</Tag></div><KV items={[["版本", node.observation?.build || '待核验'], ['最后恢复点', node.observation?.snapshot?.snapshotAt ? new Date(node.observation.snapshot.snapshotAt).toLocaleString() : '暂无核验快照'], ['快照滞后', node.readiness?.snapshotLagSec == null ? '待核验' : node.readiness.snapshotLagSec + '秒'], ['恢复材料', node.readiness?.recoveryMaterialsReady ? '核验通过' : '尚未就绪']]}/>{node.readiness?.reasons.length > 0 && <small>{node.readiness.reasons.map((reason: string) => reasons[reason] || reason).join('；')}</small>}{node.error && <small>{node.error}</small>}</article>)}</div>
      <Note>当前使用完整冷快照，尚无持续复制。恢复材料通过后，仍需确认旧主已停止或隔离，才能受控接管。</Note>
    </>}
    </div>
  </Panel>;
}
