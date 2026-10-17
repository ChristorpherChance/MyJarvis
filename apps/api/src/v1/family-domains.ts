import { BusinessError, type BusinessRecord, type CommandContext, type DomainHandler } from './types.js';
import { familyLearningRecord } from './knowledge-domains.js';
import { randomUUID } from 'node:crypto';
import {forgetMemoryLineage,memoryLineageRecords} from './memory-maintenance.js';

type Values = Record<string, any>;
const ensure = (condition: unknown, message: string, code = 'VALIDATION', status = 400): void => { if (!condition) throw new BusinessError(code, message, status); };
const text = (value: unknown, label: string, max = 4000): string => { ensure(typeof value === 'string' && !!value.trim() && value.length <= max, `${label}不能为空或过长`); return (value as string).trim(); };
const optional = (value: unknown, label: string, max = 4000): string => value === undefined || value === null || value === '' ? '' : text(value, label, max);
const choice = (value: unknown, allowed: readonly string[], label: string): string => { ensure(typeof value === 'string' && allowed.includes(value), `${label}无效`); return value as string; };
const creating = (ctx: CommandContext): void => ensure(ctx.expectedVersion === 0, '新记录的修订版本必须为0', 'CONFLICT', 409);
const privateOnly = (ctx: CommandContext): void => ensure(ctx.scope === 'private', '个人记忆、健康备忘和专属设置仅允许private范围', 'FORBIDDEN', 403);
const currentProfile = (value: unknown): string => { ensure(value === undefined || value === 'me', '档案选择不能代替本人认证；本接口仅管理当前已登录身份', 'FORBIDDEN', 403); return 'me'; };
const date = (value: unknown, label: string): string | null => { if (value === undefined || value === null || value === '') return null; const input = text(value, label, 100); ensure(!Number.isNaN(Date.parse(input)), `${label}无效`); return new Date(input).toISOString(); };
const history = (record: Values, ctx: CommandContext, event: string) => [...(record.history ?? []), { at: ctx.now, event, actorId: ctx.actorId }];
function primary(ctx: CommandContext, domain: DomainHandler['domain'], id: unknown, kind?: string): BusinessRecord {
  const record = ctx.require(domain, text(id, '记录ID', 200), true); ctx.check(record);
  ensure(record.profileId === 'me', '记录不属于当前已登录身份', 'FORBIDDEN', 403);
  if (kind) ensure(record.kind === kind, '记录类型与操作不一致');
  return record;
}
function upsert(ctx: CommandContext, domain: 'memory' | 'personas', kind: string, patch: Values, profileId = 'me'): BusinessRecord {
  const existing = ctx.list(domain).find(record => record.ownerId === ctx.actorId && record.scope === ctx.scope && record.profileId === profileId && record.kind === kind);
  if (existing) { ctx.check(existing); return ctx.update(domain, existing.id, { ...patch, updatedAt: ctx.now }); }
  creating(ctx); return ctx.create(domain, { kind, profileId, ...patch, createdAt: ctx.now, updatedAt: ctx.now });
}

