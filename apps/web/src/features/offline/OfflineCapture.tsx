import { useEffect, useRef, useState, type FormEvent } from 'react';
import { OfflineVault, createOfflineVaultDraft, OFFLINE_VAULT_MAX_FILE_SIZE, OFFLINE_VAULT_MAX_TOTAL_SIZE, OFFLINE_VAULT_MAX_FILES, type OfflineVaultDraft, type OfflineVaultMaterial } from './offline-vault';
import { currentOfflineShell, prepareOfflineShell } from './offline-shell-client';
import {OfflineDraftSync} from './OfflineDraftSync';

const MAX_FILE = OFFLINE_VAULT_MAX_FILE_SIZE, MAX_TOTAL = OFFLINE_VAULT_MAX_TOTAL_SIZE;
const kinds = [['idea', '灵感想法'], ['experience', '问题经验'], ['lesson', '经验教训'], ['skill', '通用技能'], ['book', '资料书籍'], ['memory', '记忆候选']] as const;
const scopes = [['private', '私有'], ['personal', '个人'], ['family', '家庭'], ['company', '公司']] as const;
const message = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请重试。';
const sizeLabel = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

function Material({ material, onRemove, disabled, objectUrls }: { material: OfflineVaultMaterial; onRemove: () => void; disabled: boolean; objectUrls: Set<string> }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const next = URL.createObjectURL(material.blob); objectUrls.add(next); setUrl(next); return () => { URL.revokeObjectURL(next); objectUrls.delete(next); }; }, [material.blob, objectUrls]);
  return <li className="offline-material"><div><strong>{material.filename}</strong><span>{sizeLabel(material.size)}</span></div>
    {material.mime.startsWith('audio/') && url && <audio controls preload="none" src={url} aria-label={`回听 ${material.filename}`} />}
    <div className="offline-actions"><a href={url || undefined} download={material.filename}>下载原件</a><button type="button" onClick={onRemove} disabled={disabled}>移除 {material.filename}</button></div></li>;
}

