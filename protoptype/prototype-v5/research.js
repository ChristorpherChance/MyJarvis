/* V5 research and unified capture. All source material and actions are simulated. */
(() => {
  'use strict';
  const rStates = {
    inbox: ['新灵感', 'blue'], discussion: ['讨论完善', 'purple'],
    researching: ['深研中', 'blue'], paused: ['已暂停', ''],
    waitingQuota: ['等待预算', 'amber'], waitingResource: ['等待节点', 'amber'],
    blocked: ['需要处理', 'red'], review: ['待决策', 'amber'],
    accepted: ['已采纳', 'green'], deferred: ['暂存', ''],
    rejected: ['已否决', ''], converted: ['已转项目', 'green']
  };
  const iKinds = {idea: '灵感', experience: '问题与经验', book: '资料 / 书籍', memory: '私人记忆候选'};
  const scopeNames = {personal: '个人工作', company: '公司指定范围', family: '家庭共享', private: '本人私有'};
  const stages = ['明确研究问题与边界', '整理来源与证据', '核查反证与限制', '比较方案并形成决定'];
  const terms = {manual: '网页主动记录', voice: '模拟语音', terminal: '终端选中内容', passive: '选定范围的被动候选'};
  const h = E;
  const btn = (label, action, id = '', cls = '', icon = '') => B(label, 'v5-rd-' + action, id, cls, icon);
  const notice = (text, color = '') => '<div class="notice ' + color + '">' + I('info', 17) + '<span>' + h(text) + '</span></div>';
  const fieldRow = (label, value) => '<div class="rd5-kv"><span>' + h(label) + '</span><strong>' + h(value) + '</strong></div>';
  const who = id => ({me: '我', wife: '妻子', son: '儿子', dad: '爸爸', mom: '妈妈'}[id] || '本人');
  const time = () => '今天 ' + now();
  const store = () => J5.state().research;
  const visible = obj => obj && (obj.scope === 'private' ? obj.owner === S.profile : admin() || obj.owner === S.profile || obj.scope === 'family');
  const modifiable = obj => visible(obj) && (admin() || obj.owner === S.profile);
  const ideas = () => store().items.filter(visible);
  const entries = () => store().inbox.filter(visible);
  const idea = id => store().items.find(x => x.id === id && visible(x));
  const entry = id => store().inbox.find(x => x.id === id && visible(x));
  const stateBadge = item => badge(...(rStates[item.status] || ['未知', '']));
  const mark = text => badge(text, 'blue');
  const log = (item, text) => { item.timeline = item.timeline || []; item.timeline.unshift({text, time: time()}); item.updated = time(); };
  const commit = message => J5.commit(message);
  const normalized = text => String(text || '').toLowerCase().replace(/[\s，。！？、,.!?;；:：]/g, '');
  const uid = prefix => prefix + Date.now() + '-' + Math.floor(Math.random() * 10000);
  const sourceStrip = item => '<div class="rd5-source">' + I('link', 13) + h(item.terminal || '网页入口') + ' · ' + h(who(item.owner)) + ' · ' + h(item.created || '模拟时间') + ' · ' + h(scopeNames[item.scope] || item.scope) + '</div>';
  const makeIdea = (title, raw, extra = {}) => ({
    id: uid('rd'), title, raw, owner: S.profile, scope: admin() ? 'personal' : 'private',
    terminal: '网页入口', origin: 'manual', created: time(), updated: time(), status: 'inbox',
    question: '', criteria: '', hypotheses: [], discussions: [], evidence: [], options: [],
    plan: {budget: 36, minutes: 30, retryLimit: 2, machine: 'dev-48'},
    cost: 0, minutes: 0, retries: 0, stage: 0, findings: '', decision: null,
    projectId: '', timeline: [], ...extra
  });

  J5.initializers.push(v => {
    if (v.research) return;
    const first = makeIdea('让经典成为全家的知识故事路线', '我希望把校勘后的经典按人物、时代和知识关系组织成故事，家人可以按各自目标学习。先研究一个样本闭环，再决定怎样扩展。', {
      id: 'rd-classics', owner: 'me', terminal: '联想 · 移动开发（模拟）', created: '10月3日 08:45', updated: '10月3日 09:28', status: 'review',
      question: '先用一部经典的 30 页样本建立严格校勘、故事与课程流程，能否兼顾可信来源与家庭使用？',
      criteria: '能回到原页与正式文本；不同人的学习反馈独立；有未知内容和人工校勘门槛；给出首期可验收范围。',
      hypotheses: ['先完成原文版本和引用，再生成故事，可以避免派生材料覆盖原文。', '主题跨书适合长期使用，但首个样本按书推进更容易验收。'],
      stage: 4, cost: 18.6, minutes: 24,
      findings: '模拟研究结论：建议先走样本闭环。将扫描页、忠实转录、解读和故事分别保存；首期采用模块化实现，暂不引入完整微服务。真实 OCR 质量和家人效果需要实测。',
      discussions: [{author: '我', text: '先关注原文可靠性，故事不是原文的替代物。', time: '10月3日 09:02'}, {author: '管家 · 模拟', text: '把“页面校勘通过”和“故事对家人有帮助”列为两个独立验收。', time: '10月3日 09:05'}],
      evidence: [
        {id: 'ev-classic-1', type: 'support', title: '原件、基库与派生材料分层', summary: 'V5 决策稿建议分开维护原件、校勘基库和知识神殿。此条为内部设计稿的模拟摘要，不是外部查证结果。', source: '内部 V5 设计稿 · 模拟资料卡', locator: '§5.1 / 版本 V5.0', status: '已核对内部方案'},
        {id: 'ev-classic-2', type: 'counter', title: '30 页样本不能证明全书零错误', summary: '样本只验证处理流程。不能外推整书质量、成本或全部版式兼容；必须保留疑点和后续实测。', source: '样本验收计划 · 模拟', locator: 'quality-plan-demo-v1', status: '待真实样本验证'},
        {id: 'ev-classic-3', type: 'unknown', title: '家人是否适应故事时长仍未知', summary: '3—10 分钟是候选设计，不是家人的已确认偏好；需要分别试用并记录反馈。', source: '家庭学习访谈提纲 · 模拟', locator: 'family-feedback-demo-v1', status: '尚未访谈'}
      ],
      options: [
        {id: 'opt-1', title: '原文优先的小样本闭环', approach: '30 页 → 校勘 → 引用 → 3 个故事 → 两人的学习反馈', effort: '小', budget: '先限额验证', benefit: '质量门槛清楚；适合逐项验收', risk: '人工精校时间需要实测', recommended: true},
        {id: 'opt-2', title: '先生成大批故事，再补校勘', approach: '快速解读全书，之后再核查原文', effort: '中', budget: '派生返工成本不确定', benefit: '较快看到内容形态', risk: '错误可能进入教材；不建议正式发布', recommended: false},
        {id: 'opt-3', title: '直接搭建完整微服务', approach: '先拆成独立服务与数据库再录入经典', effort: '大', budget: '运维与恢复成本更高', benefit: '服务发布独立', risk: '首期工作量大，样本质量尚未验证', recommended: false}
      ],
      timeline: [{text: '有限深研演示完成，等待本人选择方案', time: '10月3日 09:28'}, {text: '已整理一项支持、一项反证与一项未知', time: '10月3日 09:20'}]
    });
    const second = makeIdea('让已有自研应用先接入只读健康管理', '几台服务器上运行的小项目应先登记位置、入口和健康检查，再决定是否接入部署与回滚。', {
      id: 'rd-services', owner: 'me', terminal: '公司 HP · 选中摘要（模拟）', scope: 'personal', status: 'discussion',
      question: '如何不改写已有应用，先建立应用、环境、服务和部署的准确关联？',
      criteria: '一个运行应用可查看服务健康；开发停止不影响线上服务；没有 API 的保留手工登记。',
      hypotheses: ['先只读接入可减少迁移成本。'], created: '10月3日 09:10', updated: '10月3日 09:10'
    });
    const third = makeIdea('为个人语言练习安排轻量复习', '先确认家人愿意使用的时段，再用复习记录做个性化提醒。暂时不需要自动播放。', {
      id: 'rd-language', owner: 'me', status: 'deferred', created: '昨天 21:30', updated: '今天 08:20',
      decision: {choice: 'deferred', reason: '先完成各人的档案与学习记录，之后再验证复习提醒。', time: '今天 08:20'}
    });
    v.research = {
      items: [first, second, third],
      inbox: [
        {id: 'inbox-demo-idea', kind: 'idea', title: '经典故事路线的原始想法', text: first.raw, owner: 'me', terminal: first.terminal, origin: 'voice', scope: 'personal', project: '', created: '10月3日 08:45', status: 'routed', target: 'rd-classics', targetDomain: 'research', duplicateOf: ''},
        {id: 'inbox-demo-experience', kind: 'experience', title: '容器配置问题的选中日志', text: '模拟摘录：测试容器重启后连接失败。排查发现配置引用与当前环境不一致，修正后健康检查通过。只提交已选择的摘要。', owner: 'me', terminal: '后台开发 · 48G i7（模拟）', origin: 'terminal', scope: 'personal', project: 'p1', created: '今天 09:18', status: 'pending', target: '', duplicateOf: ''},
        {id: 'inbox-demo-book', kind: 'book', title: '经典扫描样本的资料说明', text: '模拟附件说明：30 页代表性扫描，含正文、注释和版式变化。原件尚未实际读取，需登记版本和缺页检查。', owner: 'me', terminal: 'NAS 分享入口（模拟）', origin: 'manual', scope: 'personal', project: '', created: '今天 09:24', status: 'pending', target: '', duplicateOf: ''},
        {id: 'inbox-demo-memory', kind: 'memory', title: '我更喜欢先看结论，再看证据', text: '我希望研究报告先写建议，再列支持与限制。这只是待确认记忆候选。', owner: 'me', terminal: '网页对话（模拟）', origin: 'voice', scope: 'private', project: '', created: '今天 09:26', status: 'pending', target: '', duplicateOf: ''}
      ],
      capturePolicy: {enabled: false, scopes: ['p1'], allowedOrigins: ['task-summary'], last: '', events: []}
    };
  });

  // Shared adapter: capture once, then route once. Do not copy raw material to several domains.
  J5.capture = payload => {
    payload = payload || {};
    const text = String(payload.text || '').trim();
    if (!text) return '';
    const kinds = Object.keys(iKinds), kind = kinds.includes(payload.kind) ? payload.kind : 'idea';
    const requestedOwner = ['me', 'wife', 'son', 'dad', 'mom'].includes(payload.owner) ? payload.owner : S.profile;
    const owner = admin() ? requestedOwner : S.profile;
    const scope = kind === 'memory' || !admin() ? 'private' : (Object.keys(scopeNames).includes(payload.scope) ? payload.scope : 'personal');
    const same = store().inbox.find(x => x.owner === owner && x.scope === scope && x.kind === kind && normalized(x.text) === normalized(text));
    const item = {id: uid('inbox'), kind, title: String(payload.title || text.slice(0, 32)), text,
      owner, terminal: String(payload.terminal || '当前入口 · 模拟'), origin: payload.origin || 'manual',
      scope, project: admin() ? String(payload.project || '') : '', created: time(), status: same ? 'duplicate' : 'pending',
      target: '', targetDomain: '', duplicateOf: same ? same.id : ''};
    item.originalText = text; item.originalTitle = item.title; item.revisions = [];
    store().inbox.unshift(item); persist(); return item.id;
  };
  J5.getCapture = id => { const x = entry(id); return x ? JSON.parse(JSON.stringify(x)) : null; };
  J5.updateCapture = (id, patch = {}) => {
    const x = entry(id); if (!modifiable(x)) return null;
    x.originalText = x.originalText ?? x.text; x.originalTitle = x.originalTitle ?? x.title;
    const changes = {};
    ['title', 'text', 'summary', 'annotation'].forEach(key => { if (typeof patch[key] === 'string') changes[key] = patch[key].trim(); });
    if ('text' in changes && !changes.text) return null;
    const contentChanged = Object.keys(changes).some(key => changes[key] !== x[key]);
    if (contentChanged) {
      x.revisions = x.revisions || [];
      x.revisions.unshift({title: x.title, text: x.text, summary: x.summary || '', annotation: x.annotation || '', time: time(), actor: S.profile});
      Object.assign(x, changes); x.updated = time();
      if (x.status === 'routed') x.needsReview = true;
    }
    if (['pending', 'ignored', 'waitingTarget'].includes(patch.status) && x.status !== 'routed') x.status = patch.status;
    persist(); return J5.getCapture(id);
  };

  const intro = (title, subtitle, buttons = '') => pageHead(title, subtitle, buttons);
  const researchCard = item => '<article class="card rd5-card">' +
    '<div class="row between">' + stateBadge(item) + '<span class="tiny muted">' + h(item.updated) + '</span></div>' +
    '<h3>' + btn(item.title, 'detail', item.id, 'ghost rd5-title') + '</h3>' +
    '<p class="rd5-excerpt">' + h(item.question || item.raw) + '</p>' +
    '<div class="rd5-tags">' + mark(item.evidence.length + ' 项证据') + badge(item.evidence.filter(e => e.type === 'counter').length + ' 项反证', 'amber') + badge(scopeNames[item.scope]) + '</div>' +
    '<div class="rd5-card-foot"><span>' + h(who(item.owner)) + ' · ' + h(item.projectId ? '已关联项目' : '未转项目') + '</span>' + btn('继续查看', 'detail', item.id, 'compact', 'arrow') + '</div></article>';
  const stageRail = item => '<div class="rd5-stage-rail">' + stages.map((label, i) => '<div class="' + (item.stage > i ? 'rd5-done' : item.stage === i ? 'rd5-current' : '') + '"><b>' + (item.stage > i ? '✓' : i + 1) + '</b><span>' + h(label) + '</span></div>').join('') + '</div>';
  const evidenceRow = (e, id) => '<article class="rd5-evidence"><div class="row between">' + badge(e.type === 'counter' ? '反证 / 限制' : e.type === 'unknown' ? '待验证' : '支持证据', e.type === 'counter' ? 'amber' : e.type === 'unknown' ? '' : 'green') + '<span class="tiny muted">' + h(e.status) + '</span></div><h4>' + h(e.title) + '</h4><p>' + h(e.summary) + '</p><div class="rd5-citation">' + I('book', 13) + h(e.source) + '<br><span>' + h(e.locator || '定位待补充') + '</span></div><div class="row wrap mt16">' + btn('查看来源卡', 'evidence-preview', id + '|' + e.id, 'compact', 'eye') + btn('移除候选', 'remove-evidence', id + '|' + e.id, 'ghost compact') + '</div></article>';
  const routeResearch = () => {
    if (!admin()) return intro('我的灵感', '私人记录只在自己的空间出现', btn('快速记一下', 'capture', '', 'primary', 'plus')) + notice('研发与深度研究由管理员管理。你可以把自己的想法保存在私人收件箱。') + btn('打开我的收件箱', 'go-inbox', '', 'primary mt24');
    const all = ideas(), query = (U.rd5Query || '').toLowerCase(), filter = U.rd5Filter || 'all';
    const list = all.filter(x => (x.title + ' ' + x.raw + ' ' + x.question).toLowerCase().includes(query) && (filter === 'all' || filter === 'attention' && ['review', 'blocked', 'waitingQuota', 'waitingResource'].includes(x.status) || filter === 'active' && ['inbox', 'discussion', 'researching', 'paused'].includes(x.status) || filter === 'archive' && ['deferred', 'rejected', 'converted'].includes(x.status)));
    return intro('让一个想法，走到可交付的项目', '记录 → 讨论 → 有边界的深研 → 决策 → 项目 → 交付与复盘', btn('语音记灵感', 'voice-capture', '', '', 'mic') + btn('记录新灵感', 'capture', '', 'primary', 'plus')) +
      '<section class="rd5-hero"><div><span class="rd5-eyebrow">IDEA TO DELIVERY</span><h2>先找到证据，再决定值得做什么。</h2><p>研究保存支持、反证与未知。没有采纳的灵感也有去处；被采纳的目标进入项目，而不是停留在一段聊天。</p></div><div class="rd5-hero-side"><span>' + all.filter(x => x.status === 'review').length + '</span><small>份研究等待你的决定</small>' + btn('统一收件箱', 'go-inbox', '', 'compact', 'inbox') + '</div></section>' +
      '<div class="rd5-metrics">' + [['全部灵感', all.length, '保留原始表达'], ['正在研究', all.filter(x => x.status === 'researching').length, '有限时间与预算'], ['已转项目', all.filter(x => x.projectId).length, '目标和验收清楚'], ['研究模拟费用', '¥' + all.reduce((n, x) => n + x.cost, 0).toFixed(2), '不代表真实 API 账单']].map(x => '<div class="card rd5-metric"><span>' + h(x[0]) + '</span><strong>' + h(x[1]) + '</strong><small>' + h(x[2]) + '</small></div>').join('') + '</div>' +
      '<div class="toolbar"><div class="segmented">' + [['all', '全部'], ['active', '记录与研究'], ['attention', '需要处理'], ['archive', '决策归档']].map(x => btn(x[1], 'filter', x[0], filter === x[0] ? 'active' : '')).join('') + '</div>' + btn('查找灵感', 'search', '', 'compact', 'search') + '</div>' +
      '<div class="rd5-cards">' + list.map(researchCard).join('') + '</div>' + (!list.length ? '<div class="empty">没有匹配的灵感。可以记录一个目标，或清除筛选。</div>' : '') +
      '<div class="rd5-footnote">' + I('info', 14) + '来源、研究事件、费用和结论均为模拟；不实际读取外部资料或派发开发。</div>';
  };

  const inboxStatus = x => badge(x.status === 'routed' ? '已分流' : x.status === 'duplicate' ? '重复候选' : x.status === 'waitingTarget' ? '待目标域确认' : x.status === 'ignored' ? '已忽略' : '待整理', x.status === 'routed' ? 'green' : x.status === 'duplicate' ? 'amber' : 'blue');
  const routeInbox = () => {
    const filter = U.rd5InboxFilter || 'pending';
    const list = entries().filter(x => filter === 'all' || filter === 'pending' && ['pending', 'waitingTarget'].includes(x.status) || filter === 'duplicate' && x.status === 'duplicate' || filter === 'done' && ['routed', 'ignored'].includes(x.status));
    return intro(admin() ? '一个入口，把记录送到正确的地方' : '我的私人收件箱', admin() ? '终端、语音、网页与选定事件保留同一份原始记录；分流后仍可追溯。' : '你的想法和记忆候选只保存在本人空间，管理资料保持独立。', (admin() ? btn('选定采集范围', 'policy', '', '', 'shield') : '') + btn('语音记一下', 'voice-capture', '', '', 'mic') + btn('快速记录', 'capture', '', 'primary', 'plus')) +
      '<div class="rd5-inbox-banner">' + I('inbox', 25) + '<div><strong>先留原话，再整理归属</strong><p>灵感进入研究，经验进入版本化经验库，资料进入导入候选，私人偏好进入记忆候选。重复记录先合并，不重复创建任务。</p></div>' + badge(entries().filter(x => x.status === 'pending').length + ' 项待整理', 'blue') + '</div>' +
      (admin() ? '<div class="rd5-policy-strip"><span>' + I('shield', 15) + '被动候选：' + (store().capturePolicy.enabled ? '已开启指定范围' : '未开启') + ' · ' + store().capturePolicy.scopes.length + ' 个指定项目</span>' + btn('生成一条事件样例', 'passive-demo', '', 'compact', 'play') + '</div>' : notice('家人的快速记录不扫描机器或公司目录。私人灵感可以先讨论和保存，正式研发由管理员在授权范围内接手。')) +
      '<div class="toolbar"><div class="segmented">' + [['pending', '待整理'], ['duplicate', '重复候选'], ['done', '已处理'], ['all', '全部可见']].map(x => btn(x[1], 'inbox-filter', x[0], filter === x[0] ? 'active' : '')).join('') + '</div><span class="small muted">' + list.length + ' 条记录 · 当前身份 ' + h(who(S.profile)) + '</span></div>' +
      '<section class="card rd5-inbox-list">' + list.map(x => '<article class="rd5-inbox-item"><span class="rd5-type-icon">' + I(x.kind === 'idea' ? 'bolt' : x.kind === 'memory' ? 'lock' : x.kind === 'book' ? 'book' : 'code', 21) + '</span><div class="rd5-inbox-content"><div class="row wrap between"><button class="task-title-button" data-act="v5-rd-inbox-detail" data-id="' + h(x.id) + '">' + h(x.title) + '</button>' + inboxStatus(x) + '</div><p>' + h(x.text) + '</p>' + sourceStrip(x) + '<div class="rd5-tags">' + badge(iKinds[x.kind]) + badge(terms[x.origin] || '主动记录') + (x.project && admin() ? badge(S.projects.find(p => p.id === x.project)?.name || '指定项目') : '') + '</div></div>' + btn('处理', 'inbox-detail', x.id, 'compact', 'arrow') + '</article>').join('') + (!list.length ? '<div class="empty">这里已经整理好了。你也可以切换筛选查看历史记录。</div>' : '') + '</section>';
  };
  J5.routes.research = routeResearch;
  J5.routes.inbox = routeInbox;

  const researchDetail = id => {
    const x = idea(id); if (!x) return modal('记录不可见', notice('当前身份没有这条记录的访问范围。'), B('关闭', 'close-overlay'));
    const tab = U.rd5Tab || 'overview';
    let body = '<div class="row wrap between mb20">' + stateBadge(x) + badge('模拟研究', 'blue') + '</div>' + sourceStrip(x) + '<div class="rd5-detail-tabs">' + [['overview', '目标与讨论'], ['evidence', '证据与反证'], ['options', '方案与决策'], ['history', '研究轨迹']].map(t => btn(t[1], 'tab', t[0], tab === t[0] ? 'active' : '')).join('') + '</div>';
    if (tab === 'overview') body += '<section class="rd5-raw"><span>保留的原始表达</span><p>' + h(x.raw) + '</p></section>' +
      '<h3 class="mt24">研究问题</h3><p class="rd5-paragraph">' + h(x.question || '尚未明确。先讨论想解决什么问题。') + '</p>' +
      '<h3 class="mt24">研究验收</h3><p class="rd5-paragraph">' + h(x.criteria || '讨论后明确输出和可检验结论。') + '</p>' +
      '<h3 class="mt24">待验证假设</h3><ul class="rd5-hypotheses">' + x.hypotheses.map(t => '<li>' + h(t) + '</li>').join('') + '</ul>' +
      '<div class="row wrap mt24">' + (admin() ? btn('讨论并完善问题', 'discussion', id, 'primary', 'chat') : '') + '</div>' +
      '<h3 class="mt24">讨论记录</h3><div class="rd5-discussions">' + (x.discussions.length ? x.discussions.map(d => '<article><div class="row between"><strong>' + h(d.author) + '</strong><time>' + h(d.time) + '</time></div><p>' + h(d.text) + '</p></article>').join('') : '<p class="muted small">尚未讨论，原始表达完整保留。</p>') + '</div>';
    if (tab === 'evidence') body += notice('这些是可核查的来源候选。内部材料、外部来源、反证与未知分别标记；原型不实际联网取证。') + '<div class="rd5-evidence-grid mt24">' + x.evidence.map(e => evidenceRow(e, id)).join('') + '</div>' + (!x.evidence.length ? '<div class="empty">还没有证据。深研会整理候选，也可以手动补充。</div>' : '') + (admin() ? btn('补充支持或反证', 'evidence', id, 'primary mt24', 'plus') : '');
    if (tab === 'options') body += '<h3>方案比较</h3><div class="rd5-options mt16">' + x.options.map(o => '<article class="rd5-option ' + (o.recommended ? 'rd5-recommended' : '') + '"><div class="row between"><strong>' + h(o.title) + '</strong>' + (o.recommended ? badge('建议先验证', 'green') : badge('替代方案')) + '</div><p>' + h(o.approach) + '</p>' + fieldRow('工作量', o.effort) + fieldRow('预算判断', o.budget) + fieldRow('预期价值', o.benefit) + fieldRow('限制 / 风险', o.risk) + '</article>').join('') + '</div>' + (!x.options.length ? notice('有限深研完成后形成候选方案，也可以先手动记录一个可比较的方向。') : '') +
      (admin() ? btn('增加比较方案', 'option', id, 'mt16', 'plus') : '') +
      '<h3 class="mt24">研究结论</h3><p class="rd5-paragraph">' + h(x.findings || '尚未形成结论，未知内容保留未知。') + '</p>' +
      (x.decision ? '<section class="rd5-decision"><strong>' + (x.decision.choice === 'accepted' ? '采纳' : x.decision.choice === 'deferred' ? '暂存' : '否决') + ' · ' + h(x.decision.time) + '</strong><p>' + h(x.decision.reason) + '</p></section>' : notice('由你决定采纳、暂存或否决。研究结束本身不自动创建项目。')) +
      (x.projectId ? '<div class="rd5-decision rd5-accepted"><strong>已转成项目</strong><p>' + h(S.projects.find(p => p.id === x.projectId)?.name || '关联项目') + '</p>' + B('查看项目目标与验收', 'project', x.projectId, 'primary compact', 'project') + '</div>' : '');
    if (tab === 'history') body += stageRail(x) + '<div class="rd5-metrics rd5-detail-metrics">' + [['费用', '¥' + x.cost.toFixed(2), '上限 ¥' + x.plan.budget], ['研究时间', x.minutes + ' 分钟', '上限 ' + x.plan.minutes + ' 分钟'], ['重试', x.retries + ' / ' + x.plan.retryLimit, '有限重试'], ['执行节点', S.machines.find(m => m.id === x.plan.machine)?.name || '待分配', '读取模拟节点状态']].map(a => '<div class="rd5-metric"><span>' + h(a[0]) + '</span><strong>' + h(a[1]) + '</strong><small>' + h(a[2]) + '</small></div>').join('') + '</div>' +
      '<div class="rd5-timeline">' + x.timeline.map(a => '<article><span></span><div><strong>' + h(a.text) + '</strong><time>' + h(a.time) + '</time></div></article>').join('') + '</div>' +
      (x.blockReason ? notice(x.blockReason, 'amber') : '') +
      (admin() ? '<div class="row wrap mt24">' + btn('调整研究边界', 'plan', id, '', 'edit') + btn('模拟检索失败', 'failure', id, '', 'info') + '</div>' : '');
    let footer = '';
    if (admin()) {
      if (x.status === 'researching') footer = btn('暂停研究', 'pause', id, '', 'pause') + btn('推进一步演示', 'advance', id, 'primary', 'play');
      else if (['paused', 'waitingQuota', 'waitingResource', 'blocked'].includes(x.status)) footer = btn('补充输入 / 调整边界', 'plan', id, '', 'edit') + btn('明确恢复', 'resume', id, 'primary', 'play');
      else if (x.status === 'accepted') footer = btn('转为项目', 'convert', id, 'primary', 'project') + btn('修改决定', 'decision', id, '', 'edit');
      else if (x.status === 'converted') footer = B('查看关联项目', 'project', x.projectId, 'primary', 'project');
      else footer = btn(['deferred', 'rejected'].includes(x.status) ? '重新评估' : '设定有限深研', 'plan', id, '', 'search') + btn('做出决定', 'decision', id, 'primary', 'check');
    } else footer = B('关闭', 'close-overlay');
    drawer(x.title, '灵感与深研 · 原文、证据、方案和决定可以追溯', body, footer);
  };
  J5.overlays['rd-detail'] = researchDetail;
  J5.overlays['rd-search'] = () => modal('查找一个想法', formStart('v5-rd-search') + field('标题、原话或研究问题', 'query', U.rd5Query || '', 'text') + formEnd(), formFooter('查找', 'v5-rd-search'));
  J5.overlays['rd-capture'] = origin => {
    const voice = origin === 'voice', kind = U.rd5CaptureKind || 'idea';
    const scopeOptions = admin() ? Object.entries(scopeNames) : [['private', '仅我本人']];
    modal(voice ? '语音记一下 · 可编辑模拟转写' : '保留一段原话',
      notice(voice ? '无需麦克风权限。你可以修改下面的模拟转写；这不是实际语音识别。' : '只提交你选择的内容，不读取电脑文件、环境音频或外部资料。') +
      formStart('v5-rd-capture') + selectField('记录类型', 'kind', Object.entries(iKinds), kind) + field('标题', 'title', voice ? '一个新的想法' : '') +
      field('保留的原始内容', 'text', voice ? '我想先研究一个可靠的小样本，再把它转成有验收条件的项目。' : '', 'textarea', 'required maxlength="6000"') +
      selectField('记录入口', 'origin', Object.entries(terms).filter(x => x[0] !== 'passive'), voice ? 'voice' : 'manual') +
      field('来源终端', 'terminal', voice ? '个人语音入口 · 模拟转写' : '当前网页 · 主动记录', 'text', 'required') +
      selectField('范围', 'scope', scopeOptions, admin() ? 'personal' : 'private') +
      (admin() ? selectField('来源项目', 'project', [['', '不关联项目']].concat(S.projects.map(p => [p.id, p.name])), '') : '') +
      '<div class="help full">所属人：' + h(who(S.profile)) + '。私人记忆候选自动使用本人范围。原始记录保存到统一收件箱。</div>' + formEnd(),
      formFooter('保存到收件箱', 'v5-rd-capture'), true);
  };
  J5.overlays['rd-discussion'] = id => {
    const x = idea(id); if (!x) return;
    modal('把想法变成可研究的问题', formStart('v5-rd-discussion', id) +
      field('本次讨论或补充', 'discussion', '', 'textarea', 'required') + field('现在要研究的问题', 'question', x.question, 'textarea', 'required') +
      field('可检验的假设（每行一个）', 'hypotheses', x.hypotheses.join('\n'), 'textarea') +
      field('研究产出与验收', 'criteria', x.criteria, 'textarea', 'required') + formEnd(), formFooter('保存讨论与问题', 'v5-rd-discussion'), true);
  };
  J5.overlays['rd-plan'] = id => {
    const x = idea(id); if (!x) return;
    modal('有限深研：目标、资源和停止边界',
      notice('推进按钮模拟研究事件。达到时间、预算或重试上限后停止；不会真实启动模型或联网检索。') +
      formStart('v5-rd-plan', id) + field('研究问题', 'question', x.question || x.title, 'textarea', 'required') +
      field('产出与验收', 'criteria', x.criteria || '列出支持、反证与未知；比较方案；给出可验证的下一步。', 'textarea', 'required') +
      selectField('后台节点', 'machine', S.machines.filter(m => !m.readOnly && !['cloud', 'nas'].includes(m.kind)).map(m => [m.id, m.name]), x.plan.machine) +
      field('费用上限（模拟 ¥）', 'budget', x.plan.budget, 'number', 'min="1" max="10000" step="1" required') +
      field('最长研究时间（模拟分钟）', 'minutes', x.plan.minutes, 'number', 'min="1" max="1440" required') +
      field('最多重试次数', 'retryLimit', x.plan.retryLimit, 'number', 'min="0" max="10" required') +
      field('补充输入 / 故障处理（选填）', 'input', '', 'textarea') +
      '<div class="help full">不会自动恢复你主动暂停的研究。保存边界会开启 / 明确恢复当前研究；达到四个演示阶段后停在待决策。</div>' + formEnd(),
      formFooter('保存边界并明确开始', 'v5-rd-plan'), true);
  };
  J5.overlays['rd-evidence'] = id => modal('记录一项支持、反证或未知', formStart('v5-rd-evidence', id) +
    selectField('证据类型', 'type', [['support', '支持'], ['counter', '反证 / 限制'], ['unknown', '待验证']], 'support') +
    field('标题', 'title', '', 'text', 'required') + field('证据与适用边界', 'summary', '', 'textarea', 'required') +
    field('来源名称 / 地址说明', 'source', '手动提供的来源候选 · 模拟', 'text', 'required') + field('版本、页码、区块或日期', 'locator', '', 'text', 'required') +
    selectField('核查状态', 'status', [['待查证', '待查证'], ['已核对内部方案', '已核对内部方案'], ['待真实样本验证', '待真实样本验证']], '待查证') +
    '<div class="help full">原型只保存你填写的来源卡，不读取网址，也不宣称已经验证外部事实。</div>' + formEnd(), formFooter('保存证据候选', 'v5-rd-evidence'), true);
  J5.overlays['rd-evidence-preview'] = id => {
    const [rid, eid] = id.split('|'), x = idea(rid), e = x?.evidence.find(e => e.id === eid); if (!e) return;
    modal(e.title, '<div class="rd5-raw"><span>来源候选 · 模拟资料预览</span><p>' + h(e.summary) + '</p></div>' + fieldRow('来源', e.source) + fieldRow('定位与版本', e.locator) + fieldRow('核查', e.status) + notice('这是记录的资料卡；没有实际打开或核验任何外部网站。'), btn('回到研究', 'detail', rid, 'primary'), true);
  };
  J5.overlays['rd-option'] = id => modal('增加可比较的方案', formStart('v5-rd-option', id) + field('方案名称', 'title', '', 'text', 'required') +
    field('实施路径', 'approach', '', 'textarea', 'required') + selectField('工作量', 'effort', [['小', '小'], ['中', '中'], ['大', '大']], '小') +
    field('成本判断', 'budget', '需要用样本实测') + field('预期价值', 'benefit', '', 'textarea', 'required') + field('风险与限制', 'risk', '', 'textarea', 'required') + formEnd(), formFooter('添加方案', 'v5-rd-option'), true);
  J5.overlays['rd-decision'] = id => {
    const x = idea(id); if (!x) return;
    modal('由你决定下一步', notice('采纳会允许转项目，暂存保留条件，否决保留理由。任何决定都不会自动部署线上应用。') + formStart('v5-rd-decision', id) +
      selectField('决定', 'choice', [['accepted', '采纳 · 准备转项目'], ['deferred', '暂存 · 等待条件成熟'], ['rejected', '否决 · 保留理由']], x.decision?.choice || 'accepted') +
      selectField('选定方案', 'option', [['', '尚未选定方案']].concat(x.options.map(o => [o.id, o.title])), x.decision?.option || x.options[0]?.id || '') +
      field('理由、条件与遗留问题', 'reason', x.decision?.reason || '', 'textarea', 'required') + formEnd(), formFooter('保存决定', 'v5-rd-decision'), true);
  };
  J5.overlays['rd-convert'] = id => {
    const x = idea(id); if (!x || x.status !== 'accepted' || x.projectId) return;
    modal('把采纳的研究转为一个项目', formStart('v5-rd-convert', id) + field('项目名称', 'name', x.title, 'text', 'required') +
      field('项目目标', 'goal', x.question, 'textarea', 'required') + field('项目验收', 'criteria', x.criteria, 'textarea', 'required') +
      field('里程碑（每行一个）', 'milestones', '确认目标、证据与环境\n实现首个可验收闭环\n验证测试与关键边界\n交付与实际反馈复盘', 'textarea', 'required') +
      field('仓库标识', 'repo', 'gitea.local/demo/new-research-project') +
      selectField('首个工作副本节点', 'machine', S.machines.filter(m => !m.readOnly && !['cloud', 'nas'].includes(m.kind)).map(m => [m.id, m.name]), x.plan.machine) +
      field('独立工作目录', 'path', '/workspace/research-' + x.id, 'text', 'required') +
      '<div class="help full">项目保留研究来源、决定与验收。创建只登记模拟项目，不创建真实目录、仓库、Agent 会话或线上部署。</div>' + formEnd(),
      formFooter('创建项目并保留研究链路', 'v5-rd-convert'), true);
  };
  J5.overlays['rd-inbox-detail'] = id => {
    const x = entry(id); if (!x) return modal('记录不可见', notice('这个收件不属于当前身份的范围。'), B('关闭', 'close-overlay'));
    let body = '<div class="row wrap between mb20">' + badge(iKinds[x.kind], 'blue') + inboxStatus(x) + '</div>' + sourceStrip(x) + '<section class="rd5-raw mt24"><span>原始记录 · 始终保留</span><p>' + h(x.originalText || x.text) + '</p></section>' +
      ((x.originalText && x.text !== x.originalText) || x.summary ? '<section class="rd5-raw mt16"><span>整理后的内容 / 摘要</span><p>' + h(x.summary || x.text) + '</p></section>' : '') +
      '<div class="detail-grid mt24">' + fieldRow('记录方式', terms[x.origin] || '统一入口') + fieldRow('分流范围', scopeNames[x.scope]) + fieldRow('人物', who(x.owner)) + fieldRow('来源项目', x.project && admin() ? S.projects.find(p => p.id === x.project)?.name || '指定项目' : '未关联 / 当前不可见') + '</div>';
    if (x.extraSources?.length) body += '<h3 class="mt24">合并保留的来源</h3><div class="rd5-discussions">' + x.extraSources.map(s => '<article><strong>' + h(s.terminal) + '</strong><p>' + h(s.time) + ' · 原收件 ' + h(s.originalId) + '</p></article>').join('') + '</div>';
    if (x.revisions?.length) body += '<h3 class="mt24">整理修订记录</h3><div class="rd5-timeline">' + x.revisions.map(r => '<article><span></span><div><strong>' + h(who(r.actor)) + ' 整理；先前内容与原始记录保留</strong><time>' + h(r.time) + '</time></div></article>').join('') + '</div>';
    if (x.needsReview) body += notice('分流后原记录又有修订。目标域保留先前版本，需要显式复核；不会静默改动正式知识、记忆或项目。', 'amber');
    if (x.status === 'duplicate') body += notice('检测到同人、同类型、同范围的相同原文。合并后保留这次的终端与时间，不重复创建对象。', 'amber');
    if (x.targetDomain) body += '<div class="rd5-decision"><strong>已关联目标</strong><p>' + h(x.targetDomain === 'research' ? '灵感与研究' : x.targetDomain === 'experience' ? '经验库' : x.targetDomain === 'memory' ? '私人记忆候选' : '资料导入候选') + ' · ' + h(x.target || '等待目标域接收') + '</p></div>';
    const readOnly = ['routed', 'ignored'].includes(x.status);
    let footer;
    if (!modifiable(x)) footer = B('关闭', 'close-overlay');
    else if (x.status === 'duplicate') footer = btn('合并重复记录', 'merge', id, 'primary', 'link') + btn('保留为独立记录', 'separate', id, '', 'file');
    else if (readOnly) footer = btn('查看分流去向', 'open-target', id, 'primary', 'arrow') + B('关闭', 'close-overlay');
    else footer = btn(x.kind === 'idea' ? (admin() ? '整理为研究灵感' : '保留到我的灵感') : x.kind === 'experience' ? (admin() ? '整理到经验库' : '保存个人知识记录') : x.kind === 'memory' ? '提交本人记忆候选' : (admin() ? '提交资料导入候选' : '保留私人资料候选'), 'route-entry', id, 'primary', 'arrow') + btn('忽略', 'ignore-entry', id, 'ghost');
    if (modifiable(x)) footer += btn('编辑整理', 'edit-capture', id, '', 'edit');
    drawer(x.title, '统一收件 · 原文、终端、人物、范围和去向可以追溯', body, footer);
  };
  J5.overlays['rd-edit-capture'] = id => {
    const x = entry(id); if (!modifiable(x)) return toast('只有记录所属人或管理员可以整理此条。', true);
    modal('整理记录，保留最初原话', formStart('v5-rd-edit-capture', id) + field('标题', 'title', x.title, 'text', 'required') +
      field('整理后的内容', 'text', x.text, 'textarea', 'required') + field('摘要（选填）', 'summary', x.summary || '', 'textarea') +
      field('补充说明', 'annotation', x.annotation || '', 'textarea') + '<div class="help full">原话、终端、人物、项目与权限范围不覆盖。已分流记录的整理不会自动改写目标域。</div>' + formEnd(), formFooter('保存整理与修订', 'v5-rd-edit-capture'), true);
  };
  J5.overlays['rd-policy'] = () => {
    const p = store().capturePolicy;
    modal('被动记录只在你选定的范围', notice('原型不读取日志、目录、屏幕或键盘。这里设置可收集的项目与事件类型，再手动生成一条事件样例。') +
      formStart('v5-rd-policy') + '<label class="check full"><input type="checkbox" name="enabled" ' + (p.enabled ? 'checked' : '') + '> 开启选定范围的被动候选</label>' +
      '<div class="rd5-policy-projects full"><span>指定项目</span>' + S.projects.map(x => '<label class="check"><input type="checkbox" name="scope-' + h(x.id) + '" ' + (p.scopes.includes(x.id) ? 'checked' : '') + '>' + h(x.name) + ' ' + badge(x.scope === 'company' ? '公司指定摘要' : '个人') + '</label>').join('') + '</div>' +
      '<div class="rd5-policy-projects full"><span>允许生成的候选类型</span>' + [['task-summary', '任务结束摘要'], ['validation-failure', '验证失败的选中摘要'], ['service-event', '服务健康事件摘要']].map(a => '<label class="check"><input type="checkbox" name="origin-' + a[0] + '" ' + (p.allowedOrigins.includes(a[0]) ? 'checked' : '') + '>' + a[1] + '</label>').join('') + '</div>' +
      '<div class="help full">不捕获全部公司资料和家庭环境声音。候选经你整理后才进入经验或知识，不自动发布 Skill。</div>' + formEnd(), formFooter('保存明确范围', 'v5-rd-policy'), true);
  };

  const action = (name, isAdmin, run) => { J5.actions['v5-rd-' + name] = {admin: isAdmin, run}; };
  action('detail', false, id => { U.rd5Tab = 'overview'; J5.open('rd-detail', id); });
  action('capture', false, () => { U.rd5CaptureKind = 'idea'; J5.open('rd-capture', 'manual'); });
  action('voice-capture', false, () => { U.rd5CaptureKind = 'idea'; J5.open('rd-capture', 'voice'); });
  action('go-inbox', false, () => J5.navigate('inbox'));
  action('search', true, () => J5.open('rd-search'));
  action('filter', true, id => { U.rd5Filter = id; render(); });
  action('inbox-filter', false, id => { U.rd5InboxFilter = id; render(); });
  action('tab', false, id => { U.rd5Tab = id; renderOverlay(); });
  [['discussion', 'rd-discussion'], ['plan', 'rd-plan'], ['evidence', 'rd-evidence'], ['evidence-preview', 'rd-evidence-preview'], ['option', 'rd-option'], ['decision', 'rd-decision'], ['convert', 'rd-convert']].forEach(([act, overlay]) => action(act, true, id => J5.open(overlay, id)));
  action('inbox-detail', false, id => J5.open('rd-inbox-detail', id));
  action('edit-capture', false, id => J5.open('rd-edit-capture', id));
  action('policy', true, () => J5.open('rd-policy'));
  action('remove-evidence', true, id => { const [rid, eid] = id.split('|'), x = idea(rid); if (!x) return; x.evidence = x.evidence.filter(e => e.id !== eid); log(x, '移除一项证据候选，保留研究轨迹'); commit('已移除候选。'); });
  action('pause', true, id => { const x = idea(id); if (!x || x.status !== 'researching') return; x.status = 'paused'; log(x, '用户主动暂停；只会在明确恢复后继续'); commit('研究已暂停，不自动恢复。'); });
  const resume = id => {
    const x = idea(id); if (!x) return;
    if (S.settings.emergency) return toast('全局急停中，请先解除急停。', true);
    if (['converted', 'accepted', 'deferred', 'rejected'].includes(x.status)) return toast('请先重新评估目标，不直接恢复已决策事项。', true);
    if (x.cost + 6 > x.plan.budget || x.minutes + 6 > x.plan.minutes) { x.status = 'waitingQuota'; x.blockReason = '下一步将超过费用或时间上限。请调整研究边界。'; commit('研究等待新的边界决定。'); return; }
    if (x.retries > x.plan.retryLimit) { x.status = 'blocked'; x.blockReason = '重试达到上限。请补充明确输入并调整方案。'; commit('请先处理阻塞。'); return; }
    if (S.machines.find(m => m.id === x.plan.machine)?.status !== 'online') { x.status = 'waitingResource'; x.blockReason = '执行节点离线。可查看机器资产并明确唤醒。'; commit('研究等待执行节点。'); return; }
    x.status = 'researching'; x.blockReason = ''; log(x, '按当前目标和有效边界明确恢复'); commit('有限深研已开始。');
  };
  action('resume', true, resume);
  action('advance', true, id => {
    const x = idea(id); if (!x) return;
    if (x.status !== 'researching') return toast('研究未在运行。暂停或等待需要你明确处理。', true);
    if (S.settings.emergency) return toast('全局急停中，不推进研究。', true);
    if (S.machines.find(m => m.id === x.plan.machine)?.status !== 'online') { x.status = 'waitingResource'; x.blockReason = '节点离线，保留当前研究阶段。'; log(x, '等待执行节点恢复，不重复启动'); commit('节点离线，研究状态已保存。'); return; }
    if (x.cost + 6 > x.plan.budget || x.minutes + 6 > x.plan.minutes) { x.status = 'waitingQuota'; x.blockReason = '下一步会超过费用 / 时间上限。'; log(x, '到达停止边界，等待你决定'); commit('已停止续作，等待预算或时间决定。'); return; }
    x.stage = Math.min(4, x.stage + 1); x.cost = Number((x.cost + 6).toFixed(2)); x.minutes += 6;
    log(x, '模拟研究事件：' + stages[x.stage - 1] + '已整理');
    if (x.stage === 2 && !x.evidence.length) x.evidence.push({id: uid('ev'), type: 'support', title: '原始问题与内部目标说明', summary: '根据保留的原话和研究目标整理的支持候选。不是联网取回的事实。' + x.raw, source: '本次收件原文 · 内部模拟资料', locator: x.id + ' / 原始记录', status: '待查证'});
    if (x.stage === 3 && !x.evidence.some(e => e.type === 'counter')) x.evidence.push({id: uid('ev'), type: 'counter', title: '真实环境与效果尚未验证', summary: '现有内部资料不能证明全部可行性。需用一项真实样本验证效果、成本、权限和恢复。', source: '研究风险检查表 · 模拟', locator: 'risk-demo-v1', status: '待真实样本验证'});
    if (x.stage === 4) {
      if (!x.options.length) x.options.push({id: uid('opt'), title: '先做一个可验收的小样本', approach: '选择明确范围，验证关键假设，再决定是否扩展。', effort: '小', budget: '按样本结果决定', benefit: '减少一次性投入，验收和未知清楚', risk: '样本结果不能直接外推全部范围', recommended: true}, {id: uid('opt'), title: '暂缓，先补齐输入', approach: '补充真实资料、访问条件和验收后再执行。', effort: '小', budget: '先控制研究成本', benefit: '避免证据不足时过早开发', risk: '交付延后', recommended: false});
      x.findings = '模拟研究建议：先以一个有边界的样本验证“' + x.question + '”。已列支持与限制，真实效果尚未证实。请采纳、暂存或否决；采纳后才能转成项目。';
      x.status = 'review'; log(x, '模拟研究已完成，停在待本人决策；没有自动建项目或部署');
    }
    commit(x.stage === 4 ? '研究完成，等待你做出决定。' : '已推进一个有记录的研究阶段。');
  });
  action('failure', true, id => {
    const x = idea(id); if (!x || x.status !== 'researching') return toast('只有运行中的研究可以模拟失败。', true);
    x.retries++; x.status = x.retries > x.plan.retryLimit ? 'blocked' : 'paused'; x.blockReason = '模拟来源检索失败；' + (x.retries > x.plan.retryLimit ? '超过重试上限，请补充输入。' : '暂停等待明确重试，不生成伪证据。');
    log(x, x.blockReason); commit('已保留失败原因、尝试和当前阶段。');
  });
  action('ignore-entry', false, id => { const x = entry(id); if (!modifiable(x) || x.status === 'routed') return; x.status = 'ignored'; x.processedAt = time(); commit('已忽略，原始记录保留。'); });
  action('separate', false, id => { const x = entry(id); if (!modifiable(x)) return; x.status = 'pending'; x.duplicateOf = ''; commit('已保留为独立记录，可继续整理。'); });
  action('merge', false, id => {
    const x = entry(id), base = x && entry(x.duplicateOf); if (!modifiable(x) || !modifiable(base)) return toast('原记录当前不可编辑，无法合并。', true);
    base.extraSources = base.extraSources || []; base.extraSources.push({terminal: x.terminal, time: x.created, originalId: x.id});
    x.status = 'routed'; x.target = base.target || base.id; x.targetDomain = base.targetDomain || 'inbox'; x.mergedInto = base.id; x.processedAt = time(); commit('已合并来源，没有重复创建任务或记忆。');
  });
  action('route-entry', false, id => {
    const x = entry(id); if (!modifiable(x) || !['pending', 'waitingTarget'].includes(x.status)) return toast('该记录不可编辑或已处理，避免重复分流。', true);
    if (x.kind === 'idea') {
      const obj = makeIdea(x.title, x.text, {owner: x.owner, scope: x.scope, terminal: x.terminal, origin: x.origin, created: x.created, sourceInbox: x.id, sourceProject: x.project});
      log(obj, '从统一收件箱保留原文转入灵感'); store().items.unshift(obj); x.target = obj.id; x.targetDomain = 'research'; x.status = 'routed'; persist();
      U.rd5Tab = 'overview'; J5.open('rd-detail', obj.id); commit(admin() ? '灵感已就位，可讨论和深研。' : '已保留到你的私人灵感，不启动研发任务。'); return;
    }
    if (x.kind === 'experience') {
      const k = {id: uid('k'), kind: admin() ? 'experience' : 'family', title: x.title, summary: x.text.slice(0, 110), content: '原始记录：\n' + x.text + '\n\n来源：' + x.terminal + '\n记录人：' + who(x.owner) + '\n发生时间：' + x.created + '\n\n适用条件、处理过程和验证结果：待整理。',
        scope: x.scope, owner: x.owner, project: admin() ? x.project : '', machine: '', verified: false, status: '待验证', tags: ['收件箱', '待整理'], date: x.created, uses: 0, sourceInbox: x.id};
      S.knowledge.unshift(k); x.status = 'routed'; x.target = k.id; x.targetDomain = 'experience'; persist(); commit('已进入现有经验流程；验证后可提炼 Skill。'); show('knowledge-detail', k.id); return;
    }
    if (x.kind === 'memory') {
      if (typeof J5.acceptMemory !== 'function') { x.status = 'waitingTarget'; x.targetDomain = 'memory'; commit('保留原始记录，等待记忆域确认接口。'); return; }
      const result = J5.acceptMemory({owner: x.owner, text: x.text, source: '统一收件 ' + x.id, terminal: x.terminal, scope: 'private'});
      if (!result) { x.status = 'waitingTarget'; x.targetDomain = 'memory'; commit('目标域未确认接收；原文保留，避免误报成功。'); return; }
      x.target = typeof result === 'string' ? result : result?.id || '记忆候选'; x.targetDomain = 'memory'; x.status = 'routed'; persist(); commit('只提交到私人记忆候选，尚未确认生效。'); J5.navigate('memory'); return;
    }
    if (!admin()) { x.status = 'waitingTarget'; x.targetDomain = 'material'; commit('私人资料候选已保留，未上传或共享到知识工坊。'); return; }
    if (typeof J5.acceptMaterial !== 'function') { x.status = 'waitingTarget'; x.targetDomain = 'material'; commit('资料原文已保留，等待资料域接收。'); return; }
    const result = J5.acceptMaterial({title: x.title, text: x.text, owner: x.owner, terminal: x.terminal, scope: x.scope});
    if (!result) { x.status = 'waitingTarget'; x.targetDomain = 'material'; commit('资料域未确认接收；原文保留，稍后可重试。'); return; }
    x.target = typeof result === 'string' ? result : result?.id || '资料候选'; x.targetDomain = 'material'; x.status = 'routed'; persist(); commit('已提交资料导入候选，没有发布基库或教材。'); J5.navigate('temple');
  });
  action('open-target', false, id => {
    const x = entry(id); if (!x) return;
    if (x.mergedInto) return J5.open('rd-inbox-detail', x.mergedInto);
    if (x.targetDomain === 'research') return J5.open('rd-detail', x.target);
    if (x.targetDomain === 'experience') return show('knowledge-detail', x.target);
    if (x.targetDomain === 'memory') return J5.navigate('memory');
    if (x.targetDomain === 'material' && admin()) return J5.navigate('temple');
    toast(x.status === 'ignored' ? '记录已忽略，原文保留。' : '记录仍在当前收件箱，尚未发布。');
  });
  action('passive-demo', true, () => {
    const p = store().capturePolicy;
    if (!p.enabled || !p.scopes.length || !p.allowedOrigins.length) return J5.open('rd-policy');
    const pid = p.scopes[0], project = S.projects.find(x => x.id === pid);
    if (!project) return toast('指定项目已不存在，请调整采集范围。', true);
    const kind = p.allowedOrigins[0];
    const id = J5.capture({kind: 'experience', title: '指定项目事件摘要 · ' + project.name, text: '模拟事件：仅在已选择的“' + project.name + '”范围整理 ' + kind + '。测试配置与环境不一致，经过只读检查生成候选，尚未确认原因或发布 Skill。', scope: project.scope === 'company' ? 'company' : 'personal', terminal: '指定项目事件入口 · 模拟', project: pid, origin: 'passive'});
    p.last = time(); p.events.unshift({id, time: time(), project: pid, type: kind}); U.rd5InboxFilter = 'pending'; commit('已生成一条选定范围的事件候选；没有实际采集。');
  });

  const form = (name, isAdmin, run) => { J5.forms['v5-rd-' + name] = {admin: isAdmin, run}; };
  form('search', true, f => { U.rd5Query = String(f.query || '').trim(); closeOverlay(); J5.navigate('research'); });
  form('capture', false, f => {
    const id = J5.capture(f); if (!id) return toast('请填写要保留的原始内容。', true);
    U.rd5InboxFilter = entry(id)?.status === 'duplicate' ? 'duplicate' : 'pending'; closeOverlay(); commit('原始记录已保存，可选择归属。'); J5.navigate('inbox'); J5.open('rd-inbox-detail', id);
  });
  form('edit-capture', false, (f, id) => {
    const updated = J5.updateCapture(id, f); if (!updated) return toast('无法保存，请检查本人范围和记录内容。', true);
    closeOverlay(); commit('整理已保存，原话和来源仍可追溯。'); J5.open('rd-inbox-detail', id);
  });
  form('discussion', true, (f, id) => {
    const x = idea(id); if (!x) return;
    x.question = f.question.trim(); x.criteria = f.criteria.trim(); x.hypotheses = String(f.hypotheses || '').split('\n').map(t => t.trim()).filter(Boolean);
    x.discussions.push({author: who(S.profile), text: f.discussion.trim(), time: time()});
    x.discussions.push({author: '管家 · 模拟', text: '已按你的补充整理问题、假设和验收。下一步可设定有限深研，支持与反证分别记录。', time: time()});
    if (!['converted', 'accepted'].includes(x.status)) x.status = 'discussion'; log(x, '讨论补充已保存，原始表达保持不变'); closeOverlay(); U.rd5Tab = 'overview'; commit('问题和讨论已更新。'); J5.open('rd-detail', id);
  });
  form('plan', true, (f, id) => {
    const x = idea(id); if (!x || x.projectId) return;
    x.question = f.question.trim(); x.criteria = f.criteria.trim(); x.plan = {machine: f.machine, budget: Number(f.budget), minutes: Number(f.minutes), retryLimit: Number(f.retryLimit)};
    if (f.input?.trim()) { x.discussions.push({author: who(S.profile), text: f.input.trim(), time: time()}); x.retries = 0; log(x, '已补充输入并明确重试方案'); }
    if (['accepted', 'deferred', 'rejected', 'review'].includes(x.status) && x.stage >= 4) {
      x.previousAttempts = x.previousAttempts || [];
      x.previousAttempts.unshift({id: uid('research-run'), cost: x.cost, minutes: x.minutes, findings: x.findings, decision: x.decision, evidenceIds: x.evidence.map(e => e.id), time: time()});
      x.stage = 0; x.cost = 0; x.minutes = 0; x.retries = 0; x.findings = ''; x.decision = null;
      log(x, '建立新一轮研究尝试，先前结论、费用和决定已存档');
    }
    x.status = 'paused'; closeOverlay(); resume(id); U.rd5Tab = 'history'; J5.open('rd-detail', id);
  });
  form('evidence', true, (f, id) => { const x = idea(id); if (!x) return; x.evidence.push({id: uid('ev'), type: f.type, title: f.title.trim(), summary: f.summary.trim(), source: f.source.trim(), locator: f.locator.trim(), status: f.status}); log(x, '补充' + (f.type === 'counter' ? '反证 / 限制' : f.type === 'unknown' ? '待验证项' : '支持证据')); closeOverlay(); U.rd5Tab = 'evidence'; commit('证据候选已保存。'); J5.open('rd-detail', id); });
  form('option', true, (f, id) => { const x = idea(id); if (!x) return; x.options.push({id: uid('opt'), title: f.title.trim(), approach: f.approach.trim(), effort: f.effort, budget: f.budget, benefit: f.benefit, risk: f.risk, recommended: false}); log(x, '增加可比较方案：' + f.title); closeOverlay(); U.rd5Tab = 'options'; commit('比较方案已保存。'); J5.open('rd-detail', id); });
  form('decision', true, (f, id) => {
    const x = idea(id); if (!x || x.projectId) return;
    x.decision = {choice: f.choice, reason: f.reason.trim(), option: f.option || '', time: time()}; x.status = f.choice;
    log(x, '本人决定：' + rStates[f.choice][0] + '；' + f.reason.trim()); record('研究决定：' + x.title, '研究 ' + id, rStates[f.choice][0]);
    closeOverlay(); U.rd5Tab = 'options'; commit(f.choice === 'accepted' ? '研究已采纳，可转为项目。' : '决定和理由已归档。'); J5.open('rd-detail', id);
  });
  form('convert', true, (f, id) => {
    const x = idea(id); if (!x || x.status !== 'accepted' || x.projectId) return toast('请先采纳；已关联项目不会重复创建。', true);
    const milestones = String(f.milestones || '').split('\n').map(s => s.trim()).filter(Boolean); if (!milestones.length) return toast('至少需要一个里程碑。', true);
    const pid = uid('p');
    S.projects.unshift({id: pid, name: f.name.trim(), desc: '由研究“' + x.title + '”转化；原始灵感、证据和决定仍可追溯。', scope: x.scope === 'company' ? 'company' : 'personal', stage: '准备启动', progress: 0, color: '', icon: 'project',
      goal: f.goal.trim(), criteria: f.criteria.trim(), repo: f.repo || '待登记', copies: [{machine: f.machine, path: f.path.trim(), branch: 'main'}], milestones, doneMilestones: [], researchId: id, sourceIdea: id, deliveryRequirements: '交付版本、验收证据、使用说明、遗留事项与复盘。正式部署走运维审批。'});
    x.projectId = pid; x.status = 'converted'; log(x, '研究转为项目 ' + f.name + '；目标、验收、里程碑与独立工作副本已登记'); record('研究转项目：' + f.name, '研究 ' + id + ' → 项目 ' + pid, '已登记');
    closeOverlay(); commit('项目已创建，可从项目空间派发明确任务。'); show('project', pid);
  });
  form('policy', true, f => {
    const p = store().capturePolicy, next = {enabled: f.enabled === 'on', scopes: S.projects.filter(x => f['scope-' + x.id] === 'on').map(x => x.id), allowedOrigins: ['task-summary', 'validation-failure', 'service-event'].filter(x => f['origin-' + x] === 'on')};
    if (next.enabled && (!next.scopes.length || !next.allowedOrigins.length)) return toast('开启被动候选时，请选择项目与事件类型。', true);
    Object.assign(p, next);
    closeOverlay(); record('更新选定记录范围', '统一收件箱', p.enabled ? '已开启指定范围' : '已关闭'); commit('采集范围已保存，原型不会实际扫描。');
  });

  J5.boards.research = {
    title: '灵感与深研', subtitle: '目标、证据、边界、决定与项目转化',
    render() {
      const list = ideas();
      return '<div class="rd5-board-metrics">' + [['灵感池', list.length], ['有限深研', list.filter(x => x.status === 'researching').length], ['等待决策', list.filter(x => x.status === 'review').length], ['已转项目', list.filter(x => x.projectId).length]].map(a => '<article><span>' + h(a[0]) + '</span><strong>' + a[1] + '</strong></article>').join('') + '</div><div class="rd5-board-grid"><section><h3>当前研究路线</h3>' + list.filter(x => !['rejected', 'deferred'].includes(x.status)).slice(0, 4).map(x => '<article class="rd5-board-row"><div><strong>' + h(x.title) + '</strong><small>' + h(x.question || x.raw) + '</small><div class="mt16">' + progress(x.stage * 25) + '</div></div>' + stateBadge(x) + btn('详情', 'detail', x.id, 'compact') + '</article>').join('') + '</section><section><h3>每份结论都留证据</h3><div class="rd5-board-proof"><span>' + list.reduce((n, x) => n + x.evidence.length, 0) + '</span><p>来源候选 · 模拟数据</p><strong>' + list.reduce((n, x) => n + x.evidence.filter(e => e.type === 'counter').length, 0) + ' 项反证 / 限制</strong></div><p class="rd5-board-note">未经本人决定，不自动转项目；项目交付后还需部署验证与使用反馈。</p>' + btn('打开研究工作台', 'open-research', '', 'primary') + '</section></div>';
    }
  };
  action('open-research', true, () => J5.navigate('research'));
  J5.snapshots = J5.snapshots || {};
  J5.snapshots.research = () => {
    const list = ideas(), pending = list.filter(x => ['review', 'blocked', 'waitingQuota', 'waitingResource'].includes(x.status));
    return {summary: list.length + ' 条可见灵感，' + pending.length + ' 项需要处理，' + list.filter(x => x.projectId).length + ' 项已转项目。来源与费用均为模拟。',
      metrics: [{label: '有限深研', value: list.filter(x => x.status === 'researching').length}, {label: '待决策', value: list.filter(x => x.status === 'review').length}, {label: '已转项目', value: list.filter(x => x.projectId).length}],
      pending: pending.map(x => ({id: x.id, title: x.title, status: rStates[x.status][0], action: 'v5-rd-detail'}))};
  };
})();