const family: DomainHandler = {
  domain: 'family', commands: ['todo', 'health-note', 'learning'],
  execute(command, payload, ctx) {
    const p = payload; currentProfile(p.profileId);
    if (command === 'todo') {
      ensure(ctx.scope === 'family', '共同待办仅允许family共享范围', 'FORBIDDEN', 403);
      const operation = choice(p.operation, ['create', 'complete', 'remove'], '待办操作');
      if (operation === 'create') {
        creating(ctx); const record = ctx.create('family', { kind: 'todo', profileId: 'me', text: text(p.text, '家庭安排', 240), done: false, dueAt: date(p.dueAt, '安排时间'), status: 'active', createdAt: ctx.now, updatedAt: ctx.now });
        ctx.emit('family', record.id, 'todo-created', { kind: 'todo' }); return record;
      }
      const item = primary(ctx, 'family', p.todoId, 'todo'); ensure(item.status !== 'removed', '这项安排已移除', 'REVIEW_REQUIRED', 422);
      if (operation === 'complete') {
        ensure(typeof p.completed === 'boolean', '请明确待办完成状态');
        const record = ctx.update('family', item.id, { done: p.completed, updatedAt: ctx.now }); ctx.emit('family', item.id, p.completed ? 'todo-completed' : 'todo-reopened'); return record;
      }
      const record = ctx.update('family', item.id, { text: null, dueAt: null, status: 'removed', removedAt: ctx.now, updatedAt: ctx.now });
      ctx.redactReceipts('family', item.id, record); ctx.emit('family', item.id, 'todo-removed'); return record;
    }
    if (command === 'health-note') {
      privateOnly(ctx); const operation = choice(p.operation, ['create', 'edit', 'forget'], '私人备忘操作');
      if (operation === 'create') {
        creating(ctx); const record = ctx.create('family', { kind: 'health-note', profileId: 'me', text: text(p.text, '私人备忘', 2000), context: optional(p.context, '问题补充', 1000), status: 'active', createdAt: ctx.now, updatedAt: ctx.now });
        ctx.emit('family', record.id, 'health-note-created', { kind: 'health-note' }); return record;
      }
      const item = primary(ctx, 'family', p.noteId, 'health-note'); ensure(item.status === 'active', '这份私人备忘已移除', 'REVIEW_REQUIRED', 422);
      if (operation === 'edit') {
        const record = ctx.update('family', item.id, { text: text(p.text, '私人备忘', 2000), context: optional(p.context, '问题补充', 1000), updatedAt: ctx.now }); ctx.emit('family', item.id, 'health-note-edited'); return record;
      }
      const record = ctx.update('family', item.id, { text: null, context: '', status: 'forgotten', forgottenAt: ctx.now, updatedAt: ctx.now });
      ctx.redactReceipts('family', item.id, record); ctx.emit('family', item.id, 'health-note-forgotten'); return record;
    }
    if (command === 'learning') {
      privateOnly(ctx); currentProfile(p.profile);
      const lessonId = text(p.lessonId, '学习课次ID', 200);
      ensure(!ctx.list('learning').some(record => record.kind === 'practice' && record.lessonId === lessonId), '这次练习已经记录', 'CONFLICT', 409);
      const record = familyLearningRecord(ctx, { ...p, type: p.type === 'subject' ? 'science' : p.type, rounds: p.rounds ?? [] });
      return ctx.update('learning', record.id, { lessonId });
    }
    throw new BusinessError('VALIDATION', '家庭命令不存在');
  }
};

