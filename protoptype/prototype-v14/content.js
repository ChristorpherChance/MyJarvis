/* V14: concise page purpose and labels, preserving business nodes and data. */
(function (global) {
  'use strict';
  const pages = {
    chat: ['语音对话', '直接说话，也可输入文字。'],
    inbox: ['统一收件', '汇总记录，分类归档并保留原话。'],
    research: ['灵感研究', '记录想法，核对证据后决定是否立项。'],
    projects: ['项目管理', '管理项目目标、工作副本和交付结果。'],
    tasks: ['开发监督', '查看执行进度，处理阻塞与验收。'],
    knowledge: ['经验技能', '记录经验，验证后发布可复用技能。'],
    sources: ['知识接入', '接入知识来源，管理授权与同步。'],
    temple: ['知识神殿', '按故事、主题与课程学习，随时查看出处。'],
    collation: ['原文校对', '处理识别疑点，逐页复核后发布原文。'],
    learning: ['学习计划', '查看我的学习记录与练习计划。'],
    family: ['家庭安排', '安排共同事项，继续学习与生活交流。'],
    memory: ['记忆神殿', '我的私人记忆，可随时修改或遗忘。'],
    personas: ['专属管家', '设置我的声音、唤醒词和交流习惯。'],
    machines: ['设备管理', '查看设备状态、用途和项目副本。'],
    services: ['运行服务', '查看服务健康，管理版本与部署。'],
    operations: ['运维费用', '查看运行健康、预算、备份与用量。'],
    approvals: ['待办审批', '核对变更、备份和恢复方案，再决定。'],
    settings: ['系统设置', '调整外观、语音、隐私和运行策略。']
  };
  const labels = new Map(Object.entries({
    '登记知识源': '接入来源', '知识源登记': '来源列表', '同步与健康': '同步状态',
    '有效授权源': '有效来源', '已登记来源': '全部来源', '授权知识联合检索': '联合检索',
    '开始模拟检索': '开始检索', '连接器与同步策略': '同步策略', '可动态扩展连接器': '按需接入',
    '来源权限先于检索': '授权范围', '失败与部分结果可见': '异常处理', '容量与并发有界': '并发限制',
    '上传扫描样本': '上传扫描', '上传扫描件': '上传扫描', '我的学习路线': '我的课程',
    '待决策缺口': '待定建议', '可学习故事': '可听故事', '书目与三层资产': '书目原文',
    '书目与版本': '书目版本', '原文与修订': '原文修订', '进入校对台': '开始校对',
    '规划个人课程': '规划课程', '只看收藏': '我的收藏', '查看待发布故事': '查看草稿',
    '更新派生内容': '更新内容', '有关联，也各自独立': '知识脉络',
    '原件与书目': '原件书目', '原文版本与勘误传播': '版本修订', '识别、裁决与发布证据': '校对日志',
    '确认本页精校': '确认本页', '模拟完成全卷精校': '模拟整卷复核', '推进模拟解析': '模拟解析',
    '逐页人工精校': '逐页复核', '修订与派生': '版本修订', '证据日志': '校对日志',
    '新增个人记忆': '新增记忆', '保存与遗忘策略': '保存策略', '导出我的记忆': '导出记忆',
    '你的记忆，由你掌握': '只记住你确认的事', '等待你确认': '待确认', '遗忘与拒绝': '历史记录',
    '来源与记录': '来源记录', '确认我的档案': '确认身份', '选择我的档案': '选择身份',
    '回到语音': '语音对话', '希望怎么称呼你': '我的称呼', '喜欢的声音': '声音偏好',
    '每日语音预算 · 分钟示例': '每日语音 · 分钟', '试听当前声线': '试听声音', '保存我的设置': '保存设置',
    '记录新灵感': '新建灵感', '语音记灵感': '语音记录', '统一收件箱': '统一收件',
    '记录与研究': '进行中', '决策归档': '已归档', '继续查看': '查看详情',
    '全部可见': '全部记录', '重复候选': '重复记录', '选定采集范围': '采集范围',
    '语音记一下': '语音记录', '生成一条事件样例': '模拟事件',
    '登记已有应用': '登记服务', '已登记应用': '全部服务', '运行应用': '运行服务',
    '可用交付包': '可用版本', '部署与恢复': '部署记录', '管理应用': '查看详情',
    '关联研发项目': '关联项目', '目标应用 / 版本': '服务 / 版本', '查看过程': '查看详情',
    '每个人都有自己的空间': '家庭成员', '今天想做什么？': '生活帮助',
    '用家里的食材做道菜': '做菜指导', '聊聊身体的情况': '健康备忘',
    '从一个生活场景，打开今天的学习': '今天练一段口语', '开始今天的口语练习': '开始口语',
    '选择一个主题': '选择主题', '旅行与购物口语': '旅行口语', '历史：走近唐朝': '唐朝历史',
    '科学：太阳和能量': '太阳与能量', '一步一步做菜': '做菜指导',
    '今日模型调用': '今日调用费用', '最近恢复演练': '最近演练', '24 小时开发监督': '开发自动监督',
    '立即模拟备份': '模拟备份', '查看备份版本': '备份版本', '导出数据': '导出快照',
    '外观与对话体验': '外观体验', '通用与模型': '外观模型', '监督与预算': '监督预算',
    '身份与隐私': '身份隐私', '通知与语音': '通知语音', '外观与体验': '外观体验',
    '持续监督托管任务': '自动监督', '语言与练习偏好': '学习偏好',
    '登记已经运行的应用': '登记服务', '修改应用登记': '编辑服务', '保存登记': '保存服务',
    '查找一个想法': '查找灵感', '标题、原话或研究问题': '关键词',
    '保留一段原话': '快速记录', '保留的原始内容': '原话内容', '保存到收件箱': '保存记录',
    '语音记一下 · 可编辑模拟转写': '语音记录 · 模拟转写', '把想法变成可研究的问题': '完善问题',
    '有限深研：目标、资源和停止边界': '研究计划', '记录一项支持、反证或未知': '补充证据',
    '增加可比较的方案': '添加方案', '由你决定下一步': '研究决策',
    '把采纳的研究转为一个项目': '转为项目', '整理记录，保留最初原话': '编辑记录',
    '被动记录只在你选定的范围': '采集范围', '新增一条个人记忆': '新增记忆',
    '想让贾维斯记住什么': '记忆内容', '记忆的来源与时效': '记忆详情',
    '修正这条记忆': '编辑记忆', '我的保存与遗忘策略': '保存策略'
  }));
  const copy = new Map(Object.entries({
    '先找到证据，再决定值得做什么。': '研究待决事项',
    '研究保存支持、反证与未知。没有采纳的灵感也有去处；被采纳的目标进入项目，而不是停留在一段聊天。': '核对证据与备选方案，再决定是否转为项目。',
    '先留原话，再整理归属': '记录待整理',
    '灵感进入研究，经验进入版本化经验库，资料进入导入候选，私人偏好进入记忆候选。重复记录先合并，不重复创建任务。': '分类归档；重复记录先合并，私人偏好由本人确认。',
    '确认后的偏好才会影响交流。项目进度、部署和任务由各自平台记录，不混入个人习惯。': '已确认的记忆用于交流；任务与项目记录独立管理。',
    '声音可以不同，归属始终清楚': '本人的声音与交流偏好',
    '普通家聊无需每次拿手机确认。私人资料、执行权限或身份不确定时才会补充确认。': '日常聊天直接说话；私人资料或执行操作需要确认身份。',
    '系统声音由浏览器和设备提供。这里的声线用于演示偏好；实际可选声音与语言质量需要试用确认。': '使用设备提供的声音。请试听后选择，语言效果因设备而异。',
    '关键词 + 语义示例结果；停用、撤权、未发布原文不会召回': '只检索有效授权来源与已发布原文。',
    '可以先查询“人物”，再停用本地基库并重新检索，观察授权与发布状态的影响。': '输入关键词，查看当前身份可用的来源。',
    '检索结果将在这里显示。结果与实时网络无关。': '暂无结果。输入关键词开始模拟检索。',
    '新增知识源立即登记；索引、实时、混合三模式可独立切换。': '可选择本地、实时或混合检索。',
    '家庭身份只能召回共享且有效授权的正式内容。': '家庭成员只检索共享、有效授权的内容。',
    '停用来源保留登记；撤权后不进入检索和教学。': '停用保留登记，撤权后停止检索和教学。',
    '连接器数量可扩展；示例并发 3 路，超时来源不伪装成完整搜索。': '示例并发 3 路；超时来源单独标明。',
    '图谱组织阅读路径，原文提供证据。点击任一节点查看出处。': '点击节点，查看故事关系与出处。',
    '经典样卷采用逐页精校。疑点审核与整页复核分别记录。': '逐页对照原图，确认本页后继续。',
    '多模型一致不代表零错误。关键疑点未解决，精校版不能发布。': '关键疑点未解决，不可发布。多模型一致仍须人工核对。',
    '原图、忠实转录与现代释义分别保存。示例批量完成按钮只模拟人工流程，不代表 AI 可替代真实逐页审核。': '原图、原文与释义分开保存。整卷按钮仅模拟人工复核。',
    '支持进程、服务与容器': '服务、进程与容器', '按本次模拟检查': '本次检查 · 模拟',
    '每个版本有独立过程': '按版本跟进', '阶段验收与项目交付分别记录': '验收与交付分别记录',
    '不用急着说得完美。先试着表达，再一起把它说得更自然。': '先表达，再纠错，最后做一次复习。',
    '每次模拟练习计入当前身份': '仅记录本人的练习', '保持轻松的日常练习': '个人连续记录',
    '告诉管家食材或兴趣，开始一段轻松的交流。': '告诉管家食材，或记录身体情况。',
    '从一句生活表达开始，得到纠错与复习。': '练表达，做纠错与复习。',
    '用讲解、互动问题和小测学习新知识。': '听讲解，回答问题，再做小测。',
    '选择菜谱，按步骤操作，使用烹饪计时。': '选菜谱，分步做菜，可设提醒。',
    '每次练习和测验单独保存': '练习与测验分别记录',
    '示例费用，不代表 CC / Codex 实际订阅或 API 账单。': '模拟费用，非实际订阅或 API 账单。',
    '页面开启时模拟监督；真实 24 小时服务在后续实现。': '仅页面打开时模拟监督。',
    '有需要处理的变化时提醒': '完成、失败或需处理时提醒',
    '让界面适应不同的观看环境': '随当前主题切换明暗',
    '这里已经整理好了。你也可以切换筛选查看历史记录。': '暂无待整理记录。可查看历史或快速记录。',
    '没有匹配的灵感。可以记录一个目标，或清除筛选。': '暂无匹配灵感。试试其他筛选，或新建灵感。',
    '没有匹配的设备。': '暂无匹配设备。调整筛选或登记设备。',
    '没有匹配的项目。': '暂无匹配项目。调整筛选或新建项目。',
    '没有匹配的任务。': '暂无匹配任务。调整筛选或新建任务。',
    '这个分类还没有记录。': '暂无记录。切换分类或新增记录。',
    '当前没有待处理的审批。': '暂无待处理审批。可查看已处理记录。',
    '这里还没有可学习的故事。可以先发布完成精校的原文，或取消收藏筛选。': '暂无故事。取消收藏筛选，或发布已精校的原文。',
    '尚未规划课程。选择历史与证据路线，或从已发布故事中生成个人课程。': '暂无课程。点击“规划课程”，选择已发布故事。',
    '目前没有待确认的记忆。对话中的偏好会以候选形式送来。': '暂无记忆候选。交流中的偏好会送来待确认。',
    '这里暂无记录。': '暂无记录。可以新增一条记忆。'
  }));
  const savedOpen = new Map();
  const doNotTouch = '.vm5-message,.vm5-message-list,.vm5-caption,.j13-live-dialogue,.j12-subtitles,.j7-core-holder,.vm5-memory-card h3,.rd5-excerpt,.rd5-raw,.rd5-discussions,.rd5-evidence p,.rd5-inbox-content>p,.kv5-story p,.kv5-reading,.kv5-page-text,.kv5-quote,.code-block,textarea,input,option,.task-title-button,.rd5-title';
  function replaceText(node, dictionary) {
    if (!node || node.closest(doNotTouch)) return;
    // Static interface text only. Preserve every child element and event binding.
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode())) {
      if (text.parentElement?.closest(doNotTouch)) continue;
      const raw = text.nodeValue, key = raw.trim();
      if (dictionary.has(key)) text.nodeValue = raw.replace(key, dictionary.get(key));
    }
  }
  function help(node, label) {
    if (!node || node.closest('.j14-help') || node.querySelector('form,input,textarea,select')) return;
    const key = String(S.profile) + ':' + String(U.route) + ':' + label;
    const details = document.createElement('details');
    details.className = 'j14-help'; details.dataset.j14Help = key;
    details.open = Boolean(savedOpen.get(key));
    const summary = document.createElement('summary'); summary.textContent = label;
    node.replaceWith(details); details.append(summary, node);
    node.classList.add('j14-help-body');
  }
  function directCopy(root, selector, value) {
    const el = root.querySelector(selector); if (el && el.textContent !== value) el.textContent = value;
  }
  function decorate() {
    const root = document.getElementById('main'), route = U.route;
    if (!root) return;
    root.classList.toggle('j14-content', Boolean(pages[route]) && route !== 'chat');
    const manager = typeof admin === 'function' && admin() && !J5.isPublic();
    const fallbackTitle = ({overview: '总览中心', screen: '大屏中心'})[route] || pages[route]?.[0];
    const title = !manager && route === 'settings' ? '个人设置' : !manager && route === 'knowledge' ? '家庭资料' : global.J7Navigation?.labels?.[route] || fallbackTitle;
    const breadcrumb = document.querySelector('#app-header .breadcrumb strong');
    if (breadcrumb && title) breadcrumb.textContent = title;
    if (!pages[route]) return;
    let purpose = pages[route][1];
    if (route === 'memory') purpose = P().name + '的私人记忆，可随时修改或遗忘。';
    if (route === 'learning') purpose = P().name + '的练习计划与学习记录。';
    if (route === 'knowledge' && !manager) purpose = '查看家庭知识和本人的私人记录。';
    if (route === 'settings' && !manager) purpose = '调整我的外观、语音和隐私。';
    const head = root.querySelector('.page-head');
    if (head) { directCopy(head, 'h1', title); directCopy(head, '.subtitle', purpose); }
    if (route === 'chat') {
      // V13 split layout and all chat/art nodes remain untouched.
      directCopy(root, '.vm5-top h1', title); return;
    }
    for (const el of root.querySelectorAll('button,h2,h3,.subtitle,.notice,.help,.empty,.kv5-empty,.metric-note,.metric .label,.card-footer,.setting-row p,.kv5-source p,.kv5-source-result p,.kv5-description,.kv5-stat small,.field>label,.field>span,.rd5-metric span,.rd5-metric small,.rd5-hero p,.rd5-inbox-banner p,.feature-card p,.lesson-banner p,th')) {
      replaceText(el, labels); replaceText(el, copy);
    }
    if (route === 'sources') {
      directCopy(root, '.kv5-callout .grow', '仅检索已授权且启用的来源。外部连接为模拟。');
      help(root.querySelector('.kv5-callout'), '检索规则');
    }
    if (route === 'collation') directCopy(root, '.kv5-callout .grow', '原件保留。关键疑点与逐页复核未完成，不可发布；模拟校对不代表零错误。');
    if (route === 'research') {
      root.querySelector('.rd5-hero')?.classList.add('j14-status-band');
      directCopy(root, '.rd5-hero h2', '研究待决事项');
      directCopy(root, '.rd5-hero-side small', '项研究待决定');
      directCopy(root, '.rd5-footnote', '研究、来源与费用为模拟。');
      help(root.querySelector('.rd5-footnote'), '演示说明');
    }
    if (route === 'inbox') root.querySelector('.rd5-inbox-banner')?.classList.add('j14-status-band');
    if (route === 'memory') help(root.querySelector(':scope > .help'), '数据清理说明');
    if (route === 'personas') {
      const all = [...root.querySelectorAll('.vm5-persona-layout > .card > .help')];
      help(all.at(-1), '声线说明');
      const save = root.querySelector('.vm5-persona-footer button[type="submit"][form="form-v5-vm-persona"]');
      const actions = head?.querySelector('.head-actions');
      if (save && actions) {
        actions.querySelector('[data-act="v5-vm-chat"]')?.classList.remove('primary');
        actions.append(save);
      }
    }
    if (route === 'tasks') {
      const status = root.querySelector(':scope > .notice > div');
      if (status && !S.settings.emergency) status.textContent = S.settings.supervise ? '自动监督已开启 · 托管任务可续作，只读会话由本人控制。' : '自动监督已关闭 · 任务保持当前状态。';
    }
    if (route === 'family' && !root.querySelector('.j14-family-members')) {
      const topCards = root.querySelector(':scope > .grid3');
      const shared = root.querySelector(':scope > .dashboard-columns');
      if (topCards && shared) topCards.after(shared);
      const life = [...root.querySelectorAll(':scope > .grid3 > .card')].find(el => el.querySelector('h2')?.textContent === '生活帮助');
      if (life) directCopy(life, 'p', '告诉管家食材，或记录身体情况。');
      const todos = shared?.querySelector(':scope > .card');
      if (life && todos?.querySelector('h2')?.textContent === '家庭共同事项') {
        // Retain both original cards and their controls: mobile reads weather,
        // learning, shared tasks, then secondary conversation shortcuts.
        life.replaceWith(todos); shared.prepend(life);
      }
      const section = [...root.querySelectorAll('.section-title')].find(el => el.querySelector('h2')?.textContent === '家庭成员');
      const members = section?.nextElementSibling;
      if (section && members?.classList.contains('grid4')) {
        const details = document.createElement('details'); details.className = 'j14-family-members';
        const key = String(S.profile) + ':family:家庭成员'; details.dataset.j14Help = key; details.open = Boolean(savedOpen.get(key));
        const summary = document.createElement('summary'); summary.textContent = '家庭成员';
        section.before(details); details.append(summary, section, members);
      }
      const privacy = [...root.querySelectorAll('.dashboard-columns .card')].find(el => el.querySelector('h2')?.textContent === '记住偏好，也尊重私人空间');
      if (privacy) {
        directCopy(privacy, 'h2', '私人资料');
        directCopy(privacy, 'p', '聊天与健康备忘仅本人可见；家庭大屏只显示共同事项。');
      }
    }
  }
  function decorateOverlay() {
    const root = document.getElementById('overlay-root'); if (!root) return;
    root.classList.add('j14-form-polish');
    for (const el of root.querySelectorAll('.modal-head h2,.field>label,.field>span,button:not(.task-title-button):not(.rd5-title),th')) replaceText(el, labels);
    const dialog = root.querySelector('[role="dialog"]');
    const dialogTitle = dialog?.querySelector('.modal-head h2');
    if (dialogTitle) dialog.setAttribute('aria-label', dialogTitle.textContent);
    const capture = root.querySelector('form[data-form="v5-rd-capture"]');
    const title = capture?.querySelector('input[name="title"]');
    if (title && !title.placeholder) title.placeholder = '可选，留空按原话生成';
    const query = root.querySelector('form[data-form="v5-rd-search"] input[name="query"]');
    if (query && !query.placeholder) query.placeholder = '标题、原话或研究问题';
  }
  document.addEventListener('toggle', event => {
    if (event.target.matches?.('details[data-j14-help]')) savedOpen.set(event.target.dataset.j14Help, event.target.open);
  }, true);
  const previousRender = render;
  render = function () {
    for (const el of document.querySelectorAll('details[data-j14-help]')) savedOpen.set(el.dataset.j14Help, el.open);
    const result = previousRender.apply(this, arguments); decorate(); decorateOverlay(); return result;
  };
  const previousOverlay = renderOverlay;
  renderOverlay = function () { const result = previousOverlay.apply(this, arguments); decorateOverlay(); return result; };
  global.J14Content = {pages, refresh: decorate, refreshOverlay: decorateOverlay, reviewedRoutes: Object.keys(pages), copyEntries: copy.size, labelEntries: labels.size};
  decorate(); decorateOverlay();
})(window);