export function OfflineCapture() {
  const [vault] = useState(() => new OfflineVault());
  const [exists, setExists] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<OfflineVaultDraft | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busyState, setBusy] = useState(false);
  const [syncWorking,setSyncWorking]=useState(false),[saveSerial,setSaveSerial]=useState(0);
  const busy=busyState||syncWorking;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [shell, setShell] = useState<{ ready: boolean; waiting?: boolean; version?: string }>({ ready: false });
  const [preparing, setPreparing] = useState(false);
  const [shellError, setShellError] = useState('');
  const [recording, setRecording] = useState<'idle' | 'requesting' | 'recording' | 'stopping'>('idle');
  const draftRef = useRef(draft), epoch = useRef(0), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  const recordingChunks = useRef<Blob[] | null>(null), objectUrls = useRef(new Set<string>());
  const importing = useRef<HTMLInputElement>(null), filesInput = useRef<HTMLInputElement>(null);
  draftRef.current = draft;

  const clearSensitive = (announce = true) => {
    epoch.current++; vault.lock();
    if (recordingChunks.current) recordingChunks.current.length = 0;
    recordingChunks.current = null;
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
    const active = recorder.current; recorder.current = null;
    if (active && active.state !== 'inactive') active.stop();
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    draftRef.current = null; setDraft(null); setPassphrase(''); setConfirmation(''); setDirty(false); setBusy(false); setSyncWorking(false);setRecording('idle'); setError('');
    if (importing.current) importing.current.value = '';
    if (filesInput.current) filesInput.current.value = '';
    if (announce) setNotice('已锁定并清屏。未保存的改动已清除，解锁可恢复最近一次密文保存。');
  };
  useEffect(() => {
    let alive = true;
    vault.exists().then(value => { if (alive) setExists(value); }).catch(e => { if (alive) setError(message(e)); });
    currentOfflineShell().then(value => { if (alive) setShell(value); }).catch(() => {});
    const network = () => setOnline(navigator.onLine);
    const leaving = () => clearSensitive(false);
    const changed = (event: StorageEvent) => { if (event.key === null || event.key === 'jarvis-inbox-material-session-v1' || event.key === 'jarvis-member-session-epoch-v1') clearSensitive(); };
    const invalidated = () => clearSensitive();
    window.addEventListener('online', network); window.addEventListener('offline', network); window.addEventListener('pagehide', leaving);
    window.addEventListener('storage', changed); window.addEventListener('jarvis:inbox-materials-invalidated', invalidated);
    return () => { alive = false; epoch.current++; vault.lock(); if (recordingChunks.current) recordingChunks.current.length = 0; recordingChunks.current = null; recorder.current?.stream.getTracks().forEach(track => track.stop()); stream.current?.getTracks().forEach(track => track.stop()); for (const url of objectUrls.current) URL.revokeObjectURL(url); objectUrls.current.clear(); window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener('pagehide', leaving); window.removeEventListener('storage', changed); window.removeEventListener('jarvis:inbox-materials-invalidated', invalidated); };
  }, [vault]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || recording !== 'idle') { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, recording]);
  const update = (patch: Partial<OfflineVaultDraft>) => { if (!draftRef.current || busy || recording !== 'idle') return; const next = { ...draftRef.current, ...patch }; draftRef.current = next; setDraft(next); setDirty(true); setError(''); setNotice(''); };
  const runUnlocked = async (action: () => Promise<OfflineVaultDraft>, success: string) => {
    const turn = epoch.current; setBusy(true); setError(''); setNotice('');
    try {
      const saved = await action();
      if (epoch.current !== turn) return;
      draftRef.current = saved; setDraft(saved); setDirty(false); setExists(true); setPassphrase(''); setConfirmation('');setSaveSerial(value=>value+1);setNotice(success);
    } catch (e) { if (epoch.current === turn) setError(message(e)); }
    finally { if (epoch.current === turn) setBusy(false); }
  };
  const openVault = (event: FormEvent) => {
    event.preventDefault(); if (busy || exists === null) return;
    if (!exists && (!acknowledged || passphrase !== confirmation)) { setError(!acknowledged ? '请先确认这是可信的私人设备及口令保管事项。' : '两次口令不一致。'); return; }
    void runUnlocked(() => exists ? vault.unlock(passphrase) : vault.create(passphrase, createOfflineVaultDraft()), exists ? '已解锁，恢复的是最近一次保存的本机密文。' : '本机密文收件已建立，请写下内容后点击保存。');
  };
  const save = () => {
    const current = draftRef.current; if (!current || busy || recording !== 'idle') return;
    if (current.sourceUrl.trim()) {
      try { const url = new URL(current.sourceUrl.trim()); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); }
      catch { setError('请填写完整的 http 或 https 链接，链接中不能包含账号或密码。'); return; }
    }
    void runUnlocked(() => vault.save(current), '已保存到本机密文，可锁定或关闭后重新打开并解锁。尚未提交到平台。');
  };
  const addMaterials = (materials: OfflineVaultMaterial[]) => {
    const current = draftRef.current; if (!current) return;
    const next = [...current.materials, ...materials];
    if (next.length > OFFLINE_VAULT_MAX_FILES || next.some(file => file.size < 1 || file.size > MAX_FILE) || next.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL) { setError('最多保存5件非空原件；每件不超过25 MiB，合计不超过64 MiB。'); return; }
    draftRef.current = { ...current, materials: next }; setDraft(draftRef.current); setDirty(true); setNotice('');
  };
  const startRecording = async () => {
    if (!draftRef.current || busy || recording !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('此浏览器不支持原声录音，可选择已有录音文件。'); return; }
    if (draftRef.current.materials.length >= OFFLINE_VAULT_MAX_FILES) { setError('已达到5件原件上限，请先移除一件。'); return; }
    const turn = epoch.current; setError(''); setRecording('requesting');
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (turn !== epoch.current) { microphone.getTracks().forEach(track => track.stop()); return; }
      stream.current = microphone;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const active = new MediaRecorder(microphone, mimeType ? { mimeType } : undefined); recorder.current = active;
      const chunks: Blob[] = []; let bytes = 0, failed = false;
      recordingChunks.current = chunks;
      active.ondataavailable = event => {
        if (turn !== epoch.current || failed || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > MAX_FILE) { failed = true; setError('本段录音超过25 MiB，未加入草稿，请分段录制。'); if (active.state !== 'inactive') active.stop(); return; }
        chunks.push(event.data);
      };
      active.onerror = () => { failed = true; if (turn === epoch.current) setError('录音未完成，请重试或选择已有录音文件。'); };
      active.onstop = () => {
        microphone.getTracks().forEach(track => track.stop());
        if (turn !== epoch.current) { chunks.length = 0; return; }
        recorder.current = null; stream.current = null; setRecording('idle');
        recordingChunks.current = null;
        if (!failed && chunks.length) {
          const mime = active.mimeType || chunks[0].type || 'audio/webm';
          const blob = new Blob(chunks, { type: mime });
          const extension = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
          addMaterials([{ id: crypto.randomUUID(), filename: `原声录音-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`, mime, size: blob.size, blob }]);
        } else if (!failed) setError('没有收到录音字节，本次没有保存录音。');
        chunks.length = 0;
      };
      active.start(1000); setRecording('recording');
    } catch (e) {
      if (turn === epoch.current) { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; recorder.current = null; setRecording('idle'); setError('无法启用麦克风。请检查权限，或选择已有录音文件。'); }
    }
  };
  const stopRecording = () => { if (recorder.current?.state === 'recording') { setRecording('stopping'); recorder.current.stop(); } };
  const exportPackage = async () => {
    if (busy || dirty || recording !== 'idle') return;
    const turn = epoch.current; setBusy(true); setError('');
    try {
      const blob = await vault.exportPackage(); if (turn !== epoch.current) return;
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = '贾维斯离线收件.jarvis-offline.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('已下载密文备份。可在另一浏览器的离线页用同一口令导入；也可联网后在快速记录中导入整理。');
    } catch (e) { if (turn === epoch.current) setError(message(e)); } finally { if (turn === epoch.current) setBusy(false); }
  };
  const importPackage = async (file: File | undefined) => {
    if (!file || busy || exists !== false) return;
    if (!acknowledged || !passphrase) { setError('导入前请填写原口令，并确认私人设备及口令保管事项。'); if (importing.current) importing.current.value = ''; return; }
    await runUnlocked(() => vault.importPackage(file, passphrase), '密文备份已验证并导入本机，已用原口令解锁。尚未提交到平台。');
    if (importing.current) importing.current.value = '';
  };
  const prepare = async () => {
    setPreparing(true); setShellError('');
    try { setShell(await prepareOfflineShell()); }
    catch (e) { setShellError(message(e)); }
    finally { setPreparing(false); }
  };

  return <main className="offline-page">
    <header className="offline-header"><div><p className="offline-eyebrow">贾维斯 · 本机收件</p><h1>先收下，联网再整理</h1><p>离线保存文字、链接和原件；联网后由你选择导入平台。</p></div><span className={`offline-network ${online ? 'is-online' : ''}`}>{online ? '当前联网' : '当前离线'}</span></header>
    <section className="offline-card offline-prepare" aria-label="离线准备"><div><h2>让这个入口可以离线重开</h2><p>首次联网时点击准备，仅保存此页的公共程序。正文、链接和录音只在你保存时写入本机密文。</p><p role="status" className={shell.ready ? 'offline-success' : 'offline-muted'}>{shell.ready ? `已准备，可关闭后离线重开${shell.waiting ? '；新版本将在本页关闭后生效。' : '。'}` : '尚未确认离线准备完成。请首次联网时准备。'}</p>{shell.version && <small>离线版本 {shell.version.slice(0, 12)}</small>}</div><button type="button" onClick={() => void prepare()} disabled={preparing}>{preparing ? '正在校验离线文件…' : '准备离线收件'}</button>{shellError && <p role="alert" className="offline-error">{shellError}</p>}</section>
    <section className="offline-card" aria-label="本机密文收件"><div className="offline-section-heading"><h2>{draft ? '离线草稿' : '解锁本机收件'}</h2><span className={draft ? 'offline-success' : 'offline-muted'}>{draft ? dirty ? '有改动未保存' : '本机密文已保存' : '已锁定'}</span></div>
      <p className="offline-warning">仅在可信的私人设备上使用。口令不会上传，忘记后无法恢复。清除浏览器本站数据会移除本机密文，请另存密文备份。</p>
      {!draft ? <form onSubmit={openVault} className="offline-unlock"><label>离线口令<input type="password" autoComplete="off" value={passphrase} onChange={event => setPassphrase(event.target.value)} disabled={busy} minLength={12} maxLength={256} required placeholder={exists ? '输入建立时的口令' : '12至256个字符'} /></label>
        {exists === false && <><label>再次输入离线口令<input type="password" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} minLength={12} maxLength={256} placeholder="建立新收件时再次确认" /></label><label className="offline-check"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={busy} />我正在使用可信的私人设备，并已了解忘记口令无法恢复。</label></>}
        <div className="offline-actions"><button type="submit" className="offline-primary" disabled={busy || exists === null}>{busy ? '正在验证密文…' : exists ? '解锁本机收件' : '建立并解锁'}</button>{exists === false && <label className="offline-file-button">导入密文备份<input ref={importing} type="file" accept=".json,.jarvis-offline" aria-label="导入密文备份" disabled={busy} onChange={event => void importPackage(event.target.files?.[0])} /></label>}</div>
        {exists && <p className="offline-muted">此浏览器已有密文收件。导入另一份备份不会覆盖它；请在另一浏览器导入，或到平台快速记录中选择密文包。</p>}</form>
        : <div className="offline-editor"><label>离线标题<input maxLength={300} value={draft.title} onChange={event => update({ title: event.target.value })} disabled={busy || recording !== 'idle'} /></label><label>离线正文<textarea aria-label="离线正文" rows={7} maxLength={20000} value={draft.rawText} onChange={event => update({ rawText: event.target.value })} disabled={busy || recording !== 'idle'} placeholder="把此刻想到的先写下来…" /></label><label>离线链接<input type="url" maxLength={2048} value={draft.sourceUrl} onChange={event => update({ sourceUrl: event.target.value })} disabled={busy || recording !== 'idle'} placeholder="https://…（离线仅保存地址，不抓取网页）" /></label>
          <div className="offline-field-row"><label>收件类型<select value={draft.kind} onChange={event => update({ kind: event.target.value as OfflineVaultDraft['kind'] })} disabled={busy || recording !== 'idle'}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>整理范围<select value={draft.scope} onChange={event => update({ scope: event.target.value as OfflineVaultDraft['scope'] })} disabled={busy || recording !== 'idle'}>{scopes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <div className="offline-materials-heading"><h3>文档、图片与原声</h3><p>最多5件，每件25 MiB，合计64 MiB。录音保留原声，不在离线页转写。</p></div><div className="offline-actions"><label className="offline-file-button">添加离线文件<input ref={filesInput} type="file" multiple aria-label="添加离线文件" disabled={busy || recording !== 'idle'} onChange={event => { addMaterials([...event.target.files || []].map(file => ({ id: crypto.randomUUID(), filename: file.name, mime: file.type || 'application/octet-stream', size: file.size, blob: file }))); event.target.value = ''; }} /></label><button type="button" onClick={() => void startRecording()} disabled={busy || recording !== 'idle'}>开始原声录音</button>{recording !== 'idle' && <button type="button" onClick={stopRecording} disabled={recording !== 'recording'}>{recording === 'requesting' ? '等待麦克风权限…' : recording === 'stopping' ? '正在收齐录音…' : '停止录音'}</button>}</div>
          {draft.materials.length > 0 && <ul className="offline-materials">{draft.materials.map(material => <Material key={material.id} material={material} disabled={busy || recording !== 'idle'} objectUrls={objectUrls.current} onRemove={() => update({ materials: draft.materials.filter(item => item.id !== material.id) })} />)}</ul>}
          <div className="offline-actions offline-save"><button type="button" className="offline-primary" onClick={save} disabled={busy || recording !== 'idle'}>{busy ? '正在保存密文…' : '保存到本机密文'}</button><button type="button" onClick={() => void exportPackage()} disabled={busy || dirty || recording !== 'idle'}>导出密文备份</button><button type="button" onClick={() => clearSensitive()}>锁定并清屏</button></div><p className="offline-muted">保存后才可关闭恢复或导出。锁定会清除未保存改动；只有明确启用下方同步才会上传密文，绝不自动提交到收件。</p></div>}
      {error && <p role="alert" className="offline-error">{error}</p>}{notice && <p role="status" className="offline-success">{notice}</p>}
    </section>
    <OfflineDraftSync vault={vault} localReady={!!draft} dirty={dirty} disabled={busyState||recording!=='idle'} saveSerial={saveSerial} onLock={()=>clearSensitive()} onWorking={setSyncWorking} onRemote={value=>{draftRef.current=value;setDraft(value);setExists(true);setDirty(false);setPassphrase('');setConfirmation('');setSaveSerial(serial=>serial+1);setNotice('已选择远端密文并恢复本机。尚未提交到收件。')}}/>
    <footer className="offline-card offline-footer"><div><h2>联网后继续</h2><p>先保存并导出密文备份，再到平台的快速记录中选择密文包和原口令。核对当前登录身份与内容后，再由你提交。</p></div><a className="offline-link-button" href="/?mode=platform">到平台整理</a></footer>
  </main>;
}
