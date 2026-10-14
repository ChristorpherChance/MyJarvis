import type { V1CollectionDomain, V1Record } from '../v1-client';
import {replyLanguagePreference} from '../features/family/conversation-language';

const labels: Record<string, string> = { 'candidate-created': '新候选，尚未用于个性化', confirmed: '本人明确确认记忆', 'edited-confirmed': '本人确认修订，旧表达停止使用', 'policy-auto-confirmed':'按本人授权的自动策略生效', rejected: '本人拒绝候选', forgotten: '正文、来源及旧回执正文已移除；原聊天与收件单独管理' };
const displayTime = (value: unknown) => typeof value === 'string' ? value.replace('T', ' ').slice(0, 16) : '';

/** Only persisted, authenticated records and registered S0 members; no demonstration seed. */
export function projectLiveFamily(records: Partial<Record<V1CollectionDomain, V1Record[]>>, bootstrap: any) {
  const members: any[] = Array.isArray(bootstrap?.members) ? bootstrap.members : [];
  const profiles = members.map(member => ({ id: member.id === 'owner' ? 'me' : member.id, name: member.name, avatar: String(member.name || '家').slice(0, 1), caption: member.id === 'owner' ? '已认证管理员本人' : '管理档案 · 房间需独立验证', admin: member.id === 'owner' }));
  for (const registered of records.personas ?? []) if (registered.kind === 'profile' && registered.status === 'registered' && registered.scope === 'private' && !profiles.some(profile => profile.id === registered.id)) profiles.push({ id: registered.id, name: registered.name, avatar: String(registered.name || '家').slice(0, 1), caption: '已登记 · 可配置独立身份', admin: false });
  if (!profiles.some(profile => profile.id === 'me')) profiles.unshift({ id: 'me', name: '我', avatar: '我', caption: '已认证管理员本人', admin: true });
  profiles.push({ id: 'public', name: '公共空间', avatar: '共', caption: '仅展示共享内容', admin: false });
  const preferences: Record<string, any> = {};
  for (const profile of profiles) {
    if (profile.id === 'public') continue;
    const member = members.find(m => m.id === (profile.id === 'me' ? 'owner' : profile.id));
    const persona = records.personas?.find(r => r.kind === 'persona' && r.profileId === profile.id && r.scope === 'private');
    preferences[profile.id] = { address: persona?.address ?? member?.name ?? profile.name ?? '', voice: persona?.voiceId ?? member?.voice ?? '', wakeword: persona?.wakeWord ?? member?.wakeWord ?? '', language: persona?.language ?? '中文', replyLanguage: replyLanguagePreference({replyLanguage:persona?.replyLanguage??member?.preferences?.replyLanguage}), pace: ({ slow: '较慢', normal: '正常', fast: '较快' } as Record<string, string>)[String(persona?.pace)] ?? '正常', replyStyle: persona?.replyStyle ?? '', privacy: persona?.cloudPrivacy ?? 'ask', quietStart: persona?.quietStart ?? '', quietEnd: persona?.quietEnd ?? '', dailyVoice: persona?.dailyVoiceMinutes ?? 30, autoSpeak: persona?.autoSpeak ?? false, timezone: persona?.timezone ?? 'Asia/Shanghai', revision: persona?.revision ?? 0, configured: !!persona, wakeStatus: 'room-bridge-or-asr-phrase' };
  }
  const memoryRecords = (records.memory ?? []).filter(r => r.scope === 'private' && r.profileId === 'me');
  const memory = memoryRecords.filter(r => r.kind === 'memory').map(r => ({ ...r, text: r.text ?? '', owner: 'me', profile: 'me', source: r.source ?? (r.status === 'forgotten' ? '已遗忘' : ''), expires: r.nextReviewAt ? String(r.nextReviewAt).slice(0, 10) : '', created: displayTime(r.createdAt), confidence: r.status === 'active' ? ((r.history as any[])?.some(event=>event.event==='policy-auto-confirmed')?'按本人自动策略生效':'本人明确确认') : r.status === 'candidate' ? '待本人确认' : '停止用于个性化', history: ((r.history as any[]) || []).map(event => ({ time: displayTime(event.at), text: labels[event.event] ?? '状态已更新' })) }));
  const savedPolicy = memoryRecords.find(r => r.kind === 'policy');
  const effective=(savedPolicy?.effective??savedPolicy?.policy) as any;
  const policy = savedPolicy ? { text: effective.textRetention, audio: effective.audioRetention, longterm: effective.longTerm, configured: true, revision: savedPolicy.revision, requested: { text: (savedPolicy.policy as any)?.textRetention, audio: (savedPolicy.policy as any)?.audioRetention, longterm: (savedPolicy.policy as any)?.longTerm }, cleanupStatus: savedPolicy.cleanupStatus, note: savedPolicy.note } : { text: 'forever', audio: 'never', longterm: 'explicit', configured: true, revision: 0, cleanupStatus: 'scheduled', note: '默认文字持续保留、原始音频不保存。自动整理需先保存本人策略；也可主动选择会话分析。' };
  const family = records.family ?? [];
  return { profiles, preferences, familyTodos: family.filter(r => r.kind === 'todo' && r.scope === 'family' && r.status !== 'removed').map(r => ({ ...r, owner: r.profileId ?? 'me', dueAt: r.dueAt ?? '', done: r.done === true })), vm: { memories: { me: memory }, policies: { me: policy }, privateNotes: family.filter(r => r.kind === 'health-note' && r.scope === 'private' && r.profileId === 'me' && r.status === 'active').map(r => ({ ...r, owner: 'me', profile: 'me', created: displayTime(r.createdAt), time: displayTime(r.createdAt) })) } };
}
