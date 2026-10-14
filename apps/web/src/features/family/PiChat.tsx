import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, post, streamChat } from '../../api';
import type { Bootstrap, ChatMessage, Conversation, PiSettings } from '../../types';
import ThemeStage from '../../ThemeStage';
import { Button, Dialog, Empty, Field, Tag } from '../../ui';
import { CentralVoicePermission, Icon, useSpeech, type Phase } from './shared';
import PiModelSettings from './PiModelSettings';
import VoiceIntentPanel from './VoiceIntentPanel';
import AnswerLinks from './AnswerLinks';
import './family.css';
import './pi-live.css';

export interface PiChatProps {
  theme?: string; profile?: string; navigate: (route: string) => void;
  initialPrompt?: string; initialMode?: string; onConfigurationChange?: () => void;
}
type UnsavedAnswer = { id: string; conversationId: string; text: string; reason: string };
type Run = { token: number; conversationId: string; stopping: boolean };
const prompts = [
  { id: 'general', label: '聊聊今天', icon: 'chat', text: '今天有点累，陪我聊一会儿。' },
  { id: 'english', label: '语言陪练', icon: 'language', text: '陪我练习英语，先从今天发生的一件小事开始，逐步纠正我的表达。' },
  { id: 'story', label: '故事学习', icon: 'book', text: '讲一个有出处的历史人物故事，区分史料与解读，最后给我一个可以继续追问的问题。' },
  { id: 'life', label: '生活助手', icon: 'food', text: '我有番茄和鸡蛋，帮我安排一顿简单的晚饭。先问清楚人数和口味。' },
  { id: 'progress', label: '查看进展', icon: 'chart', text: '请查询真实项目和任务记录，概括当前进度、需要我决定的事和未接入的能力，不要把人工报告当作已验证执行。' },
  { id: 'capture', label: '整理想法', icon: 'edit', text: '帮我整理一个想法，先问清楚目标、使用者和下一步。先讨论，不代替我保存记录或批准操作。' },
];
const stateText: Record<Phase, { title: string; detail: string }> = {
  ready: { title: '贾维斯，随时待命', detail: '真实会话 · 一句话，开始交流' },
  listening: { title: '我在听，请慢慢说', detail: '中央语音识别 · 核对文字后再发送' },
  thinking: { title: '正在为你整理回答', detail: 'Pi 会话正在处理你的问题' },
  speaking: { title: '正在为你朗读', detail: '中央语音引擎 · 随时可以打断' },
  interrupted: { title: '这次交流已经停下', detail: '可核对会话记录，再继续下一句' },
  answered: { title: '我们继续聊', detail: '回答与状态已按本机会话记录显示' },
  awaiting: { title: '先连接你的对话模型', detail: '完成模型配置后，开始真实交流' },
};
const toolLabels: Record<string, string> = {
  jarvis_projects: '项目记录', jarvis_devices: '设备记录', jarvis_tasks: '任务记录', jarvis_experiences: '经验记录', jarvis_inbox: '收件记录', jarvis_research: '研究记录', jarvis_releases: '交付记录', jarvis_knowledge:'已发布知识',jarvis_memory:'本人确认记忆',jarvis_family:'家庭共同安排',jarvis_services:'服务台账',jarvis_web_search:'联网资料',jarvis_news:'最新新闻',jarvis_read_page:'网页正文',
  list_projects: '项目记录', list_devices: '设备记录', list_tasks: '任务记录', list_experiences: '经验记录',
};
const dateLabel = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function PiChat({ theme = 'stark', profile = 'me', navigate, initialPrompt, initialMode, onConfigurationChange }: PiChatProps) {
  const enabled = profile === 'me';
  const [settings, setSettings] = useState<PiSettings | null>(null);
  const baseChatSettings=settings?.routing?.scenarios.find(s=>s.id==='chat')??settings,fast=settings?.routing?.conversation?.enabled?settings.routing.conversation.fast:null,fastProvider=settings?.providers.find(p=>p.id===fast?.provider);
  const chatSettings=fast?{...fast,configured:!!fastProvider?.credentialConfigured&&!!fastProvider.models.some(m=>m.id===fast.model)}:baseChatSettings;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ownerName, setOwnerName] = useState('管理者');
  const [draft, setDraft] = useState('');
  const [partial, setPartial] = useState('');
  const [transition,setTransition]=useState('');
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [unsaved, setUnsaved] = useState<UnsavedAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [phase, setPhase] = useState<Phase>('ready');
  const [runStatus, setRunStatus] = useState('');
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [mode, setMode] = useState('general');
  const [immersive, setImmersive] = useState(false);
  const [modal, setModal] = useState('');
  const [micActive, setMicActive] = useState(false);
  const [micConsent, setMicConsent] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [promptNotice, setPromptNotice] = useState('');
  const mounted = useRef(true), generation = useRef(0), historyTurn = useRef(0);
  const createdSessionPhase=useRef('');
  const active = useRef<Run | null>(null), currentId = useRef(''), microphoneTurn = useRef(0);
  const end = useRef<HTMLDivElement>(null), conversationBox = useRef<HTMLDivElement>(null);
  const lastInitialPrompt = useRef(''), draftRef = useRef(''), phaseRef = useRef<Phase>('ready');
  const enabledRef = useRef(enabled), autoReadRef = useRef(false);
  currentId.current = conversationId; draftRef.current = draft; phaseRef.current = phase; enabledRef.current = enabled; autoReadRef.current = autoRead;
  const speechPrefs = useMemo(() => ({ language: mode === 'english' ? '英语' : '中文', pace: '正常', voice: 'clear' }), [mode]);
  const speech = useSpeech(profile, speechPrefs, {enabled});
  const stopVoice = useCallback(() => {
    microphoneTurn.current++;
    if (mounted.current) setMicActive(false);
    speech.stop();
  }, [speech.stop]);
  const valid = useCallback((token: number) => mounted.current && enabledRef.current && token === generation.current, []);
  const refreshSettings = useCallback(async () => {
    const value = await api<PiSettings>('/settings/pi');
    if (mounted.current && enabledRef.current) { setSettings(value); if (!active.current) setPhase((value.routing?.scenarios.find(s=>s.id==='chat')?.configured??value.configured) ? 'ready' : 'awaiting'); }
    return value;
  }, []);
  const loadHistory = useCallback(async (id: string, updatePhase = true) => {
    const turn = ++historyTurn.current;
    if (!id) { setMessages([]); return; }
    setHistoryLoading(true);
    try {
      const value = await api<ChatMessage[]>(`/chat/conversations/${encodeURIComponent(id)}/messages`);
      if (mounted.current && enabledRef.current && turn === historyTurn.current && currentId.current === id) {
        setMessages(value);
        if (updatePhase && !active.current) { const last=value.at(-1);setPhase(last?.role==='assistant'?(last.status==='failed'||last.status==='cancelled'?'interrupted':'answered'):chatSettings?.configured?'ready':'awaiting'); }
      }
    } finally { if (mounted.current && turn === historyTurn.current) setHistoryLoading(false); }
  }, [chatSettings?.configured]);
  const initialize = useCallback(async () => {
    if (!enabledRef.current) return;
    const turn = generation.current;
    setLoading(true); setError('');
    const results = await Promise.allSettled([
      api<PiSettings>('/settings/pi'), api<Conversation[]>('/chat/conversations?memberId=owner'), api<Bootstrap>('/bootstrap'),
    ]);
    if (!valid(turn)) return;
    const [configuration, sessions, bootstrap] = results;
    const errors: string[] = [];
    if (configuration.status === 'fulfilled') { setSettings(configuration.value); setPhase((configuration.value.routing?.scenarios.find(s=>s.id==='chat')?.configured??configuration.value.configured) ? 'ready' : 'awaiting'); }
    else errors.push(configuration.reason instanceof Error ? configuration.reason.message : '配置读取失败');
    if (sessions.status === 'fulfilled') { setConversations(sessions.value); if (!currentId.current && sessions.value[0]) { currentId.current = sessions.value[0].id; setConversationId(sessions.value[0].id); } }
    else errors.push(sessions.reason instanceof Error ? sessions.reason.message : '会话读取失败');
    if (bootstrap.status === 'fulfilled') setOwnerName(bootstrap.value.members.find(member => member.role === 'owner')?.name || '管理者');
    if (errors.length) setError([...new Set(errors)].join('；'));
    setLoading(false);
  }, [valid]);
  useEffect(() => {
    mounted.current = true; generation.current++;
    if (enabled) void initialize();
    else { setLoading(false); setMessages([]); setPendingPrompt(''); setPartial(''); }
    return () => {
      mounted.current = false; generation.current++; historyTurn.current++;
      const run = active.current; active.current = null;
      if (run?.conversationId) void post(`/chat/conversations/${encodeURIComponent(run.conversationId)}/abort`, {}).catch(() => {});
      stopVoice();
    };
  }, [enabled, initialize, stopVoice]);
  useEffect(() => {
    if (!enabled || active.current) return;
    const updatePhase=createdSessionPhase.current!==conversationId;createdSessionPhase.current='';
    void loadHistory(conversationId,updatePhase).catch(cause => { if (mounted.current) setError(cause instanceof Error ? cause.message : '会话记录读取失败'); });
  }, [conversationId, enabled, loadHistory]);
  useEffect(() => {
    if (!initialPrompt || initialPrompt === lastInitialPrompt.current || !enabled) return;
    lastInitialPrompt.current = initialPrompt;
    setDraft(initialPrompt.slice(0, 16000)); setPromptNotice('已带入讨论材料，核对后由你发送。');
  }, [initialPrompt, enabled]);
  useEffect(() => { const scene=prompts.find(item=>item.id===initialMode);if(scene){setMode(scene.id);if(!initialPrompt){setDraft(scene.text);setPromptNotice('已选学习场景，核对后由你发送。');}} }, [initialMode, initialPrompt]);
  useEffect(() => { conversationBox.current?.scrollTo({ top: conversationBox.current.scrollHeight, behavior: 'smooth' }); }, [messages, partial, pendingPrompt, unsaved]);
  useEffect(() => {
    if (!immersive) return;
    document.documentElement.classList.add('pi-chat-immersive-open');
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('.d-dialog-shade')) setImmersive(false); };
    document.addEventListener('keydown', escape);
    return () => { document.documentElement.classList.remove('pi-chat-immersive-open'); document.removeEventListener('keydown', escape); };
  }, [immersive]);
  useEffect(() => {
    if (speech.speaking) setPhase('speaking');
    else if (phaseRef.current === 'speaking') setPhase(active.current ? 'thinking' : 'answered');
  }, [speech.speaking]);

  async function newConversation(title = '新对话') {
    const value = await post<Conversation>('/chat/conversations', { memberId: 'owner', title: title.slice(0, 100) });
    if (!mounted.current || !enabledRef.current) return value.id;
    setConversations(old => [value, ...old.filter(item => item.id !== value.id)]);
    createdSessionPhase.current=value.id;
    currentId.current = value.id; setConversationId(value.id); setMessages([]);
    return value.id;
  }
  async function createSession() {
    if (active.current || creating || !enabled) return;
    stopVoice(); setCreating(true); setError('');
    try { await newConversation(); setPhase(chatSettings?.configured ? 'ready' : 'awaiting'); setModal(''); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : '新会话未创建'); }
    finally { if (mounted.current) setCreating(false); }
  }
  async function send() {
    const text = draftRef.current.trim();
    if (!text || active.current || creating || loading || historyLoading || micActive || !enabled) return;
    if (!chatSettings?.configured) { setPhase('awaiting'); setModal('model'); return; }
    stopVoice(); setError(''); setCopyStatus(''); setPromptNotice('');
    const token = ++generation.current;
    const run: Run = { token, conversationId: currentId.current, stopping: false }; active.current = run;
    setBusy(true); setPhase('thinking'); setRunStatus('正在连接会话'); setPartial('');setTransition(''); setPendingPrompt(text); setDraft('');
    let streamed = '', receivedDone = false, persisted = true, userSaved = false;
    let outcome = '', transportError = '', runError = '';
    try {
      if (!run.conversationId) run.conversationId = await newConversation(text.replace(/\s+/g, ' '));
      if (!valid(token)) return;
      if (run.stopping) { outcome = 'cancelled'; setDraft(old => old || text); return; }
      await streamChat(run.conversationId, text, (event, value) => {
        if (event === 'delta') streamed += String(value.text ?? '');
        if (event === 'done') { receivedDone = true; persisted = value.persisted !== false; outcome = String(value.status ?? ''); }
        if (event === 'status' && value.userMessageId) userSaved = true;
        if (event === 'error') runError = String(value.message || '这次回答未完成');
        if (!valid(token)) return;
        if (event === 'delta') { setPartial(streamed);setTransition(''); if (!run.stopping) setRunStatus('正在流式回答'); }
        if(event==='transition'&&!run.stopping&&!streamed&&typeof value.text==='string')setTransition(value.text.slice(0,240));
        if(event==='route'&&!run.stopping)setRunStatus(value.fallback==='advanced-not-local'?'本地模型正在回答':value.fallback?'快速模型正在回答':value.tier==='advanced'?'高级模型正在整理':'快速模型正在回应');
        if (event === 'error') setError(runError);
        if (event === 'status' && !run.stopping) setRunStatus(value.state === 'retrying' ? '正在重试模型请求' : value.state === 'compacting' ? '正在整理会话上下文' : value.state === 'settled' ? '正在保存回答' : '正在整理回答');
        if (event === 'tool' && !run.stopping) setRunStatus(value.state === 'failed' ? '记录查询没有完成' : value.state === 'complete' ? '继续整理回答' : `正在查询${toolLabels[String(value.name)] || '平台记录'}`);
      });
    } catch (cause) { transportError = cause instanceof Error ? cause.message : '会话连接没有完成'; if (valid(token)) setError(transportError); }
    finally {
      if (active.current === run) active.current = null;
      if (valid(token)) {
        const unknownSaving = !receivedDone || !persisted;
        if (streamed && unknownSaving) setUnsaved(old => [...old, { id: crypto.randomUUID(), conversationId: run.conversationId,
          text: streamed, reason: receivedDone ? '回答未保存，请复制保留。' : '连接中断，尚未确认回答是否保存。' }]);
        if (!userSaved && !streamed && transportError) setDraft(old => old || text);
        setBusy(false); setRunStatus(''); setPendingPrompt(''); setPartial('');setTransition('');
        setPhase(outcome === 'complete' && persisted ? 'answered' : 'interrupted');
        try { if (run.conversationId) await loadHistory(run.conversationId, false); }
        catch { if (mounted.current) setError('会话记录暂时无法读取；请先保留已收到的文字。'); }
        if (valid(token) && outcome === 'complete' && persisted && streamed && autoReadRef.current && !run.stopping) speech.speak(streamed);
        if (valid(token) && outcome === 'failed' && !runError && !transportError) setError('这次回答生成失败，可核对记录后重试。');
      }
    }
  }
  async function interrupt() {
    stopVoice();
    const run = active.current;
    if (!run) { setPhase('interrupted'); setRunStatus(''); return; }
    if (run.stopping) return;
    run.stopping = true; setRunStatus('正在请求停止，等待会话确认');
    try {
      if (run.conversationId) await post(`/chat/conversations/${encodeURIComponent(run.conversationId)}/abort`, {});
      if (mounted.current && active.current === run) setRunStatus('停止请求已提交，等待回答结束');
    } catch (cause) {
      run.stopping = false;
      if (mounted.current) setError(`${cause instanceof Error ? cause.message : '停止请求未确认'}；回答仍可能在进行，请再次打断。`);
    }
  }
  async function startMicrophone() {
    if (!micConsent || busy || creating) return;
    stopVoice(); const turn=++microphoneTurn.current, token=generation.current;
    setError(''); setMicActive(true); setPhase('listening'); setModal('');
    const text=await speech.listen();
    if (turn!==microphoneTurn.current || !valid(token)) return;
    setMicActive(false); setPhase('ready');
    if(text){setDraft(text.slice(0,16000));setPromptNotice('中央识别文字已填入，核对后由你发送。');}
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); if (mounted.current) setCopyStatus('文字已复制'); }
    catch { if (mounted.current) setCopyStatus('复制未完成，请选中文字手动复制。'); }
  }
  const latest = messages.filter(message => message.role === 'assistant' && !!message.content).at(-1);
  const title = stateText[phase];
  const caption = micActive ? draft : partial || transition || latest?.content || '“贾维斯，今天我们聊些什么？”';
  const recoveries = unsaved.filter(answer => answer.conversationId === conversationId);
  if (!enabled) return <div className="pi-family-gate"><Icon name="lock" size={38}/><h2>进入家人的语音空间</h2><p>这里是管理者对话。家人请从房间入口，用自己的密码或PIN登录。</p><a className="d-btn" href="/?mode=room">打开房间入口</a></div>;
  return <div className="fa-chat-page pi-chat">
    {!immersive && <header className="fa-heading"><div><span className="eyebrow">JARVIS / PI COMPANION</span><h1>与贾维斯对话</h1><p>聊生活、练语言，也可查询真实项目与经验。</p></div><div className="fa-actions"><Tag tone={chatSettings?.configured ? 'online' : 'blocked'}>{loading ? '读取连接' : chatSettings?.configured ? '真实 Pi 会话' : '模型待配置'}</Tag><Button kind="ghost" onClick={() => setImmersive(true)}><Icon name="expand"/>沉浸全屏</Button></div></header>}
    <section className={`fa-chat-terminal ${immersive ? 'fa-immersive' : ''}`} data-phase={phase} aria-label="真实贾维斯对话空间">
      <div className="fa-chat-stage"><ThemeStage theme={theme} phase={phase}/><div className="fa-scene-top"><span className="eyebrow">JARVIS / REAL CONVERSATION</span><span className="fa-stage-light"><i/>{micActive ? '浏览器麦克风已开启' : busy ? 'Pi 正在处理' : '管理者专属会话'}</span></div>
        <div className="fa-scene-identity"><span>{ownerName}的贾维斯</span><h2>{title.title}</h2><p>{runStatus || title.detail}</p><div className={`fa-wave ${['listening', 'thinking', 'speaking'].includes(phase) ? 'active' : ''}`} aria-hidden="true">{Array.from({ length: 55 }, (_, i) => <i key={i} style={{ height: `${8 + Math.abs(Math.sin(i * .55)) * 22}px`, animationDelay: `${i * .035}s` }}/>)}</div></div>
        <div className="fa-live-caption"><small>{micActive ? '识别文字 · 待发送' : partial ? '正在回答' : '此刻的话'}</small><p>{caption.slice(-420)}</p></div><div className="fa-scene-bottom"><span>{chatSettings?.provider || 'Pi'} · {chatSettings?.model || '等待配置'}</span><span>{micActive ? '录音由浏览器处理' : '查询工具只读 · 操作由你确认'}</span></div></div>
      <aside className="fa-chat-controls"><header><div><small className="eyebrow">CONVERSATION</small><h2>此刻的对话</h2></div><button className="icon-button" aria-label={immersive ? '退出沉浸全屏' : '进入沉浸全屏'} onClick={() => setImmersive(!immersive)}><Icon name="expand"/></button></header>
        <div className="pi-session-picker"><label>我的会话<select aria-label="选择真实会话" value={conversationId} disabled={busy || creating || loading} onChange={event => { stopVoice(); setError(''); setCopyStatus(''); currentId.current = event.target.value; setConversationId(event.target.value); }}><option value="">新会话</option>{conversations.map(session => <option key={session.id} value={session.id}>{session.title || '未命名会话'}</option>)}</select></label><button className="pi-small-button" onClick={() => void createSession()} disabled={busy || creating || loading}>{creating ? '创建中' : '＋'}</button></div>
        <div className="fa-chat-modes" aria-label="选择讨论场景">{prompts.map(item => <button key={item.id} disabled={busy || micActive} className={mode === item.id ? 'selected' : ''} onClick={() => { stopVoice(); setMode(item.id); setDraft(item.text); setPromptNotice('问题已填入，由你决定发送。'); }}><Icon name={item.icon} size={14}/>{item.label}</button>)}</div>
        {!chatSettings?.configured && !loading && <div className="pi-setup"><strong>先配置对话模型</strong><p>不会用示例答案代替模型回答。</p><Button onClick={() => setModal('model')}>配置 Pi 模型</Button></div>}
        <div className="fa-conversation" ref={conversationBox} role="log" aria-label="真实会话记录" aria-live="polite">
          {historyLoading && <p className="pi-note">正在读取会话记录…</p>}
          {!historyLoading && !messages.length && !pendingPrompt && !recoveries.length && <Empty title="从一句话开始" detail="选择一个场景，或写下想讨论的问题。"/>}
          {messages.map(message => <article className={`fa-message ${message.role === 'user' ? 'user' : ''}`} key={message.id}><header><strong>{message.role === 'user' ? ownerName : 'JARVIS'}</strong><time>{dateLabel(message.createdAt)}</time></header><p>{message.content || (message.status === 'cancelled' ? '本次回答已取消，没有生成文字。' : '本次回答没有生成文字。')}</p>{message.role==='assistant'&&<AnswerLinks text={message.content}/>} {message.role === 'assistant' && <footer className="pi-message-footer"><span className={`pi-answer-status ${message.status}`}>{message.status === 'cancelled' ? '已取消' : message.status === 'failed' ? '未完成' : '已保存'}</span>{message.content && <button onClick={() => void copy(message.content)}>复制</button>}</footer>}</article>)}
          {pendingPrompt && <article className="fa-message user pi-pending"><header><strong>{ownerName}</strong><span>本次发送</span></header><p>{pendingPrompt}</p></article>}
          {busy && <article className="fa-message pi-stream"><header><strong>JARVIS</strong><span>{runStatus || '正在回答'}</span></header><p>{partial || transition || '正在整理你的问题…'}</p>{transition&&!partial&&<small>等待回复 · 完整回答随后展示</small>}</article>}
          {recoveries.map(answer => <article className="fa-message pi-recovery" key={answer.id}><header><strong>收到的文字</strong><span>保存未确认</span></header><p>{answer.text}</p><small>{answer.reason}</small><button onClick={() => void copy(answer.text)}>复制保留</button></article>)}<div ref={end}/>
        </div>
        <div className="fa-chat-actionbar"><button onClick={() => void createSession()} disabled={busy || creating}>新会话</button><button onClick={() => setModal('history')}>会话记录</button><button onClick={() => setModal('intent')} disabled={busy||micActive||!chatSettings?.configured}>理解任务</button><button onClick={() => setModal('model')} disabled={busy}>模型配置</button><button onClick={() => setModal('scope')}>权限与留存</button></div>
        <div className="fa-chat-voice"><Button kind="ghost" disabled={busy || creating || loading || (micActive && !speech.listening)} onClick={() => micActive ? speech.finishListening() : setModal('microphone')}><Icon name="mic"/>{micActive ? (speech.listening?'结束这一句':'识别处理中') : '开始说话'}</Button><Button kind="ghost" disabled={!busy && !micActive && !speech.busy} onClick={() => void interrupt()}><Icon name="stop"/>打断</Button></div>
        <div className="fa-compose"><textarea rows={2} maxLength={16000} value={draft} aria-label="和真实贾维斯交流" placeholder="输入文字，Enter 发送" onChange={event => { setDraft(event.target.value); setPromptNotice(''); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}/><div><span>{promptNotice || (busy ? '回答结束后可继续' : '场景问题由你确认发送')}</span><button className="fa-send" aria-label="发送真实消息" disabled={!draft.trim() || busy || loading || creating || historyLoading || micActive || !chatSettings?.configured} onClick={() => void send()}><Icon name="arrow"/></button></div></div>
        <div className="fa-chat-audio"><button disabled={!latest || busy} onClick={() => { if (speech.speaking) speech.stop(); else if (latest) speech.speak(latest.content); }}><Icon name={speech.speaking ? 'stop' : 'headphones'} size={14}/>{speech.speaking ? '停止朗读' : '中央朗读'}</button><button onClick={() => { setAutoRead(value => !value); if (autoRead) speech.stop(); }}>{autoRead ? '回答后自动朗读' : '开启本次朗读'}</button></div>
        {(error || speech.speechError) && <div className="pi-error" role="alert">{error || speech.speechError}{error && !busy && <button onClick={() => void initialize()}>重新读取连接</button>}</div>}{copyStatus && <p className="pi-copy-status" role="status">{copyStatus}</p>}
        <CentralVoicePermission speech={speech}/><small className="fa-chat-disclosure">中央语音 · 录音在服务器识别，文字核对后发送；安静时间、语音预算与音频保留按本人策略执行。</small>
      </aside>
    </section>
    {modal === 'model' && <Dialog title="连接 Pi 对话模型" wide onClose={() => setModal('')}><PiModelSettings onChange={async () => { await refreshSettings(); await onConfigurationChange?.(); }}/></Dialog>}
    {modal === 'intent' && <Dialog title="理解意图 · 由你确认" wide onClose={()=>setModal('')}><VoiceIntentPanel initialText={draft} onChat={text=>{setDraft(text);setPromptNotice('对话内容已带入，由你发送。');setModal('')}}/></Dialog>}
    {modal === 'history' && <Dialog title="我的真实会话记录" wide onClose={() => setModal('')} footer={<Button kind="ghost" onClick={() => setModal('')}>关闭</Button>}><div className="fa-history-list">{messages.map(message => <article key={message.id}><small>{message.role === 'user' ? ownerName : 'JARVIS'} · {dateLabel(message.createdAt)} · {message.status === 'complete' ? '已保存' : message.status === 'cancelled' ? '已取消' : '未完成'}</small><p>{message.content || '没有生成文字'}</p></article>)}{!messages.length && <Empty title="这段会话尚无已保存记录"/>}</div><p className="pi-note">记录按本人文字保留策略清理；家人从房间入口独立登录。</p></Dialog>}
    {modal === 'microphone' && <Dialog title="中央语音输入" onClose={() => setModal('')} footer={<><Button kind="ghost" onClick={() => setModal('')}>取消</Button><Button disabled={!micConsent || busy} onClick={()=>void startMicrophone()}>开启麦克风</Button></>}><p>录音交给已配置中央引擎识别，点击“结束这一句”后核对文字。不会自动发送。</p><label className="pi-consent"><input type="checkbox" checked={micConsent} onChange={event => setMicConsent(event.target.checked)}/>允许本次使用麦克风</label><CentralVoicePermission speech={speech}/><p className="pi-note">原始音频按本人保存策略处理；云端引擎需符合本人隐私偏好。</p>{error && <p className="pi-error" role="alert">{error}</p>}</Dialog>}
    {modal === 'scope' && <Dialog title="会话权限与留存" onClose={() => setModal('')} footer={<Button kind="ghost" onClick={() => setModal('')}>我知道了</Button>}><dl className="pi-scope-list"><div><dt>当前身份</dt><dd>已登录的管理者。切换档案不会获得其他家人的真实身份。</dd></div><div><dt>记录保存</dt><dd>文字与Pi会话按本人保留策略定期清理。长期记忆在记忆神殿确认、修订和遗忘。</dd></div><div><dt>工具范围</dt><dd>只读查询真实项目、设备、任务、经验、收件、研究、交付、已发布知识、本人已确认记忆、家庭共同待办及服务台账。派发、发布、验收和记忆保存由你在对应页面确认。</dd></div><div><dt>声音入口</dt><dd>本页连接中央ASR/TTS。其他房间从配对入口使用；常驻唤醒可连接本地桥，默认ASR词匹配需要实际声学测试。</dd></div></dl></Dialog>}
  </div>;
}

export default PiChat;

