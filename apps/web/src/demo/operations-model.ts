import type { DemoData, DemoRecord } from './types';
import { admin, find, requireThat, stamp, textRequired, uid, visible } from './model';
const pick = (v: any, keys: string[]) => Object.fromEntries(keys.filter(k => v[k] !== undefined).map(k => [k, v[k]]));
const strings = (v: any): string[] => Array.isArray(v) ? v.map(String) : [];
const terminal = new Set(['completed', 'cancelled']);
function num(v: any, min: number, max: number, label: string) { const n = Number(v); requireThat(Number.isFinite(n) && n >= min && n <= max, label + '超出允许范围'); return n; }
function scope(d: DemoData, v: any) { const s = String(v ?? (d.profile === 'me' ? 'personal' : 'private')); requireThat(['personal', 'company', 'family', 'private'].includes(s), '可见范围无效'); if (d.profile !== 'me')
    requireThat(['family', 'private'].includes(s), '家人只能保存本人或家庭资料'); if (d.profile === 'public')
    requireThat(s === 'family', '公共空间不能创建私人资料'); return s; }
function writable(d: DemoData, r: DemoRecord) { requireThat(visible(d, r), '无权访问此记录'); requireThat(d.profile === 'me' || r.owner === d.profile, '只能修改本人创建的记录'); }
const normalized = (v: any) => String(v || '').toLowerCase().replace(/[\s，。！？、,.!?;；:：]/g, '');
export function operationsAction(d: DemoData, type: string, p: any) {
    if (!['op.inbox', 'op.experience'].includes(type))
        admin(d);
    const ops = d.v5.ops, r = d.v5.research, cmd = p.command, patch = p.patch ?? {};
    const say = (s: string) => { d.lastNotice = s; };
    const event = (text: string) => { ops.events ??= []; ops.events.unshift({ time: stamp(), text }); say(text); };
    const cost = () => d.tasks.reduce((n, t) => n + Number(t.cost || 0), 0) + r.items.reduce((n: number, x: any) => n + Number(x.cost || 0), 0);
    const log = (t: DemoRecord, text: string) => { t.log ??= []; t.log.push(`${stamp()} ${text}`); t.updated = stamp(); say(text); };
    const rlog = (it: DemoRecord, text: string) => { it.timeline ??= []; it.timeline.push({ text, time: stamp() }); it.updated = stamp(); say(text); };
    function taskCreate(v: any) { find(d.projects, v.project, '项目'); const m = find(d.machines, v.machine, '设备'); requireThat(['managed', 'observe'].includes(v.mode), '监督方式无效'); requireThat(v.mode === 'observe' || !m.readOnly, '公司设备仅允许只读跟踪'); if (v.dependsOn)
        requireThat(find(d.tasks, v.dependsOn).project === v.project, '前置任务须属于同一项目'); return { id: uid('task'), ...pick(v, ['project', 'machine', 'agent', 'mode', 'worktree', 'session', 'milestone', 'dependsOn']), title: textRequired(v.title, '任务名称'), goal: textRequired(v.goal, '目标'), criteria: textRequired(v.criteria, '验收标准'), budget: num(v.budget, 1, 10000, '预算'), retryLimit: num(v.retryLimit ?? d.settings.retryLimit, 0, 8, '重试上限'), status: v.mode === 'observe' ? 'paused' : 'queued', progress: 0, step: 0, cost: 0, retries: 0, skills: strings(v.skills), skillRefs: [], lease: null, log: ['模拟任务已登记，等待手动启动'], artifacts: [], tests: '尚未验证', updated: stamp() }; }
    function start(t: DemoRecord) { requireThat(t.mode === 'managed', '只读会话由本人控制'); requireThat(!d.settings.emergency && d.settings.supervise, '监督暂停或全局急停'); requireThat(['queued', 'paused', 'waitingResource', 'waitingQuota', 'waitingUser'].includes(t.status), '当前不能启动或恢复'); if (t.deadline && Date.parse(t.deadline) <= Date.now()) {
        t.status = 'waitingUser';
        t.lease = null;
        t.blockReason = '达到执行截止时间，请本人调整边界';
        log(t, t.blockReason);
        return;
    } if (t.dependsOn)
        requireThat(find(d.tasks, t.dependsOn).status === 'completed', '前置任务尚未交付'); const m = find(d.machines, t.machine); requireThat(!m.readOnly, '公司设备只读'); if (m.status !== 'online') {
        t.status = 'waitingResource';
        t.lease = null;
        t.blockReason = '等待执行节点上线';
        log(t, t.blockReason);
        return;
    } if (t.cost + 5 > t.budget || cost() + 5 > d.settings.dailyBudget) {
        t.status = 'waitingQuota';
        t.lease = null;
        t.blockReason = t.cost + 5 > t.budget ? '达到任务预算上限' : '达到每日预算';
        log(t, t.blockReason);
        return;
    } requireThat(!d.tasks.some(x => x.id !== t.id && x.mode === 'managed' && x.status === 'running' && x.project === t.project), '同项目已有托管任务持有执行租约'); requireThat(d.tasks.filter(x => x.mode === 'managed' && x.status === 'running').length < Number(ops.policy.batchLimit || 2), '达到托管任务并发上限'); t.status = t.resumePhase === 'validating' ? 'validating' : 'running'; t.blockReason = ''; t.lease = t.status === 'running' ? { id: uid('lease'), owner: t.agent, project: t.project, resource: t.machine, at: stamp() } : null; log(t, t.status === 'validating' ? '恢复待验收状态' : '取得模拟执行租约，继续原目标'); }
    function idea(v: any) { return { id: uid('research'), title: textRequired(v.title, '灵感标题'), raw: textRequired(v.raw ?? v.text, '原始想法'), owner: d.profile, scope: scope(d, v.scope), terminal: v.terminal || '网页记录', origin: v.origin || 'manual', created: stamp(), updated: stamp(), status: 'inbox', question: '', criteria: '', hypotheses: [], discussions: [], evidence: [], options: [], plan: { budget: 30, minutes: 30, retryLimit: 2, machine: d.machines.find(m => !m.readOnly)?.id }, cost: 0, minutes: 0, retries: 0, stage: 0, findings: '', decision: null, projectId: '', timeline: [] }; }
    function boundDeployment(dep: DemoRecord) { const s = find(ops.services, dep.service, '服务'); dep.host ??= s.host; dep.approval ??= d.approvals.find(a => a.deployment === dep.id)?.id; dep.events ??= []; dep.tests ??= []; return s; }
    function decision(dep: DemoRecord, approved: boolean, reason: any, confirmed = false) { const s = boundDeployment(dep), a = find(d.approvals, dep.approval, '审批'); requireThat(dep.status === 'requested' && a.status === 'pending', '部署请求已处理'); requireThat(!s.readonly, '公司服务只读'); if (approved) {
        requireThat(a.level !== 'L3' || confirmed, '生产部署须在审批页二次确认');
        requireThat(s.host === dep.host && s.environment === dep.environment && s.version === dep.previousVersion, '目标或版本变化，请重新申请');
        requireThat(dep.snapshot, '缺少变更前恢复点');
    } a.reason = textRequired(reason, '决定理由'); a.status = approved ? 'approved' : 'rejected'; a.receipt = approved ? '已批准，版本尚未更换。' : '已拒绝，服务状态未改变。'; dep.approved = approved; dep.status = approved ? 'ready' : 'rejected'; dep.events.push(`${stamp()} ${approved ? '批准' : '拒绝'}请求：${a.reason}`); }
    if (type === 'op.device') {
        if (cmd === 'create') {
            d.machines.push({ id: uid('device'), ...pick(patch, ['role', 'cpu', 'disk', 'gpu', 'os', 'kind', 'address', 'room', 'always']), name: textRequired(patch.name, '设备名称'), ram: num(patch.ram ?? 0, 0, 4096, '内存'), scope: 'personal', readOnly: false, status: 'unknown', cpuUse: 0, ramUse: 0, watts: 0, last: '未连接', events: [] });
            say('设备已登记，连接待接入');
            return;
        }
        const m = find(d.machines, p.id, '设备');
        m.events ??= [];
        if (cmd !== 'refresh')
            requireThat(!m.readOnly, '公司设备仅允许查看摘要');
        if (cmd === 'update') {
            Object.assign(m, pick(patch, ['name', 'role', 'cpu', 'ram', 'disk', 'gpu', 'os', 'kind', 'address', 'room', 'always']));
            m.events.unshift(stamp() + ' 更新登记资料');
        }
        else if (cmd === 'refresh') {
            m.last = stamp();
            m.events.unshift(stamp() + ' 刷新模拟快照');
        }
        else if (cmd === 'wake') {
            requireThat(d.settings.autoWake, '按需唤醒策略尚未开启');
            m.status = 'online';
            m.last = stamp();
            m.events.unshift(stamp() + ' 模拟唤醒，任务等待手动恢复');
        }
        else if (cmd === 'sleep' || cmd === 'fault') {
            requireThat(cmd === 'fault' || !m.always, '常驻设备不能休眠，可模拟连接故障');
            m.status = 'offline';
            m.cpuUse = 0;
            m.ramUse = 0;
            m.watts = 0;
            m.last = stamp();
            m.events.unshift(stamp() + ' 模拟离线');
            for (const t of d.tasks.filter(t => t.machine === m.id && ['running', 'validating'].includes(t.status))) {
                t.resumePhase = t.status;
                t.status = 'waitingResource';
                t.lease = null;
                t.blockReason = '节点离线，保留最近工作状态';
                log(t, t.blockReason);
            }
        }
        else
            throw new Error('设备命令无效');
        say('设备演示状态已更新');
        return;
    }
    if (type === 'op.project') {
        if (cmd === 'create') {
            d.projects.unshift({ id: uid('project'), ...pick(patch, ['desc', 'goal', 'repo', 'stage']), name: textRequired(patch.name, '项目名称'), scope: scope(d, patch.scope), progress: 0, doneMilestones: [], copies: patch.copies ?? [], milestones: strings(patch.milestones) });
            say('项目已登记');
            return;
        }
        const pr = find(d.projects, p.id, '项目');
        if (cmd === 'update') {
            Object.assign(pr, pick(patch, ['name', 'desc', 'goal', 'repo', 'scope', 'stage', 'environmentInfo', 'copies', 'milestones']));
            pr.doneMilestones = pr.doneMilestones.filter((i: number) => i < pr.milestones.length);
        }
        else if (cmd === 'milestone') {
            const i = num(p.milestoneId, 0, pr.milestones.length - 1, '里程碑');
            requireThat(Number.isInteger(i), '里程碑无效');
            pr.doneMilestones = pr.doneMilestones.filter((j: number) => j !== i);
            if (p.completed)
                pr.doneMilestones.push(i);
            pr.progress = Math.round(pr.doneMilestones.length / Math.max(1, pr.milestones.length) * 100);
        }
        else if (cmd === 'archive') {
            requireThat(!d.tasks.some(t => t.project === pr.id && ['running', 'validating', 'queued', 'waitingResource'].includes(t.status)), '先处理关联任务');
            pr.stage = '已归档';
        }
        else if (cmd === 'plan') {
            let dependsOn: string | undefined;
            for (let i = 0; i < pr.milestones.length; i++) {
                if (pr.doneMilestones.includes(i))
                    continue;
                const existing = d.tasks.find(t => t.project === pr.id && t.milestone === i && !terminal.has(t.status));
                if (existing) {
                    dependsOn = existing.id;
                    continue;
                }
                const t = taskCreate({ title: pr.milestones[i], project: pr.id, machine: patch.machine, agent: patch.agent, mode: 'managed', goal: pr.goal, criteria: `里程碑「${pr.milestones[i]}」通过验证并附交付证据`, budget: patch.budget, retryLimit: patch.retryLimit, dependsOn, milestone: i, skills: [] });
                d.tasks.push(t);
                dependsOn = t.id;
            }
        }
        else
            throw new Error('项目命令无效');
        say('项目与里程碑已更新');
        return;
    }
    if (type === 'op.task') {
        if (cmd === 'create') {
            d.tasks.unshift(taskCreate(patch));
            say('模拟开发任务已创建');
            return;
        }
        const t = find(d.tasks, p.id, '任务');
        requireThat(t.mode === 'managed', '只读会话由本人控制');
        if (cmd === 'start' || cmd === 'resume') {
            if (p.reason)
                log(t, '人工补充：' + textRequired(p.reason, '补充内容'));
            start(t);
        }
        else if (cmd === 'pause' || cmd === 'stop') {
            requireThat(!terminal.has(t.status), '任务已结束');
            if (cmd === 'pause')
                t.resumePhase = t.status === 'validating' ? 'validating' : 'running';
            t.status = cmd === 'pause' ? 'paused' : 'cancelled';
            t.lease = null;
            log(t, (cmd === 'pause' ? '任务暂停' : '任务停止') + '，释放执行租约' + (p.reason ? '：' + p.reason : ''));
        }
        else if (cmd === 'retry') {
            requireThat(!d.settings.emergency, '全局急停');
            requireThat(['failed', 'blocked'].includes(t.status), '当前无需重试');
            requireThat(t.retries < t.retryLimit, '达到重试上限');
            const reason = textRequired(p.reason, '重试依据');
            t.retries++;
            t.status = 'queued';
            t.resumePhase = 'running';
            t.lease = null;
            t.blockReason = '';
            log(t, '加入有限重试队列：' + reason);
        }
        else if (cmd === 'advance') {
            requireThat(!d.settings.emergency && d.settings.supervise && t.status === 'running', '监督暂停、急停或任务未启动');
            if (t.deadline && Date.parse(t.deadline) <= Date.now()) {
                t.status = 'waitingUser';
                t.lease = null;
                t.blockReason = '达到执行截止时间，请本人调整边界';
                log(t, t.blockReason);
                return;
            }
            if (find(d.machines, t.machine).status !== 'online') {
                t.status = 'waitingResource';
                t.lease = null;
                t.blockReason = '执行节点离线';
                log(t, t.blockReason);
                return;
            }
            if (t.cost + 5 > t.budget || cost() + 5 > d.settings.dailyBudget) {
                t.status = 'waitingQuota';
                t.lease = null;
                t.blockReason = t.cost + 5 > t.budget ? '达到任务预算上限' : '达到每日总预算';
                log(t, t.blockReason);
                return;
            }
            t.cost = Math.round((t.cost + 5) * 100) / 100;
            t.step++;
            t.progress = Math.min(95, t.progress + 20);
            if (t.progress >= 95 || t.step >= 4) {
                t.status = 'validating';
                t.lease = null;
                t.artifacts = [...new Set([...strings(t.artifacts), `demo-artifact/${t.id}/build.zip`])];
                t.tests = '等待独立验收';
                log(t, '模拟开发结束，等待独立验收');
            }
            else
                log(t, '推进一个模拟检查点，目标保持不变');
        }
        else if (cmd === 'validate') {
            requireThat(t.status === 'validating', '尚未进入验收阶段');
            requireThat(['pass', 'fail'].includes(p.outcome), '验收结果无效');
            t.acceptance = { outcome: p.outcome, evidence: textRequired(patch.evidence, '验收证据'), reason: textRequired(p.reason, '验收说明'), time: stamp() };
            t.tests = textRequired(patch.tests, '测试结果');
            t.artifacts = [...new Set([...strings(t.artifacts), ...strings(patch.artifacts)])];
            t.lease = null;
            if (p.outcome === 'pass') {
                requireThat(t.artifacts.length, '交付需要产物');
                t.status = 'completed';
                t.progress = 100;
                const pr = find(d.projects, t.project);
                if (Number.isInteger(t.milestone) && t.milestone >= 0 && t.milestone < pr.milestones.length && !pr.doneMilestones.includes(t.milestone))
                    pr.doneMilestones.push(t.milestone);
                pr.progress = Math.round(pr.doneMilestones.length / Math.max(1, pr.milestones.length) * 100);
                log(t, '模拟验收通过，归档证据与产物');
            }
            else {
                t.status = 'failed';
                t.blockReason = p.reason;
                log(t, '模拟验收失败：' + p.reason);
            }
        }
        else if (cmd === 'requestBudget') {
            const amount = num(patch.budget, 1, 10000, '预算');
            requireThat(amount > t.cost, '新预算须高于已用费用');
            requireThat(!d.approvals.some(a => a.kind === 'budget' && a.task === t.id && a.status === 'pending'), '已有待处理预算申请');
            d.approvals.unshift({ id: uid('approval'), kind: 'budget', title: '任务预算：' + t.title, target: t.id, task: t.id, amount, previousBudget: t.budget, level: 'L2', status: 'pending', summary: `预算改为 ${amount} 元；${textRequired(p.reason, '继续理由')}`, backup: '保留原任务与费用记录', rollback: '恢复原预算并停止继续执行', time: stamp() });
            log(t, '提交预算申请，不自动恢复');
        }
        else if (cmd === 'policy') {
            if (patch.deadline)
                requireThat(Number.isFinite(Date.parse(patch.deadline)), '截止时间格式无效');
            t.deadline = String(patch.deadline || '');
            t.retryLimit = num(patch.retryLimit, 0, 8, '重试上限');
            requireThat(t.retryLimit >= t.retries, '重试上限不能小于已用次数');
            log(t, '更新有限重试与时间边界，不自动恢复执行');
        }
        else if (cmd === 'package') {
            requireThat(t.status === 'completed' && t.acceptance?.outcome !== 'fail' && t.artifacts?.length, '只允许归集已验收产物');
            const version = textRequired(patch.version, '版本');
            requireThat(!ops.releases.some((x: any) => x.task === t.id && x.version === version), '相同版本已归档');
            ops.releases.unshift({ id: uid('release'), project: t.project, task: t.id, name: t.title, version, criteria: patch.criteria || t.criteria, evidence: [t.tests, t.acceptance?.evidence || '历史样例验收', ...t.artifacts], artifact: t.artifacts[0], status: 'ready', time: stamp() });
            log(t, '归集模拟交付包，上线需要单独审批');
        }
        else
            throw new Error('任务命令无效');
        return;
    }
    if (type === 'op.service') {
        if (cmd === 'create') {
            requireThat(!find(d.machines, patch.host).readOnly, '公司设备只读');
            if (patch.project)
                find(d.projects, patch.project);
            requireThat(['test', 'staging', 'production'].includes(patch.environment), '环境无效');
            ops.services.unshift({ id: uid('service'), ...pick(patch, ['desc', 'project', 'host', 'environment', 'version', 'method', 'entry', 'healthPath']), name: textRequired(patch.name, '服务名称'), health: 'unknown', latency: null, uptime: '未验证', logs: [], readonly: false, last: '未连接' });
            say('服务已登记，连接待核实');
            return;
        }
        const s = find(ops.services, p.id, '服务');
        if (cmd !== 'refresh')
            requireThat(!s.readonly, '公司服务只允许查看与刷新');
        s.logs ??= [];
        if (cmd === 'update') {
            if (patch.host)
                requireThat(!find(d.machines, patch.host).readOnly, '公司设备只读');
            Object.assign(s, pick(patch, ['name', 'desc', 'project', 'host', 'environment', 'version', 'method', 'entry', 'healthPath']));
            s.logs.push(stamp() + ' 更新登记');
        }
        else if (cmd === 'refresh') {
            s.last = stamp();
            s.logs.push(stamp() + ' 刷新模拟快照，不进行真实探测');
        }
        else if (cmd === 'fault') {
            s.health = s.health === 'down' ? 'healthy' : 'down';
            s.logs.push(stamp() + (s.health === 'down' ? ' 模拟健康检查失败' : ' 模拟恢复健康'));
        }
        else if (cmd === 'backup') {
            s.backup = `demo-${s.version}-${uid('snapshot')}`;
            s.logs.push(stamp() + ' 保存模拟恢复点 ' + s.backup);
        }
        else
            throw new Error('服务命令无效');
        say('服务演示记录已更新');
        return;
    }
    if (type === 'op.deployment') {
        if (cmd === 'request') {
            const s = find(ops.services, p.serviceId, '服务'), release = find(ops.releases, p.releaseId, '交付包');
            requireThat(!s.readonly, '公司服务只读');
            requireThat(release.project === s.project, '版本不属于目标项目');
            requireThat(p.version === release.version && p.environment === s.environment, '目标版本或环境不一致');
            const id = uid('deployment'), aid = uid('approval'), snapshot = `demo-${s.version}-${uid('snapshot')}`, reason = textRequired(p.reason, '发布理由');
            ops.deployments.unshift({ id, service: s.id, release: release.id, host: s.host, version: release.version, previousVersion: s.version, environment: s.environment, status: 'requested', approved: false, approval: aid, snapshot, reason, events: [stamp() + ' 绑定目标与变更前恢复点'], tests: [], time: stamp() });
            d.approvals.unshift({ id: aid, kind: 'deployment', deployment: id, title: `部署 ${s.name} ${release.version}`, target: `${s.name} / ${s.host} / ${s.environment}`, level: s.environment === 'production' ? 'L3' : 'L2', status: 'pending', summary: reason, backup: snapshot, rollback: '恢复 ' + s.version + ' 并验证健康与业务', time: stamp() });
            event('模拟部署请求提交，运行版本未改变');
            return;
        }
        const dep = find(ops.deployments, p.id, '部署请求'), s = boundDeployment(dep);
        requireThat(!s.readonly, '公司服务只读');
        if (cmd === 'approve')
            decision(dep, true, p.reason, p.doubleConfirmed);
        else if (cmd === 'reject')
            decision(dep, false, p.reason);
        else if (cmd === 'execute') {
            requireThat(dep.status === 'ready' && dep.approved, '先批准部署');
            requireThat(!d.settings.emergency, '全局急停');
            requireThat(find(d.machines, dep.host).status === 'online', '部署设备未在线');
            requireThat(s.host === dep.host && s.environment === dep.environment && s.version === dep.previousVersion, '目标发生变化，请重新申请');
            requireThat(dep.snapshot, '缺少恢复点');
            dep.status = 'verifying';
            s.version = dep.version;
            s.health = 'degraded';
            dep.tests.push('模拟交付包一致性通过，等待运行健康验证');
            dep.events.push(stamp() + ' 模拟更换版本，尚未验证可用');
        }
        else if (cmd === 'verify') {
            requireThat(dep.status === 'verifying' && ['pass', 'fail'].includes(p.outcome), '部署验证状态或结果无效');
            requireThat(find(d.machines, dep.host).status === 'online', '目标设备离线');
            const evidence = textRequired(p.reason, '验证证据');
            dep.status = p.outcome === 'pass' ? 'healthy' : 'failed';
            s.health = p.outcome === 'pass' ? 'healthy' : 'down';
            dep.tests.push(`${stamp()} ${p.outcome === 'pass' ? '通过' : '失败'}：${evidence}`);
            dep.events.push(stamp() + ' 模拟健康验证 ' + p.outcome);
            const a = find(d.approvals, dep.approval);
            a.status = p.outcome === 'pass' ? 'executed' : 'failed';
            a.receipt = `版本 ${dep.version}；${evidence}`;
        }
        else if (cmd === 'restore') {
            requireThat(['healthy', 'failed'].includes(dep.status) && dep.snapshot, '没有已执行恢复点');
            requireThat(!d.settings.emergency, '全局急停');
            const reason = textRequired(p.reason, '恢复理由');
            dep.status = 'restoring';
            s.version = dep.previousVersion;
            s.health = 'degraded';
            dep.events.push(`${stamp()} 从 ${dep.snapshot} 恢复 ${dep.previousVersion}，等待验证；${reason}`);
        }
        else if (cmd === 'restoreVerify') {
            requireThat(dep.status === 'restoring' && ['pass', 'fail'].includes(p.outcome), '恢复验证状态或结果无效');
            requireThat(find(d.machines, dep.host).status === 'online', '目标设备离线');
            const evidence = textRequired(p.reason, '恢复验证证据');
            dep.status = p.outcome === 'pass' ? 'restored' : 'failed';
            s.health = p.outcome === 'pass' ? 'healthy' : 'down';
            dep.tests.push(`${stamp()} 恢复${p.outcome === 'pass' ? '通过' : '失败'}：${evidence}`);
            dep.events.push(stamp() + ' 验证恢复结果');
            const a = find(d.approvals, dep.approval);
            a.status = p.outcome === 'pass' ? 'rolledback' : 'failed';
            a.receipt = `恢复 ${dep.previousVersion}；${evidence}`;
        }
        else
            throw new Error('部署命令无效');
        event('模拟部署：' + ({requested:'待审批',ready:'待执行',verifying:'验证中',healthy:'已验证可用',failed:'验证失败',restoring:'恢复中',restored:'已恢复',rejected:'已拒绝'} as Record<string,string>)[dep.status]);
        return;
    }
    if (type === 'op.research') {
        if (cmd === 'create') {
            r.items.unshift(idea(patch));
            say('灵感已登记');
            return;
        }
        const it = find(r.items, p.id, '研究');
        writable(d, it);
        if (cmd === 'discuss') {
            Object.assign(it, pick(patch, ['question', 'criteria', 'hypotheses']));
            if (patch.text)
                it.discussions.push({ author: d.profiles.find(x => x.id === d.profile)?.name || d.profile, text: textRequired(patch.text, '讨论内容'), time: stamp() });
            it.status = 'discussion';
            rlog(it, '补充问题、假设与判断标准');
        }
        else if (cmd === 'start' || cmd === 'resume') {
            requireThat(!d.settings.emergency && !['converted', 'accepted', 'rejected', 'researching'].includes(it.status), '研究不能启动或全局急停');
            Object.assign(it, pick(patch, ['question', 'criteria']));
            textRequired(it.question, '问题');
            textRequired(it.criteria, '判断标准');
            if (patch.plan)
                it.plan = { budget: num(patch.plan.budget, 1, 10000, '研究预算'), minutes: num(patch.plan.minutes, 1, 1440, '时限'), retryLimit: num(patch.plan.retryLimit, 0, 8, '重试上限'), machine: patch.plan.machine };
            requireThat(it.cost < it.plan.budget, '研究预算不足');
            requireThat(it.minutes < it.plan.minutes, '研究时限已耗尽，请重新限定范围');
            const m = find(d.machines, it.plan.machine);
            requireThat(!m.readOnly, '公司设备只读');
            it.status = m.status === 'online' ? 'researching' : 'waitingResource';
            rlog(it, it.status === 'researching' ? '开始有限模拟研究' : '等待研究节点上线');
        }
        else if (cmd === 'pause') {
            requireThat(it.status === 'researching', '研究没有运行');
            it.status = 'paused';
            rlog(it, '人工暂停，等待手动恢复');
        }
        else if (cmd === 'advance') {
            requireThat(it.status === 'researching' && !d.settings.emergency, '研究未运行或全局急停');
            if (find(d.machines, it.plan.machine).status !== 'online') {
                it.status = 'waitingResource';
                rlog(it, '节点离线，研究暂停');
                return;
            }
            if (it.cost + 5 > it.plan.budget || cost() + 5 > d.settings.dailyBudget) {
                it.status = 'waitingQuota';
                rlog(it, '研究达到任务或每日预算上限');
                return;
            }
            if (it.minutes + 5 > it.plan.minutes) {
                it.status = 'blocked';
                rlog(it, '研究达到时限，需要人工调整范围');
                return;
            }
            it.cost += 5;
            it.minutes += 5;
            it.stage = Math.min(4, it.stage + 1);
            const line = `模拟阶段 ${it.stage}：整理可审查线索，外部事实仍待核查。`;
            it.findings = [typeof it.findings === 'string' ? it.findings : strings(it.findings).join('\n'), line].filter(Boolean).join('\n');
            if (it.stage === 4)
                it.status = 'review';
            rlog(it, it.stage === 4 ? '有限研究结束，等待人工比较与决定' : line);
        }
        else if (cmd === 'evidence') {
            requireThat(['support', 'counter', 'unknown'].includes(patch.type), '证据性质无效');
            it.evidence.push({ id: uid('evidence'), type: patch.type, title: textRequired(patch.title, '证据标题'), summary: textRequired(patch.summary, '摘要'), source: textRequired(patch.source, '来源'), locator: textRequired(patch.locator, '定位'), status: patch.status || '待核对' });
            rlog(it, '录入证据来源与核对状态');
        }
        else if (cmd === 'option') {
            it.options.push({ id: uid('option'), ...pick(patch, ['approach', 'effort', 'budget', 'benefit', 'risk', 'recommended']), title: textRequired(patch.title, '方案名称') });
            rlog(it, '新增候选方案');
        }
        else if (cmd === 'decide') {
            requireThat(it.status !== 'converted' && ['accepted', 'deferred', 'rejected'].includes(p.choice), '决定无效或已立项');
            if (p.choice === 'accepted')
                requireThat(it.evidence.length && it.options.length, '采纳前需证据和方案');
            if (p.optionId)
                find(it.options, p.optionId, '方案');
            it.status = p.choice;
            it.decision = { choice: p.choice, optionId: p.optionId || '', reason: textRequired(p.reason, '决定理由'), time: stamp() };
            rlog(it, '人工决定：' + ({accepted:'采纳',deferred:'暂存',rejected:'否决'} as Record<string,string>)[p.choice]);
        }
        else if (cmd === 'convert') {
            requireThat(it.status === 'accepted' && !it.projectId, '仅已采纳未立项研究可转项目');
            const m = patch.machine ? find(d.machines, patch.machine) : null;
            requireThat(!m?.readOnly, '公司设备只读');
            const id = uid('project');
            d.projects.unshift({ id, name: textRequired(patch.name, '项目名称'), desc: textRequired(patch.desc, '项目说明'), goal: textRequired(patch.goal, '目标'), repo: patch.repo || '', scope: it.scope, stage: '范围确认', progress: 0, copies: m && patch.path ? [{ machine: m.id, path: patch.path, branch: patch.branch || 'main' }] : [], milestones: strings(patch.milestones), doneMilestones: [], researchId: it.id });
            it.status = 'converted';
            it.projectId = id;
            rlog(it, '从采纳研究建立项目，原始证据继续保留');
        }
        else if (cmd === 'requestBudget') {
            const amount = num(patch.budget, 1, 10000, '预算');
            requireThat(amount > it.cost, '新预算须高于已用费用');
            requireThat(!d.approvals.some(a => a.kind === 'researchBudget' && a.target === it.id && a.status === 'pending'), '已有待审批预算');
            d.approvals.unshift({ id: uid('approval'), kind: 'researchBudget', target: it.id, amount, previousBudget: it.plan.budget, title: '研究预算：' + it.title, status: 'pending', level: 'L2', summary: textRequired(p.reason, '申请理由'), backup: '保留研究与来源', rollback: '恢复旧预算并暂停研究', time: stamp() });
            rlog(it, '提交预算申请，不自动恢复');
        }
        else
            throw new Error('研究命令无效');
        return;
    }
    if (type === 'op.inbox') {
        if (cmd === 'capture') {
            requireThat(['idea', 'experience', 'book', 'memory'].includes(patch.kind), '记录类型无效');
            if(patch.project){const project=find(d.projects,patch.project,'来源项目');requireThat(d.profile==='me'||project.scope==='family','家庭收件不能关联管理项目');}
            const text = textRequired(patch.text, '原话'), s = scope(d, patch.scope), duplicate = r.inbox.find((x: any) => x.owner === d.profile && x.scope === s && x.kind === patch.kind && normalized(x.text) === normalized(text) && x.status !== 'ignored');
            r.inbox.unshift({ id: uid('inbox'), kind: patch.kind, title: textRequired(patch.title, '标题'), text, originalText: text, originalTitle: patch.title, owner: d.profile, terminal: textRequired(patch.terminal, '来源终端'), origin: patch.origin || 'manual', scope: s, project: patch.project || '', created: stamp(), status: duplicate ? 'duplicate' : 'pending', target: '', targetDomain: '', duplicateOf: duplicate?.id || '', revisions: [] });
            say('原话保存' + (duplicate ? '，发现重复候选' : ''));
            return;
        }
        if (cmd === 'policy') {
            admin(d);
            const ids = strings(patch.scopes);
            for (const id of ids)
                requireThat(find(d.projects, id).scope !== 'company', '公司项目不能被动采集');
            const origins = strings(patch.allowedOrigins);
            requireThat(origins.every(s => ['task-summary', 'terminal-selected'].includes(s)), '仅允许任务摘要与主动选中内容');
            const deviceId = textRequired(patch.machineId || patch.device, '授权设备');
            const device = find(d.machines, deviceId, '授权设备');
            requireThat(!device.readOnly && device.scope !== 'company', '公司或只读设备不能被动采集');
            const fields = strings(patch.fields);
            requireThat(fields.length > 0 && fields.every(f => ['summary','error','lesson','skill','artifact'].includes(f)), '请选择有效采集字段');
            requireThat(patch.consent === true, '需要本人明确同意采集');
            r.capturePolicy = { ...r.capturePolicy, enabled: !!patch.enabled, scopes: ids, allowedOrigins: origins, machineId:deviceId, device:deviceId, fields, consent:true };
            say('指定采集范围已保存');
            return;
        }
        if (cmd === 'passive') {
            admin(d);
            const policy = r.capturePolicy;
            requireThat(policy.enabled && policy.consent === true && policy.fields?.includes('summary') && policy.allowedOrigins.includes('task-summary'), '任务摘要采集未授权');
            const device = find(d.machines, policy.machineId || policy.device, '授权设备');
            requireThat(!device.readOnly && device.scope !== 'company', '公司或只读设备不能被动采集');
            const t = d.tasks.find(x => x.machine === device.id && policy.scopes.includes(x.project) && find(d.projects, x.project).scope !== 'company');
            requireThat(t, '没有指定项目摘要');
            const text = `模拟选中摘要：${t.title}；测试：${t.tests}。尚未验证为通用经验。`;
            requireThat(!r.inbox.some((x: any) => x.origin === 'passive' && x.project === t.project && x.text === text), '同一摘要已经收件');
            r.inbox.unshift({ id: uid('inbox'), kind: 'experience', title: '任务摘要候选', text, originalText: text, owner: d.profile, terminal: d.machines.find(m => m.id === t.machine)?.name || t.machine, origin: 'passive', scope: 'personal', project: t.project, status: 'pending', created: stamp(), target: '', targetDomain: '', duplicateOf: '', revisions: [] });
            policy.last = stamp();
            policy.events ??= [];
            policy.events.push({ text: '指定任务摘要进入待审收件', time: stamp() });
            say('模拟摘要进入待审收件');
            return;
        }
        const it = find(r.inbox, p.id, '收件');
        writable(d, it);
        it.revisions ??= [];
        if (cmd === 'update') {
            requireThat(!['routed', 'merged', 'ignored'].includes(it.status), '已处理记录不能改写');
            if(patch.kind!==undefined)requireThat(['idea','experience','book','memory'].includes(patch.kind),'记录分类无效');
            Object.assign(it, pick(patch, ['title', 'kind', 'annotation']));
            it.revisions.push({ text: '调整标题、分类或批注；原话保持不变', time: stamp() });
        }
        else if (cmd === 'keep-independent') {
            requireThat(['pending','duplicate'].includes(it.status) && !!it.duplicateOf, '这条记录不是待处理的重复候选');
            const reason = textRequired(p.reason, '保留独立的理由');
            it.independenceDecision = {previousDuplicateOf:it.duplicateOf,reason,actorId:d.profile,at:stamp()};
            it.duplicateOf = '';
            it.status = 'pending';
            it.revisions.push({text:'本人决定保留独立记录：'+reason,time:stamp()});
        }
        else if (cmd === 'ignore') {
            requireThat(!['routed', 'merged'].includes(it.status), '记录已经归档');
            it.status = 'ignored';
            it.revisions.push({ text: '忽略候选，原始记录保留', time: stamp() });
        }
        else if (cmd === 'merge') {
            const base = find(r.inbox, p.baseId, '主记录');
            writable(d, base);
            requireThat(base.id !== it.id && base.owner === it.owner && base.scope === it.scope && base.kind === it.kind, '成员、范围和分类须一致');
            requireThat(!['routed', 'merged', 'ignored'].includes(it.status), '记录已经处理');
            base.origins ??= [];
            base.origins.push({ id: it.id, text: it.originalText || it.text, terminal: it.terminal, created: it.created });
            it.status = 'merged';
            it.duplicateOf = base.id;
            it.target = base.target || '';
            it.targetDomain = base.targetDomain || '';
            it.revisions.push({ text: '关联原记录，不重复创建归档目标', time: stamp() });
        }
        else if (cmd === 'route') {
            requireThat(it.status === 'pending' && !it.duplicateOf, '先处理重复或已归档状态');
            const id = uid(p.target);
            if (p.target === 'research') {
                admin(d);
                const x = idea({ title: it.title, raw: it.originalText || it.text, scope: it.scope, terminal: it.terminal, origin: it.origin });
                x.id = id;
                r.items.unshift(x);
            }
            else if (p.target === 'experience')
                d.experiences.unshift({ id, kind: d.profile !== 'me' ? 'family' : 'experience', title: it.title, summary: it.text, content: it.originalText || it.text, scope: it.scope, owner: it.owner, project: it.project, machine: it.terminal, verified: false, status: '待验证', tags: [], date: stamp(), uses: 0, source: it.id, history: ['来自收件 ' + it.id + '，保留来源范围'] });
            else if (p.target === 'memory') {
                requireThat(it.owner === d.profile && d.profile !== 'public', '记忆候选只能进入当前本人空间');
                d.v5.vm.memories[d.profile] ??= [];
                d.v5.vm.memories[d.profile].unshift({ id, text: it.originalText || it.text, category: '收件候选', status: 'candidate', source: it.id, created: stamp(), expires: '未确认前不使用', scope: 'private', history: [{ text: '原话形成候选，等待本人确认', time: stamp() }] });
            }
            else if (p.target === 'material') {
                admin(d);
                d.knowledge.materials ??= [];
                d.knowledge.materials.unshift({ id, title: it.title, text: it.originalText || it.text, status: 'pending', state: 'pending', source: it.id, owner: it.owner, terminal: it.terminal || '未注明终端', scope: it.scope, at: stamp(), created: stamp(), metadata: { kind: 'scan-description', rawOnly: true }, published: false });
            }
            else
                throw new Error('归档目标无效');
            it.status = 'routed';
            it.target = id;
            it.targetDomain = p.target;
            it.revisions.push({ text: '归档到 ' + p.target + '，候选不自动变为正式知识或记忆', time: stamp() });
        }
        else
            throw new Error('收件命令无效');
        say('收件与来源记录已更新');
        return;
    }
    if (type === 'op.experience') {
        if (cmd === 'create') {
            const kind = patch.kind || 'experience';
            requireThat(['experience', 'runbook', 'family', 'health'].includes(kind), '类型无效');
            if (d.profile !== 'me')
                requireThat(['family', 'health'].includes(kind), '家人只能新增家庭资料或私人备忘');
            d.experiences.unshift({ id: uid('experience'), ...pick(patch, d.profile==='me'?['summary', 'content', 'project', 'machine', 'source', 'conditions']:['summary','content','source','conditions']), kind, title: textRequired(patch.title, '标题'), scope: kind === 'health' ? scope(d, 'private') : scope(d, patch.scope), owner: d.profile, verified: false, status: '待验证', tags: strings(patch.tags), date: stamp(), uses: 0, versions: [], history: [], reuseHistory: [] });
            say('资料已保存，验证状态单独管理');
            return;
        }
        const e = find(d.experiences, p.id, '经验');
        writable(d, e);
        e.history ??= [];
        e.versions ??= [];
        if (['verify', 'publish', 'version', 'reuse', 'merge', 'deprecate'].includes(cmd))
            admin(d);
        if (cmd === 'update') {
            requireThat(e.kind !== 'skill', '技能修订请创建版本');
            const kind=patch.kind||e.kind;
            requireThat(['experience','runbook','family','health'].includes(kind),'记录分类无效');
            if(d.profile!=='me')requireThat(['family','health'].includes(kind),'家人只能维护家庭资料或私人备忘');
            const nextScope=kind==='health'?scope(d,'private'):scope(d,patch.scope??e.scope);
            if(nextScope==='private'){e.owner??=d.profile;requireThat(e.owner===d.profile,'只能把自己的记录移到本人私有范围');}
            Object.assign(e,pick(patch,d.profile==='me'?['title','summary','content','project','machine','source','conditions','tags']:['title','summary','content','source','conditions','tags']));
            e.kind=kind;e.scope=nextScope;
            e.verified = false;
            e.status = '待验证';
            e.history.push(stamp() + ' 修订记录，重新等待验证');
        }
        else if (cmd === 'verify') {
            requireThat(['experience', 'runbook'].includes(e.kind), '此类型不走工作验证');
            e.evidence = textRequired(p.evidence, '验证证据');
            e.conditions = textRequired(patch.conditions, '适用条件');
            e.verified = true;
            e.status = '可用';
            e.history.push(stamp() + ' 验证通过：' + e.evidence);
        }
        else if (cmd === 'publish') {
            requireThat(['experience', 'skill'].includes(e.kind), '仅经验可提炼技能');
            if (e.kind === 'experience')
                requireThat(e.verified, '先验证源经验');
            const version = textRequired(patch.version, '版本'), evidence = textRequired(patch.evidence, '本版验证证据'), conditions = textRequired(patch.conditions, '适用条件'), content = textRequired(patch.content, '技能步骤');
            if (e.kind === 'experience') {
                requireThat(!e.publishedSkill, '此经验已提炼技能，请维护技能版本');
                const id = uid('skill');
                d.experiences.unshift({ id, kind: 'skill', title: e.title, summary: e.summary, content, source: e.source, sourceExperience: e.id, scope: e.scope, owner: e.owner, project: e.project, machine: e.machine, tags: [...e.tags], version, evidence, conditions, verified: true, status: '可用', date: stamp(), uses: 0, versions: [], history: [stamp() + ' 从经验 ' + e.id + ' 发布 ' + version], reuseHistory: [] });
                e.publishedSkill = id;
                e.history.push(stamp() + ' 提炼技能，源经验保留');
            }
            else {
                requireThat(['待发布', '草稿', '待验证'].includes(e.status) && (!e.version || version === e.version), '版本状态或待发布版本不一致');
                e.version = version;
                e.content = content;
                e.conditions = conditions;
                e.evidence = evidence;
                e.verified = true;
                e.status = '可用';
                e.history.push(stamp() + ' ' + version + ' 验证发布');
            }
        }
        else if (cmd === 'version') {
            requireThat(e.kind === 'skill' && ['可用', '已停用'].includes(e.status), '先发布当前版本');
            const version = textRequired(patch.version, '新版本');
            requireThat(version !== e.version && !e.versions.some((v: any) => v.version === version), '版本号已存在');
            e.versions.push({ id: uid('version'), version: e.version, content: e.content, conditions: e.conditions, evidence: e.evidence, status: e.status, verified: e.verified, time: stamp() });
            e.version = version;
            e.content = textRequired(patch.content, '新版步骤');
            e.conditions = textRequired(patch.conditions, '适用条件');
            e.evidence = textRequired(patch.evidence, '修订说明');
            e.verified = false;
            e.status = '待发布';
            e.history.push(stamp() + ' 新版待验证，旧引用保持不变');
        }
        else if (cmd === 'reuse') {
            requireThat(e.kind === 'skill' && e.verified && e.status === '可用', '仅可用验证版本允许引用');
            requireThat(p.taskId || p.projectId, '选择引用目标');
            let project = p.projectId;
            if (p.taskId) {
                const t = find(d.tasks, p.taskId, '任务');
                requireThat(t.mode === 'managed' && !terminal.has(t.status), '仅活动托管任务可引用');
                t.skillRefs ??= [];
                requireThat(!t.skillRefs.some((x: any) => x.id === e.id && x.version === e.version), '任务已经引用这个版本');
                t.skillRefs.push({ id: e.id, version: e.version, time: stamp() });
                t.skills ??= [];
                if (!t.skills.includes(e.id))
                    t.skills.push(e.id);
                project = t.project;
            }
            else
                find(d.projects, project);
            e.reuseHistory ??= [];
            e.reuseHistory.push({ text: `${p.taskId ? '任务 ' + p.taskId : '项目 ' + project} 引用 ${e.version}`, taskId: p.taskId || '', projectId: project, version: e.version, time: stamp() });
            e.uses = (e.uses || 0) + 1;
        }
        else if (cmd === 'merge') {
            requireThat(e.kind === 'experience', '仅经验支持合并');
            const base = find(d.experiences, p.baseId, '主经验');
            writable(d, base);
            requireThat(base.id !== e.id && base.kind === 'experience' && base.scope === e.scope, '合并对象类型与范围不一致');
            base.sources ??= [];
            base.sources.push({ id: e.id, title: e.title, content: e.content, source: e.source });
            base.history ??= [];
            base.history.push(stamp() + ' 合并来源 ' + e.id);
            e.archived = true;
            e.mergedInto = base.id;
            e.history.push(stamp() + ' 合并到 ' + base.id);
        }
        else if (cmd === 'deprecate') {
            requireThat(e.kind === 'skill' && e.status === '可用', '当前版本不可停用');
            e.status = '已停用';
            e.history.push(stamp() + ' 停用版本：' + textRequired(p.reason, '停用理由') + '，旧引用保留');
        }
        else if (cmd === 'archive') {
            requireThat(e.scope === 'private', '此入口仅移除本人私人记录');
            e.archived = true;
            e.status = '已归档';
            e.history.push(stamp() + ' 本人移除记录：' + textRequired(p.reason, '移除理由'));
        }
        else
            throw new Error('经验命令无效');
        say('经验、验证与版本记录已更新');
        return;
    }
    if (type === 'op.approval') {
        const a = find(d.approvals, p.id, '审批');
        if (cmd === 'approve' || cmd === 'reject') {
            requireThat(a.status === 'pending', '审批已处理');
            const reason = textRequired(p.reason, '决定理由');
            requireThat(cmd !== 'approve' || a.level !== 'L3' || p.doubleConfirmed === true, '高风险操作须二次确认');
            if (a.kind === 'deployment')
                decision(find(ops.deployments, a.deployment), cmd === 'approve', reason, p.doubleConfirmed);
            else {
                a.status = cmd === 'approve' ? 'approved' : 'rejected';
                a.reason = reason;
                a.receipt = cmd === 'approve' ? '已批准，各后续操作按流程执行。' : '申请已拒绝，目标状态不改变。';
                if (cmd === 'approve' && a.kind === 'budget') {
                    const t = find(d.tasks, a.task || a.target);
                    t.budget = a.amount;
                    if (t.status === 'waitingQuota') {
                        t.status = 'paused';
                        t.resumePhase = 'running';
                    }
                    log(t, '预算获批准，等待手动恢复；每日总预算继续生效');
                }
                if (cmd === 'approve' && a.kind === 'researchBudget') {
                    const it = find(r.items, a.target);
                    it.plan.budget = a.amount;
                    if (it.status === 'waitingQuota')
                        it.status = 'paused';
                    rlog(it, '研究预算获批准，等待手动恢复');
                }
            }
        }
        else if (cmd === 'execute') {
            requireThat(a.status === 'approved' && a.kind !== 'deployment', '先批准；部署到运行服务执行');
            requireThat(!d.settings.emergency, '全局急停');
            a.status = 'executed';
            a.receipt = `${stamp()} 模拟执行：${textRequired(p.reason, '执行理由')}；目标 ${a.target}；恢复点 ${a.backup || '保留旧预算'}`;
            if (a.task) {
                const t = find(d.tasks, a.task);
                if (t.status === 'approval') {
                    t.status = 'paused';
                    t.resumePhase = 'running';
                    log(t, '审批对应模拟变更完成，等待继续验收');
                }
            }
        }
        else if (cmd === 'rollback') {
            requireThat(a.status === 'executed' && a.kind !== 'deployment' && a.backup, '仅已执行且有恢复点的变更可恢复');
            a.status = 'rolledback';
            a.receipt = `${stamp()} 模拟恢复：${textRequired(p.reason, '恢复理由')}；恢复点 ${a.backup}`;
            if (a.task) {
                const t = find(d.tasks, a.task);
                t.status = 'paused';
                t.lease = null;
                log(t, '模拟变更已恢复，等待本人处理');
            }
        }
        else
            throw new Error('审批命令无效');
        a.events ??= [];
        a.events.push({ time: stamp(), text: ({approve:'批准',reject:'拒绝',execute:'执行',rollback:'恢复'} as Record<string,string>)[cmd] + '：' + (p.reason || '') });
        say('审批决定与回执已保存');
        return;
    }
    if (type === 'op.policy') {
        const policy = pick(patch, ['humanReserve', 'voiceReserve', 'batchLimit', 'quiet', 'autotest']);
        const human = num(policy.humanReserve ?? ops.policy.humanReserve, 0, 100, '人工预留'), voice = num(policy.voiceReserve ?? ops.policy.voiceReserve, 0, 100, '语音预留');
        requireThat(human + voice <= 100, '资源预留不能超过百分之百');
        if (policy.batchLimit !== undefined)
            policy.batchLimit = num(policy.batchLimit, 1, 8, '并发上限');
        const settings = pick(patch, ['dailyBudget', 'retryLimit', 'supervise', 'emergency', 'autoWake', 'notify']);
        if (settings.dailyBudget !== undefined)
            settings.dailyBudget = num(settings.dailyBudget, 1, 10000, '每日预算');
        if (settings.retryLimit !== undefined)
            settings.retryLimit = num(settings.retryLimit, 0, 8, '重试上限');
        requireThat(!(d.settings.emergency && settings.supervise === true && settings.emergency !== false), '急停时不能开启监督');
        ops.policy = { ...ops.policy, ...policy };
        d.settings = { ...d.settings, ...settings };
        if (settings.emergency === true) {
            d.settings.supervise = false;
            for (const t of d.tasks.filter(x => x.mode === 'managed' && ['running', 'validating'].includes(x.status))) {
                t.resumePhase = t.status;
                t.status = 'paused';
                t.lease = null;
                log(t, '全局急停，释放模拟执行租约');
            }
            for (const it of r.items.filter((x: any) => x.status === 'researching')) {
                it.status = 'paused';
                rlog(it, '全局急停，研究暂停');
            }
        }
        event('运行策略已保存' + (patch.reason ? '：' + patch.reason : ''));
        return;
    }
    if (type === 'op.backup') {
        d.backups ??= [];
        if (cmd === 'create') {
            const id = uid('backup');
            d.backups.unshift({ id, snapshotName: 'demo-snapshot-' + id, time: stamp(), target: p.target || 'platform', status: 'created', tests: [], events: [stamp() + ' 保存演示状态快照，不读取实际磁盘'], snapshot: { projects: structuredClone(d.projects), services: structuredClone(ops.services), experiences: structuredClone(d.experiences) } });
            d.lastBackup = stamp();
        }
        else {
            const b = find(d.backups, p.id, '备份');
            if (cmd === 'restore') {
                requireThat(['created', 'verified'].includes(b.status), '此备份正在演练');
                b.status = 'restoring';
                b.restoreTarget = '隔离演示副本';
                b.recovery = structuredClone(b.snapshot);
                b.events.push(stamp() + ' 恢复到隔离副本：' + textRequired(p.reason, '演练理由'));
            }
            else if (cmd === 'verify') {
                requireThat(b.status === 'restoring' && b.recovery, '先恢复隔离副本');
                requireThat(JSON.stringify(b.recovery) === JSON.stringify(b.snapshot), '恢复副本与快照不一致');
                b.status = 'verified';
                b.tests = [stamp() + ' 项目、服务与经验快照一致性通过（模拟）', '恢复演练未改写现有业务状态'];
                b.events.push(stamp() + ' 隔离恢复验证通过');
                d.lastDrill = stamp();
            }
            else
                throw new Error('备份命令无效');
        }
        say('模拟备份与恢复演练已更新');
        return;
    }
    throw new Error('运维操作未定义：' + type);
}
