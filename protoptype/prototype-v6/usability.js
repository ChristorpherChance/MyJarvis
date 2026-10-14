/* Shared V6 capability directory and role-aware priorities. No business state writes. */
(function (global) {
  'use strict';
  const groups = [
    {id: 'family', name: '家庭陪伴', purpose: '聊天、学习和照顾日常', icon: 'family'},
    {id: 'knowledge', name: '知识记忆', purpose: '积累资料，也了解每个人', icon: 'book'},
    {id: 'create', name: '创造交付', purpose: '从一句想法到实际成果', icon: 'bolt'},
    {id: 'operate', name: '设备运行', purpose: '看清状态，处理需要关注的事', icon: 'machine'}
  ];
  const catalog = [
    {route: 'chat', group: 'family', name: '和管家聊聊', purpose: '说说今天、问个问题，或直接交代一件事。', icon: 'chat', words: '语音 聊天 对话 陪伴 说话 天气 做菜 健康 英语'},
    {route: 'family', group: 'family', name: '安排家庭生活', purpose: '一起安排共同事项，查天气、做菜和生活信息。', icon: 'family', words: '家人 家庭 日程 待办 菜谱 计时 天气 健康'},
    {route: 'learning', group: 'family', name: '练语言、学新知', purpose: '做一段轻松的练习，看看自己的学习与复习记录。', icon: 'language', words: '英语 日语 法语 历史 科学 语言 小测 学习 复习'},
    {route: 'personas', group: 'family', name: '调整我的管家', purpose: '选择喜欢的声音、称呼、语速和交流方式。', icon: 'speaker', words: '声音 声线 唤醒词 称呼 个性 档案 习惯 语速'},
    {route: 'sources', group: 'knowledge', name: '连接更多资料', purpose: '接入新的资料来源，查看同步和可使用的范围。', icon: 'link', words: '知识库 接入 来源 文件 NAS 检索 同步'},
    {route: 'temple', group: 'knowledge', name: '读经典、听故事', purpose: '探索有出处的故事和知识关系，继续自己的课程。', icon: 'book', words: '知识神殿 原文 经典 书籍 故事 课程 图谱 关系'},
    {route: 'collation', group: 'knowledge', name: '核对扫描原文', purpose: '对照书页处理疑点，核对之后再发布正式原文。', icon: 'edit', words: '扫描 OCR 原件 原文 校对 疑点 校勘 发布'},
    {route: 'memory', group: 'knowledge', name: '管理我的记忆', purpose: '确认希望管家记住的事，也能修改或选择忘记。', icon: 'heart', words: '记忆神殿 偏好 习惯 候选 私人 遗忘 记住'},
    {route: 'knowledge', group: 'knowledge', name: '复用经验与技能', purpose: '查过去怎样解决问题，把验证过的方法用到新任务。', icon: 'code', words: '经验 教训 Skill 技能 Runbook 文档 知识 排查', familyName: '查家庭资料', familyPurpose: '查家人共享的资料，或查看自己的私人记录。', familyWords: '家庭 资料 知识 菜谱 学习 私人 健康 记录'},
    {route: 'research', group: 'create', name: '把想法研究清楚', purpose: '保存灵感、比较证据和方案，再决定是否做成项目。', icon: 'bolt', words: '灵感 深研 研究 证据 方案 反证 决策'},
    {route: 'projects', group: 'create', name: '管理我的项目', purpose: '看目标、里程碑和项目在哪台机器上开发。', icon: 'project', words: '项目 仓库 Git 分支 worktree 工作副本 里程碑'},
    {route: 'tasks', group: 'create', name: '跟进 AI 开发', purpose: '查看 Codex 和 CC 的进展、阻塞与验收，随时暂停。', icon: 'tasks', words: '开发监督 Codex CC Claude Code 任务 24小时 托管 暂停 验收'},
    {route: 'inbox', group: 'create', name: '随手记录、整理', purpose: '留下原话，再把灵感、经验、资料和记忆送到合适的位置。', icon: 'file', words: '收件箱 记录 灵感 经验 资料 记忆 候选 语音 去重', familyName: '整理我的记录', familyPurpose: '保留自己的想法和原话，再整理为私人记录或记忆候选。'},
    {route: 'approvals', group: 'create', name: '处理需要确认的事', purpose: '看清具体影响和恢复方法，再决定是否执行。', icon: 'shield', words: '审批 审计 确认 部署 回滚 权限 决策'},
    {route: 'overview', group: 'operate', name: '今天的概览', purpose: '先看最需要你处理的事，再了解所有工作的进展。', icon: 'home', words: '总览 控制台 今日 晨报 概览 状态'},
    {route: 'services', group: 'operate', name: '查看运行中的应用', purpose: '看看已部署应用是否健康，检查发布和恢复过程。', icon: 'cloud', words: '应用 服务 在线 部署 交付包 发布 版本 健康 恢复'},
    {route: 'machines', group: 'operate', name: '看机器现在忙什么', purpose: '查看设备是否在线、运行什么项目以及资源使用。', icon: 'machine', words: '机器 设备 服务器 资产 在线 离线 CPU GPU 内存 唤醒'},
    {route: 'operations', group: 'operate', name: '检查运行与费用', purpose: '看资源、费用、备份与恢复，调整自动运行边界。', icon: 'chart', words: '运行 费用 预算 功耗 资源 备份 恢复 配额'},
    {route: 'screen', group: 'operate', name: '大屏看全局', purpose: '把机器、项目和所有事项放在一张清晰的大屏上。', icon: 'screen', words: '大屏 全屏 总控 看板 矩阵 家庭', familyName: '家庭大屏', familyPurpose: '一起看共同安排、公开信息和家庭学习入口。'},
    {route: 'settings', group: 'operate', name: '调整设置', purpose: '调整外观、通知、隐私和执行策略。', icon: 'settings', words: '设置 外观 通知 隐私 模型 执行 语音 数据', familyName: '我的设置', familyPurpose: '调整自己的使用体验、通知和隐私偏好。'}
  ];
  const ui = {query: '', category: 'all', context: ''};
  const normalizeCategory = value => ({creation: 'create', operations: 'operate'}[value] || value || 'all');
  const esc = value => typeof E === 'function' ? E(value) : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const icon = (name, size = 20) => typeof I === 'function' ? I(name, size) : '';
  const runtime = () => typeof J5 === 'undefined' ? null : J5;
  const currentState = () => typeof S === 'undefined' ? {} : S;
  const isPublic = () => Boolean(runtime()?.isPublic?.());
  const isManager = () => !isPublic() && typeof admin === 'function' && admin();
  const profileId = () => currentState().profile || '';
  const identityName = () => isPublic() ? '家庭公共空间' : typeof P === 'function' ? P().name : '我的空间';
  function context() {
    const next = profileId() + ':' + isPublic() + ':' + isManager();
    if (ui.context !== next) { ui.context = next; ui.query = ''; ui.category = 'all'; }
    return next;
  }
  function canNavigate(route) {
    const j5 = runtime();
    if (!j5 || !catalog.some(item => item.route === route)) return false;
    if (isPublic()) return ['chat', 'screen'].includes(route);
    return isManager() || Boolean(j5.publicRoutes?.has?.(route));
  }
  function contextualItem(item) {
    const family = !isManager();
    return {...item, name: family && item.familyName || item.name, purpose: family && item.familyPurpose || item.purpose, words: family && item.familyWords || item.words};
  }
  function listCapabilities(options = {}) {
    context();
    const query = String(options.query ?? ui.query).trim().toLocaleLowerCase();
    const category = options.category ?? ui.category;
    return catalog.filter(item => canNavigate(item.route)).map(contextualItem).filter(item =>
      (category === 'all' || item.group === category) && (!query || (item.name + ' ' + item.purpose + ' ' + item.words).toLocaleLowerCase().includes(query))
    );
  }
  const directoryCard = item => '<button class="j6-u-capability" data-j6-act="navigate" data-j6-route="' + esc(item.route) + '" aria-label="' + esc(item.name + '：' + item.purpose) + '">' +
    '<span class="j6-u-cap-icon" aria-hidden="true">' + icon(item.icon, 23) + '</span><span class="j6-u-cap-text"><strong>' + esc(item.name) + '</strong><span>' + esc(item.purpose) + '</span></span><span class="j6-u-cap-arrow" aria-hidden="true">' + icon('arrow', 17) + '</span></button>';
  function renderDirectory(options = {}) {
    context();
    if (typeof options === 'string') options = {category: options};
    if (options.category != null) {
      const initial = normalizeCategory(options.category);
      ui.category = initial === 'all' || groups.some(group => group.id === initial) ? initial : 'all';
      ui.query = '';
    }
    const available = catalog.filter(item => canNavigate(item.route));
    const selected = listCapabilities();
    const id = options.id || 'j6-directory';
    return '<section class="j6-u-directory" id="' + esc(id) + '" data-j6-directory><header class="j6-u-directory-head"><div><span class="j6-u-eyebrow">能力目录</span><h2>你想让管家做什么？</h2><p>' + (isPublic() ? '先聊公共内容。确认档案后，再进入属于自己的空间。' : '不用记住菜单在哪里，从想做的事开始。') + '</p></div><span class="j6-u-context">' + icon(isPublic() ? 'family' : 'shield', 14) + esc(identityName()) + '</span></header>' +
      (isPublic() ? '<div class="j6-u-identity-note"><span>' + icon('lock', 16) + '私人记录与管理事项需要确认身份。</span><button data-j6-act="identify">选择我的档案' + icon('arrow', 15) + '</button></div>' : '') +
      '<label class="j6-u-search"><span aria-hidden="true">' + icon('search', 19) + '</span><input type="search" data-j6-search aria-label="搜索可用功能" placeholder="' + (isPublic() ? '找一找：聊天、家庭大屏…' : '找一找：练英语、听故事、看任务…') + '" value="' + esc(ui.query) + '" autocomplete="off"><span class="j6-u-search-count">' + selected.length + ' 项</span></label>' +
      '<nav class="j6-u-categories" aria-label="按用途筛选"><button class="' + (ui.category === 'all' ? 'is-active' : '') + '" data-j6-act="category" data-j6-category="all" aria-pressed="' + (ui.category === 'all') + '">全部<span>' + available.length + '</span></button>' +
      groups.filter(group => available.some(item => item.group === group.id)).map(group => '<button class="' + (ui.category === group.id ? 'is-active' : '') + '" data-j6-act="category" data-j6-category="' + group.id + '" aria-pressed="' + (ui.category === group.id) + '">' + group.name + '<span>' + available.filter(item => item.group === group.id).length + '</span></button>').join('') + '</nav>' +
      '<div class="j6-u-directory-results" aria-live="polite">' + (selected.length ? groups.filter(group => selected.some(item => item.group === group.id)).map(group => '<section class="j6-u-feature-group"><div class="j6-u-group-label"><h3>' + group.name + '</h3><span>' + group.purpose + '</span></div><div class="j6-u-feature-grid">' + selected.filter(item => item.group === group.id).map(directoryCard).join('') + '</div></section>').join('') : '<div class="j6-u-no-results">' + icon('search', 26) + '<strong>还没有匹配到这个功能</strong><p>换一个词，或者查看当前身份能使用的全部入口。</p><button data-j6-act="clear">查看全部功能</button></div>') + '</div>' +
      '<footer class="j6-u-directory-foot">' + icon('info', 14) + '<span>这里只改变进入方式。每个入口仍打开原来的完整功能。</span></footer></section>';
  }

  function summaryItem(key, rank, title, detail, action, id, options = {}) {
    return {key, rank, title, detail, action, id: id || '', tone: options.tone || 'calm', icon: options.icon || 'arrow', category: options.category || key, scope: options.scope || 'manage', time: options.time || ''};
  }
  function getSummaryItems() {
    const state = currentState(), v = state.v5 || {}, candidates = [];
    if (isPublic()) return [
      summaryItem('identify', 100, '先选择自己的档案', '确认后，管家才会使用你的记忆、学习和私人记录。', 'v5-vm-identity', '', {scope: 'public', icon: 'family'}),
      summaryItem('public-chat', 90, '先轻松聊几句', '可以聊公共知识、生活话题，或体验一段语音交流。', 'nav', 'chat', {scope: 'public', icon: 'chat'}),
      summaryItem('public-screen', 80, '看看家庭公共屏幕', '查看共同安排和公开内容，不打开私人或管理资料。', 'nav', 'screen', {scope: 'public', icon: 'screen'})
    ];
    if (isManager()) {
      const ops = v.ops || {};
      (ops.deployments || []).filter(d => d.status === 'failed').forEach(d => {
        const service = (ops.services || []).find(s => s.id === d.service);
        candidates.push(summaryItem('deploy-' + d.id, 150, (service?.name || '应用部署') + '需要验证恢复', '这次部署验证失败。先查看对应版本、检查结果与恢复点。', 'v5-op-deployment', d.id, {tone: 'urgent', icon: 'cloud', category: 'runtime', time: d.time}));
      });
      (ops.services || []).forEach(service => {
        const host = (state.machines || []).find(m => m.id === service.host);
        const health = host && host.status !== 'online' ? 'offline' : service.health;
        if (!['down', 'offline', 'degraded'].includes(health)) return;
        candidates.push(summaryItem('service-' + service.id, service.environment === 'production' ? 135 : 68,
          service.name + (health === 'offline' ? '的节点未在线' : '需要关注'),
          health === 'offline' ? '显示的是最近上报。查看节点、关联任务和服务检查，再决定处理。' : '查看健康、日志与依赖；研究和研发进度与线上状态分别管理。',
          'v5-op-service', service.id, {tone: service.environment === 'production' ? 'urgent' : 'attention', icon: 'cloud', category: 'runtime', time: service.last}));
      });
      (state.approvals || []).filter(a => a.status === 'pending').forEach(a => {
        candidates.push(summaryItem('approval-' + a.id, a.level === 'L3' ? 125 : 94, a.title, a.level === 'L3' ? '需要二次确认。先核对对象、影响范围与恢复限制。' : '动作尚未执行。查看具体范围、备份与验证，再批准或拒绝。', 'approval', a.id, {tone: 'attention', icon: 'shield', category: 'decision', time: a.time}));
      });
      const waitingTask = {blocked: [116, '需要你补充信息', '阻塞原因和已尝试的方法已保留。'], failed: [113, '本轮执行失败', '先检查证据与可恢复条件，再决定下一步。'], waitingUser: [112, '等待你的输入', '补齐需要的信息后再继续依赖它的工作。'], waitingQuota: [104, '到了费用或额度边界', '明确调整边界后手动恢复；不会自动切换付费方式。'], waitingResource: [77, '正在等待执行节点', '节点就绪后才能继续，本机与后台任务分别显示。']};
      (state.tasks || []).forEach(task => {
        const rule = waitingTask[task.status]; if (!rule || task.mode === 'observe') return;
        candidates.push(summaryItem('task-' + task.id, rule[0], task.title, task.blockReason || rule[2], 'task', task.id, {tone: task.status === 'failed' ? 'urgent' : 'attention', icon: 'tasks', category: 'work', time: task.updated}));
      });
      (v.research?.items || []).filter(item => (item.scope !== 'private' || item.owner === state.profile) && ['review', 'blocked', 'waitingQuota', 'waitingResource'].includes(item.status)).forEach(item => {
        candidates.push(summaryItem('research-' + item.id, item.status === 'blocked' ? 88 : item.status === 'review' ? 83 : 76, item.title,
          item.status === 'review' ? '支持、反证和方案已整理。选择采纳、暂存或否决。' : item.blockReason || '保留了当前阶段，等待你明确处理研究边界。', 'v5-rd-detail', item.id, {tone: 'attention', icon: 'bolt', category: 'research', time: item.updated}));
      });
      (v.knowledgeCenter?.books || []).forEach(book => {
        const doubts = (book.doubts || []).filter(d => d.critical && d.status !== 'resolved');
        if (doubts.length) candidates.push(summaryItem('book-' + book.id, 82, book.title + '还有 ' + doubts.length + ' 个关键疑点', '对照原页处理后，再发布正式原文和相关故事。', 'nav', 'collation', {tone: 'attention', icon: 'book', category: 'knowledge', time: book.created}));
      });
    } else {
      const mine = profileId();
      (v.vm?.memories?.[mine] || []).filter(m => m.status === 'candidate').forEach(memory => {
        candidates.push(summaryItem('memory-' + memory.id, 86, '确认一件希望管家记住的事', String(memory.text || '').slice(0, 88) + ' · 还未作为记忆使用。', 'v5-vm-memory-detail', memory.id, {tone: 'attention', icon: 'heart', scope: 'personal', category: 'memory', time: memory.created}));
      });
      (v.research?.inbox || []).filter(item => item.owner === mine && ['pending', 'waitingTarget', 'duplicate'].includes(item.status)).forEach(item => {
        candidates.push(summaryItem('capture-' + item.id, 80, item.title || '整理刚刚的记录', item.status === 'duplicate' ? '发现相同原文，先确认是否合并。' : '原话和来源已经保留，可以继续整理或送到合适的位置。', 'v5-rd-inbox-detail', item.id, {icon: 'file', scope: 'personal', category: 'capture', time: item.created}));
      });
      const todo = (state.familyTodos || []).find(item => !item.done);
      if (todo) candidates.push(summaryItem('family-' + todo.id, 72, todo.text, '家庭共同事项，大家可以一起安排。', 'nav', 'family', {icon: 'family', scope: 'shared', category: 'family'}));
      const progress = v.knowledgeCenter?.progress?.[mine] || {};
      const course = (v.knowledgeCenter?.courses?.[mine] || []).find(item => Array.isArray(item.stories) && item.stories.some(sid => !progress[sid]?.complete));
      if (course) candidates.push(summaryItem('course-' + course.id, 68, course.title || '继续自己的故事课程', '个人安排与学习结果分别保存，可以追问、练习和复习。', 'v5-k-temple-tab', 'courses', {icon: 'book', scope: 'personal', category: 'learning'}));
    }
    // Prefer distinct needs, so three pending approvals do not hide a blocked task.
    const sorted = candidates.sort((a, b) => b.rank - a.rank);
    const selected = [], categories = new Set();
    for (const item of sorted) {
      if (categories.has(item.category) && item.rank < 130) continue;
      selected.push(item); categories.add(item.category); if (selected.length === 3) break;
    }
    const fallback = isManager() ? [
      summaryItem('continue-work', 20, '看看正在推进的工作', '当前没有更高优先级的阻塞。查看阶段结果和验收证据。', 'nav', 'tasks', {icon: 'tasks', category: 'work'}),
      summaryItem('runtime-status', 15, '检查服务与备份', '查看最近状态与恢复记录，按需要处理。', 'nav', 'operations', {icon: 'shield', category: 'runtime'}),
      summaryItem('keep-ideas', 10, '整理下一步想做的事', '把一个想法记下来，先明确目标再开始研究。', 'nav', 'research', {icon: 'bolt', category: 'research'})
    ] : [
      summaryItem('small-learning', 20, '来一段轻松的学习', '练几句语言，听一个故事，或复习昨天学过的内容。', 'nav', 'learning', {icon: 'language', scope: 'personal', category: 'learning'}),
      summaryItem('daily-chat', 15, '和管家聊聊今天', '从一句话开始，也可以问天气、食材或感兴趣的话题。', 'nav', 'chat', {icon: 'chat', scope: 'personal', category: 'chat'}),
      summaryItem('family-plan', 10, '一起安排家庭小事', '看看共同事项，或添加今天希望一起完成的事。', 'nav', 'family', {icon: 'family', scope: 'shared', category: 'family'})
    ];
    for (const item of fallback) { if (!categories.has(item.category)) { selected.push(item); categories.add(item.category); } if (selected.length === 3) break; }
    return selected.slice(0, 3);
  }
  function renderSummary(options = {}) {
    context();
    const items = getSummaryItems();
    const heading = options.heading || (isPublic() ? '从这三件小事开始' : isManager() ? '今天，先看这三件事' : '今天，属于你的小安排');
    return '<section class="j6-u-summary" id="' + esc(options.id || 'j6-summary') + '" data-j6-summary><header><div><span class="j6-u-eyebrow">' + (isManager() ? '需要你关注' : '从这里开始') + '</span><h2>' + esc(heading) + '</h2></div><span class="j6-u-summary-note">' + (isPublic() ? '公共内容' : isManager() ? '按当前模拟状态排序' : '本人 / 家庭共享') + '</span></header><div class="j6-u-summary-grid">' + items.map((item, index) =>
      '<button class="j6-u-priority j6-u-' + item.tone + '" data-act="' + esc(item.action) + '" data-id="' + esc(item.id) + '"><div class="j6-u-priority-top"><span class="j6-u-priority-icon">' + icon(item.icon, 20) + '</span><span class="j6-u-priority-index">0' + (index + 1) + '</span></div><strong>' + esc(item.title) + '</strong><p>' + esc(item.detail) + '</p><div class="j6-u-priority-bottom"><span>' + esc(item.time || (item.scope === 'shared' ? '家庭共同事项' : '当前可用')) + '</span><span>去看看 ' + icon('arrow', 15) + '</span></div></button>'
    ).join('') + '</div></section>';
  }
  function refreshDirectory(options = {}) {
    if (typeof document === 'undefined') return;
    const active = document.activeElement, hadSearchFocus = active?.matches?.('[data-j6-search]');
    const caret = hadSearchFocus ? active.selectionStart : null;
    document.querySelectorAll('[data-j6-directory]').forEach(node => { node.outerHTML = renderDirectory({id: node.id || 'j6-directory'}); });
    if (hadSearchFocus && options.focus !== false) { const input = document.querySelector('[data-j6-search]'); input?.focus(); try { input?.setSelectionRange(caret ?? input.value.length, caret ?? input.value.length); } catch (_) {} }
  }
  function refreshSummary() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-j6-summary]').forEach(node => { node.outerHTML = renderSummary({id: node.id || 'j6-summary'}); });
  }
  function go(route) {
    if (!canNavigate(route)) {
      if (isPublic()) { global.J6?.closeLayer?.(); runtime()?.open?.('vm-identity'); }
      else if (typeof toast === 'function') toast('这个入口不在当前身份的可用范围内。', true);
      return false;
    }
    global.J6?.closeLayer?.(); runtime().navigate(route); return true;
  }
  const api = {
    renderDirectory, renderSummary, getSummaryItems, canNavigate, listCapabilities,
    getCatalog: () => catalog.map(item => ({...item})), getCategories: () => groups.map(group => ({...group})),
    refreshDirectory, refreshSummary, refresh() { refreshDirectory(); refreshSummary(); },
    navigate: go,
    setFilter(category) { context(); category = normalizeCategory(category); ui.category = category === 'all' || groups.some(group => group.id === category) ? category : 'all'; refreshDirectory(); },
    setQuery(query) { context(); ui.query = String(query || '').slice(0, 120); refreshDirectory(); },
    clear() { context(); ui.query = ''; ui.category = 'all'; refreshDirectory(); }
  };
  global.J6Usability = api;
  if (typeof document !== 'undefined' && !global.__j6UsabilityListeners) {
    global.__j6UsabilityListeners = true;
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-j6-act]');
      if (button) {
        const action = button.dataset.j6Act;
        if (!['navigate', 'category', 'clear', 'identify'].includes(action)) return;
        event.preventDefault(); event.stopPropagation();
        if (action === 'navigate') return global.J6Usability.navigate(button.dataset.j6Route);
        if (action === 'category') return global.J6Usability.setFilter(button.dataset.j6Category);
        if (action === 'clear') return global.J6Usability.clear();
        if (action === 'identify') { global.J6?.closeLayer?.(); return runtime()?.open?.('vm-identity'); }
      }
      if (ui.context && ui.context !== profileId() + ':' + isPublic() + ':' + isManager()) {
        context(); global.J6?.closeLayer?.(); refreshSummary();
      }
    });
    document.addEventListener('input', event => { if (event.target.matches?.('[data-j6-search]')) global.J6Usability.setQuery(event.target.value); });
  }
})(globalThis);
