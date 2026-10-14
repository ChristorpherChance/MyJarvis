/** Pure, repeatable merge. The combined contract is written by the root updater. */
module.exports = function applyUsageLedgerContract(document) {
  document.components ??= {};
  const schemas = document.components.schemas ??= {};
  document.paths ??= {};
  const ref = name => ({ $ref: '#/components/schemas/' + name });
  const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
  const label = { type: 'string', minLength: 1, maxLength: 300 };
  const count = { type: 'integer', minimum: 0, maximum: 1e12 };
  const positive = (maximum, defaultValue) => ({ type: 'integer', minimum: 1, maximum, ...(defaultValue === undefined ? {} : { default: defaultValue }) });
  const number = { type: 'number', minimum: 0 };
  const time = { type: 'string', format: 'date-time' };
  const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
  const array = (items, maxItems) => ({ type: 'array', items, ...(maxItems === undefined ? {} : { maxItems }) });
  const billing = { const: 'reported-tokens-and-estimates' };
  const metadata = { timezone: label, currency: { const: 'USD' }, billing };

  schemas.UsageLedgerQuery = object({
    from: { ...time, description: '包含此时刻；必须早于until。省略表示不限起点。' },
    until: { ...time, description: '不包含此时刻。省略表示不限终点。' },
    ...Object.fromEntries(['provider', 'model', 'origin', 'scenario', 'projectId', 'machineId', 'source', 'actorId'].map(name => [name, label])),
    page: positive(1000000, 1), limit: positive(500, 50),
  }, []);
  schemas.UsageLedgerTotals = object({
    records: count, reportedCalls: count, unknownCalls: count, localCalls: count,
    inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number,
    totalTokens: { ...number, description: '供应商已报告的总Token；缓存是明细，不可再次加到总量。' },
    estimatedUSD: { ...number, description: '供应商上报金额与目录估算的已知小计，不是账单。' },
    unpricedCalls: count, seconds: number, calls: count, unreportedRuns: count,
  });
  schemas.UsageLedgerTotals.description = 'records包括reported、unknown、local；calls是reportedCalls的兼容别名，unreportedRuns是unknownCalls的兼容别名。未知Token不估算，本地语音记时长且Token为0。统计完整筛选结果，不受分页影响。';
  schemas.UsageLedgerOptions = object(Object.fromEntries(['providers', 'models', 'origins', 'scenarios', 'projects', 'machines', 'sources', 'actors'].map(name => [name, array(label)])));
  schemas.UsageLedgerOptions.description = '整个账本的合法distinct筛选值，不随当前筛选或分页减少；项目、设备和成员均为ID。不含对话正文。';
  schemas.UsageLedgerGroup = object({ key: label, ...schemas.UsageLedgerTotals.properties });
  schemas.UsageLedgerDaily = object({ key: label, day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, ...schemas.UsageLedgerTotals.properties });
  const tokenFields = ['input_tokens', 'output_tokens', 'cache_read', 'cache_write', 'total_tokens'];
  schemas.UsageLedgerRecord = object({
    id: label, run_id: label, actor_id: label, provider: label, model: label, origin: label,
    day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    ...Object.fromEntries(tokenFields.map(name => [name, nullable(count)])),
    cost_usd: { ...nullable(number), description:'已知费用小计；cost_complete=0时为已知部分，剩余待补。' },cost_complete:{type:'integer',enum:[0,1]}, cost_kind: { type: 'string', enum: ['provider-reported', 'catalog-estimate', 'unavailable', 'local'] },
    measured_at: time, scenario: nullable(label), source: label, source_record_id: nullable(label),
    usage_kind: label, report_kind: label, measurement_status: { type: 'string', enum: ['reported', 'unknown', 'local'] },
    project_id: nullable(label), task_id: nullable(label), machine_id: nullable(label), executor_id: nullable(label),
    seconds: nullable(number), fingerprint: nullable({ type: 'string', pattern: '^[a-f0-9]{64}$' }),
  });
  schemas.UsageLedgerRecord.allOf = [{
    if: { properties: { measurement_status: { const: 'unknown' } }, required: ['measurement_status'] },
    then: { properties: Object.fromEntries(tokenFields.map(name => [name, { type: 'null' }])) },
    else: { properties: Object.fromEntries(tokenFields.map(name => [name, count])) },
  }];
  schemas.UsageLedgerRecord.description = '一条调用或计量证据；unknown的Token明细全部为null，不等同0。measured_at保留原始发生时间，day按平台时区计算。report_kind是usage_kind兼容别名，可包括context-compaction/cache-warm/waiting-transition/asr/tts/development。source_record_id为跨来源全局去重键。';
  schemas.UsageLedgerSummary = object({
    totals: ref('UsageLedgerTotals'), today: ref('UsageLedgerTotals'), month: ref('UsageLedgerTotals'), lifetime: ref('UsageLedgerTotals'),
    ...Object.fromEntries(['byProvider', 'byModel', 'byScenario', 'byProject', 'byMachine'].map(name => [name, array(ref('UsageLedgerGroup'))])),
    daily: array(ref('UsageLedgerDaily')), options: ref('UsageLedgerOptions'),
    period: object({ from: nullable(time), until: nullable(time) }), ...metadata,
  });
  schemas.UsageLedgerSummary.description = 'totals及所有by*/daily遵循全部筛选条件；today/month/lifetime忽略所选from/until但遵循其余筛选。daily按平台日期升序。空分组标为unassigned。';
  schemas.UsageLedgerPage = object({
    items: array(ref('UsageLedgerRecord'), 500), total: count, totalCount: count,
    page: positive(1000000), pageSize: positive(500), totalPages: count,
    summary: ref('UsageLedgerTotals'), allTime: ref('UsageLedgerTotals'), filters: ref('UsageLedgerOptions'),
    unreported: array(ref('UsageLedgerRecord'), 200), ...metadata, invoicesConnected: { const: false },
  });
  schemas.UsageLedgerPage.description = 'items按measured_at倒序分页；summary为完整筛选总计，allTime为去掉时间条件后的总计；total为totalCount的兼容别名。unreported为筛选内最新至多200条未知计量。';
  schemas.ExternalUsageInput = object({
    source: { type: 'string', enum: ['external-cli', 'factory-api'] }, sourceRecordId: label,
    actorId: { ...label, default: 'server-admin' }, provider: label, model: label, measuredAt: time,
    projectId: label, taskId: label, machineId: label, executorId: label, scenario: label,
    usageKind: { ...label, default: 'external-model' }, inputTokens: count, outputTokens: count,
    cacheReadTokens: { ...count, default: 0 }, cacheWriteTokens: { ...count, default: 0 }, totalTokens: count,
    costUSD: { ...nullable({ ...number, maximum: 1e9 }), default: null },
    costKind: { type: 'string', enum: ['provider-reported', 'catalog-estimate', 'unavailable'], default: 'unavailable' },
    measurementStatus: { type: 'string', enum: ['reported', 'unknown'], default: 'reported' },
    controlledRunId: { ...label, description: '管理端导入的受控执行归因；签名节点的此值不可信，会被中央根据项目、真实session与时间窗口重算。' },
    sessionId: label,
  }, ['source', 'sourceRecordId', 'provider', 'model', 'measuredAt']);
  schemas.ExternalUsageInput.anyOf = [
    { properties: { measurementStatus: { const: 'unknown' } }, required: ['measurementStatus'] },
    { required: ['inputTokens', 'outputTokens'] },
  ];
  schemas.ExternalUsageInput.description = '仅导入逐调用原始证据，禁止把已有日/月汇总再次入账。sourceRecordId稳定且全局唯一，例如cli:claude:<sessionId>:<messageId>；相同记录重试返回duplicate，同键数字或归因变化返回409。reported必须有真实输入、输出数，缓存不再次叠加totalTokens。缺少usage用unknown，历史时间不得写成当前时间。';
  schemas.UsageImportResult = object({ recorded: { type: 'boolean' }, id: label, duplicate: { type: 'boolean' }, controlled: { type: 'boolean' } }, ['recorded', 'duplicate']);
  schemas.UsageImportResult.description = 'controlled=true表示该调用已由真实受控回执覆盖，跳过重复导入；不会仅因存在预算预留而忽略实际用量。';
  schemas.SignedAgentUsageItem = { allOf: [ref('ExternalUsageInput'), { properties: { source: { const: 'external-cli' } }, required: ['projectId'] }] };
  schemas.SignedAgentUsageInput = object({ items: { ...array(ref('SignedAgentUsageItem'), 100), minItems: 1 } });
  schemas.SignedAgentUsageResult = object({
    requestId: { type: 'string', format: 'uuid' }, version: { const: 1 },
    data: object({ accepted: count, items: array(ref('UsageImportResult'), 100) }), events: { type: 'array', maxItems: 0, items: {} },
  });
  schemas.SignedAgentUsageInput.description = '开发节点Ed25519签名批次；需要本机已配置Codex/Claude执行能力，项目必须有本机非生产开发副本。中央绑定actor/machine/task/executor，阻止跨机上报及遥测节点冒充开发计量。';

  // The execution contract may be applied before this helper; preserve its other fields.
  for (const name of ['ExecutionActualUsage', 'ExecutionReportedUsage']) {
    schemas[name] ??= object({ inputTokens: { type: 'integer', minimum: 0 }, outputTokens: { type: 'integer', minimum: 0 } }, ['inputTokens', 'outputTokens']);
    Object.assign(schemas[name].properties, { cacheReadTokens: count, cacheWriteTokens: count, totalTokens: count, provider: label, model: label, usageComplete: { type: 'boolean', description: 'true表示每轮均有原生最终用量回执，false为取消/失败等部分已观察用量；旧节点省略时保持历史兼容，不声称已恢复缺失数据。' } });
    schemas[name].description = '所有已发生轮次累计的真实用量，失败或取消时保留已报告部分；缓存为明细，totalTokens优先，不再叠加缓存。没有供应商usage不伪造0。partial回执与后续稳定message证据以非负余量调和，原始签名回执保留在执行记录。';
  }

  const errors = { 400: { description: '字段或时间范围无效' }, 401: { description: '尚未登录' }, 403: { description: '需要当前管理员或有效开发节点签名与本机项目授权' }, 409: { description: '同一来源记录的数字或归因发生变化' }, 503: { description: '用量账本或执行器尚未配置' } };
  function add(method, path, name, result, body, signed = false, query = false) {
    const operation = {
      operationId: name, summary: name === 'listUsageLedger' ? '分页用量明细及全量筛选总计' : name === 'summarizeUsageLedger' ? '全量、今日、本月及分组统计' : signed ? '开发节点签名上报逐调用Token用量' : '导入稳定去重的逐调用用量证据',
      tags: ['Usage Ledger'], 'x-implementation-status': 'implemented',
      security: signed ? [{ AgentEd25519: [] }] : [{ SessionCookie: [] }],
      responses: { 200: { description: '已记录的真实计量；已知费用为USD估算或供应商回执，不代替账单', content: { 'application/json': { schema: ref(result) } } }, ...errors },
    };
    if (body) operation.requestBody = { required: true, content: { 'application/json': { schema: ref(body) } } };
    if (query) operation.parameters = Object.entries(schemas.UsageLedgerQuery.properties).map(([name, schema]) => ({ name, in: 'query', required: false, schema }));
    if (signed) operation.parameters = [
      { name: 'agentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ...['X-Jarvis-Timestamp', 'X-Jarvis-Nonce'].map(name => ({ name, in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 200 } })),
    ];
    document.paths[path] ??= {};
    document.paths[path][method] = operation;
  }
  document.components.securitySchemes ??= {};
  document.components.securitySchemes.AgentEd25519 ??= { type: 'apiKey', in: 'header', name: 'X-Jarvis-Signature', description: 'Ed25519(method,path,timestamp,nonce,SHA256(canonical JSON))；另需timestamp与nonce，30秒时钟窗口及防重放。' };
  add('get', '/api/runtime/governance/usage', 'listUsageLedger', 'UsageLedgerPage', null, false, true);
  add('get', '/api/runtime/governance/usage/summary', 'summarizeUsageLedger', 'UsageLedgerSummary', null, false, true);
  add('post', '/api/runtime/governance/usage/import', 'importUsageLedger', 'UsageImportResult', 'ExternalUsageInput');
  add('post', '/api/v1/agents/{agentId}/usage', 'reportSignedAgentUsage', 'SignedAgentUsageResult', 'SignedAgentUsageInput', true);
  return document;
};