const memory: DomainHandler = {
  domain: 'memory', commands: ['candidate', 'confirm', 'edit', 'reject', 'forget', 'policy', 'export'],
  execute(command, p, ctx) {
    privateOnly(ctx); currentProfile(p.profileId);
    if (command === 'candidate') {
      creating(ctx); const record = ctx.create('memory', { kind: 'memory', profileId: 'me', text: text(p.text, '记忆内容', 1200), category: text(p.category, '记忆类别', 60), source: text(p.source, '来源', 300), status: 'candidate', nextReviewAt: date(p.nextReviewAt, '复核时间'), confirmedAt: null, createdAt: ctx.now, updatedAt: ctx.now, history: [{ at: ctx.now, event: 'candidate-created', actorId: ctx.actorId }] });
      ctx.emit('memory', record.id, 'candidate-created', { status: 'candidate' }); return record;
    }
    if (command === 'policy') {
      const policy = { textRetention: choice(p.textRetention, ['7', '30', 'forever', 'never'], '文字留存'), audioRetention: choice(p.audioRetention, ['never', 'session', '7'], '音频留存'), longTerm: choice(p.longTerm, ['confirm', 'explicit', 'auto'], '长期记忆策略') };
      const record = upsert(ctx, 'memory', 'policy', { text: null, category: '保存策略', status: 'policy', source: null, policy, effective: policy, cleanupStatus: 'configured', note: '文字清理同时删除本人的聊天正文与Pi会话；已选记忆和历史备份独立保留。候选策略每四轮本人原话自动分析；explicit仅主动触发，auto按本人策略自动确认。' });
      ctx.emit('memory', record.id, 'policy-configured', { cleanupStatus: 'configured' }); return record;
    }
    if (command === 'export') {
      creating(ctx); ensure(p.format === 'json', '仅支持JSON导出'); ensure(p.includeCandidates === undefined || typeof p.includeCandidates === 'boolean', '候选导出选项无效');
      const count = ctx.list('memory').filter(r => r.kind === 'memory' && (r.status === 'active' || (p.includeCandidates === true && r.status === 'candidate'))).length;
      // Never retain a plaintext export snapshot in a durable idempotency receipt.
      const record = ctx.create('memory', { kind: 'export-receipt', profileId: 'me', text: null, category: '导出记录', status: 'exported', source: null, format: 'json', includeCandidates: p.includeCandidates === true, count, createdAt: ctx.now, updatedAt: ctx.now, note: '浏览器重新鉴权读取当前记录后生成JSON；服务器仅保存导出元数据。' });
      ctx.emit('memory', record.id, 'export-requested', { count }); return record;
    }
    ensure(['confirm', 'edit', 'reject', 'forget'].includes(command), '记忆命令不存在');
    const item = primary(ctx, 'memory', p.memoryId, 'memory');
    if (command === 'confirm') {
      ensure(item.status === 'candidate' && item.text, '只有尚未确认的候选可以确认', 'REVIEW_REQUIRED', 422); ensure(p.confirmed === true, '需要明确确认内容准确');
      const record = ctx.update('memory', item.id, { status: 'active', confirmedAt: ctx.now, history: history(item, ctx, 'confirmed'), updatedAt: ctx.now }); ctx.emit('memory', item.id, 'confirmed', { status: 'active' }); return record;
    }
    if (command === 'edit') {
      ensure(['active', 'candidate'].includes(item.status), '拒绝或遗忘的记忆不能恢复', 'REVIEW_REQUIRED', 422); ensure(p.confirmed === true, '请明确确认修订表达准确');
      const record = ctx.update('memory', item.id, { text: text(p.text, '记忆内容', 1200), ...(p.category !== undefined ? { category: text(p.category, '类别', 60) } : {}), ...(p.nextReviewAt !== undefined ? { nextReviewAt: date(p.nextReviewAt, '复核时间') } : {}), status: 'active', confirmedAt: ctx.now, history: history(item, ctx, 'edited-confirmed'), updatedAt: ctx.now });
      ctx.emit('memory', item.id, 'edited', { status: 'active' }); return record;
    }
    if (command === 'reject') {
      ensure(item.status === 'candidate', '只有候选记忆可拒绝', 'REVIEW_REQUIRED', 422); text(p.reason, '拒绝理由');
      const record = ctx.update('memory', item.id, { status: 'rejected', history: history(item, ctx, 'rejected'), updatedAt: ctx.now }); ctx.emit('memory', item.id, 'rejected', { status: 'rejected' }); return record;
    }
    ensure(['active', 'candidate', 'rejected', 'merged'].includes(item.status), '记忆已遗忘，不能恢复或重复修改', 'REVIEW_REQUIRED', 422); text(p.reason, '遗忘理由');
    ensure(memoryLineageRecords(ctx.list('memory'),item.id).length===1,'合并关联记忆须重新读取完整范围并明确确认遗忘','REVIEW_REQUIRED',422);
    return forgetMemoryLineage(ctx,item);
  }
};

function personaPatch(command: string, p: Values): Values {
  const patch: Values = {};
  if (['voice', 'preference', 'save', 'reply-language'].includes(command) && p.replyLanguage !== undefined) patch.replyLanguage = choice(p.replyLanguage, ['auto', 'zh', 'en', 'fr', 'de'], '回复语言');
  if (command === 'reply-language') ensure(p.replyLanguage !== undefined, '请明确回复语言');
  if (['voice', 'save'].includes(command)) { patch.voiceId = choice(p.voiceId, ['clear', 'warm', 'calm'], '声音'); patch.language = choice(p.language, ['中文', '英语', '日语', '法语', '德语', '西班牙语'], '语言'); patch.pace = choice(p.pace, ['slow', 'normal', 'fast'], '语速'); }
  if (['wake-word', 'save'].includes(command)) patch.wakeWord = text(p.wakeWord, '唤醒词', 20);
  if (['preference', 'save'].includes(command)) {
    patch.address = text(p.address, '称呼', 30); patch.replyStyle = choice(p.replyStyle, ['清晰自然', '简洁温和', '轻松幽默', '循序引导'], '交流风格'); patch.cloudPrivacy = choice(p.cloudPrivacy, ['ask', 'local', 'allowed'], '云端偏好');
    if (p.dailyVoiceMinutes !== undefined) { ensure(typeof p.dailyVoiceMinutes === 'number' && Number.isFinite(p.dailyVoiceMinutes) && p.dailyVoiceMinutes >= 1 && p.dailyVoiceMinutes <= 300, '语音预算需为1至300分钟'); patch.dailyVoiceMinutes = p.dailyVoiceMinutes; }
    if (p.autoSpeak !== undefined) { ensure(typeof p.autoSpeak === 'boolean', '自动朗读选项无效'); patch.autoSpeak = p.autoSpeak; }
  }
  if (['quiet-hours', 'save'].includes(command)) {
    ensure(typeof p.start === 'string' && typeof p.end === 'string', '安静时间须填写开始与结束，或同时留空');
    patch.quietStart = p.start; patch.quietEnd = p.end;
    ensure((p.start === '' && p.end === '') || (/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.end)), '安静时间须完整有效，或同时留空关闭');
    patch.timezone = text(p.timezone, '时区', 100); try { new Intl.DateTimeFormat('en', { timeZone: patch.timezone }); } catch { throw new BusinessError('VALIDATION', '时区无效'); }
  }
  return patch;
}
const personas: DomainHandler = {
  domain: 'personas', commands: ['register', 'voice', 'wake-word', 'preference', 'quiet-hours', 'save', 'reply-language'],
  execute(command, p, ctx) {
    privateOnly(ctx);
    if (command === 'register') {
      creating(ctx); const id = randomUUID(), record = ctx.create('personas', { kind: 'profile', profileId: id, name: text(p.name, '成员姓名', 30), role: choice(p.role, ['adult', 'child', 'elder'], '家庭角色'), status: 'registered', authentication: 'not-configured', note: '管理员登记的家庭档案；未建立成员登录凭证，不代表成员本人认证。', createdAt: ctx.now, updatedAt: ctx.now }, id);
      ctx.emit('personas', id, 'profile-registered', { role: record.role, authentication: 'not-configured' }); return record;
    }
    const profileId = text(p.profileId, '成员档案', 200); ensure(profileId !== 'public', '公共空间不保存个人设置', 'FORBIDDEN', 403);
    ensure(profileId === 'me' || (typeof ctx.member === 'function' && !!ctx.member(profileId)), '成员未在服务器登记，不能凭客户端档案别名建立身份', 'FORBIDDEN', 403);
    ensure(this.commands.includes(command), '专属设置命令不存在');
    const record = upsert(ctx, 'personas', 'persona', { ...personaPatch(command, p), authentication: 'administrator-managed-profile', voiceStatus: 'runtime-managed', wakeStatus: 'runtime-managed', enforcementStatus: 'server-enforced', note: '中央语音、独立成员凭据与房间唤醒已实现；实际发声需要配置引擎，房间使用需要配对。档案不代替本人认证；安静时间与语音分钟由服务端执行。' }, profileId);
    ctx.emit('personas', record.id, 'configured', { command, wakeStatus: 'runtime-managed' }); return record;
  }
};

export const familyHandlers: DomainHandler[] = [family, memory, personas];
export const familyDtoNames = { family: 'FamilyRecord', memory: 'Memory', personas: 'Persona' } as const;
