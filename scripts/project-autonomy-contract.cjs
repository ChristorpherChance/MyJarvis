/** Pure contract merge for the concrete routes in project-autonomy-routes.ts.
 * This describes project-local orchestration, not completed factory delivery.
 */
module.exports = function applyProjectAutonomyContract(document) {
  document.components ??= {};
  const schemas = document.components.schemas ??= {};
  document.components.securitySchemes ??= {};
  document.paths ??= {};
  const ref = name => ({ $ref: '#/components/schemas/' + name });
  const object = (properties, required = Object.keys(properties), additionalProperties = false) =>
    ({ type: 'object', additionalProperties, properties, required });
  const string = (maxLength, minLength = 1) => ({ type: 'string', minLength, ...(maxLength === undefined ? {} : { maxLength }) });
  const identifier = { ...string(200), description: '服务端先trim，再检查1至200字符。' };
  const integer = { type: 'integer', minimum: 0 };
  const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
  const date = { type: 'string', format: 'date-time' };
  const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
  const array = (items, minItems, maxItems) => ({
    type: 'array', items,
    ...(minItems === undefined ? {} : { minItems }),
    ...(maxItems === undefined ? {} : { maxItems }),
  });
  const record = value => ({ type: 'object', propertyNames: identifier, additionalProperties: value });
  const positiveUSD = maximum => ({ type: 'number', exclusiveMinimum: 0, ...(maximum === undefined ? {} : { maximum }) });
  const positiveTokens = maximum => ({ type: 'integer', minimum: 1, ...(maximum === undefined ? {} : { maximum }) });

  schemas.ProjectAutonomyObjective = object({
    id: identifier, title: string(1000), acceptance: array(string(8000), 1),
    dependsOn: array(identifier), workPackage: identifier, scope: identifier,
  }, undefined, true);
  schemas.ProjectAutonomyWorkPackage = object({
    id: identifier, title: string(1000), dependsOn: array(identifier),
    budgetScope: identifier, objectiveIds: array(identifier, 1),
  }, undefined, true);
  schemas.ProjectAutonomySpec = object({
    schemaVersion: { const: 1 }, projectKey: identifier, version: identifier,
    workPackages: array(ref('ProjectAutonomyWorkPackage'), 1, 100),
    objectives: array(ref('ProjectAutonomyObjective'), 1, 1000),
  }, undefined, true);
  schemas.ProjectAutonomySpec.description =
    '目标集、工作包和目标均保留附加元数据。编号须唯一，目标与工作包依赖须存在且无环，每个目标只能归属一个工作包；包内objectiveIds必须与目标workPackage一致。配置时冻结完整输入指纹，不能用摘要或自报进度替代验收条款。';
  schemas.ProjectAutonomyExecutor = object({
    worker: identifier, reviewer: identifier, validator: identifier,
    requiredCheckIds: array(identifier, 1), budgetScope: identifier,
  }, ['worker','reviewer','requiredCheckIds','budgetScope']);
  schemas.ProjectAutonomyExecutor.description =
    '开发和评审执行器必须不同，且均绑定该机器、独立非生产工作目录、固定验证和有界监督配置；各工作包都必须有执行器及独立预算。';
  schemas.ProjectAutonomyScopeBudget = object({
    maxUSD: nullable(positiveUSD()), maxTokens: nullable(positiveTokens()),
  });
  const configProperties = {
    machineId: identifier,
    workspace: { ...string(2000), description: '必须是已登记在此机器的独立非生产工作副本绝对路径；运行时校验路径与执行器范围。' },
    costPolicy: { type: 'string', enum: ['limited','record-only'], default: 'limited' },
    maxUSD: nullable(positiveUSD(10000)), maxTokens: nullable(positiveTokens(1000000000)),
    perTaskUSD: nullable({ type: 'number', minimum: 1, maximum: 1000 }),
    maxAttempts: { type: 'integer', minimum: 1, maximum: 20 },
    maxRepeated: { type: 'integer', minimum: 2, maximum: 10, default: 3 },
    maxEvidenceAgeMs: { type: 'integer', minimum: 60000, maximum: 604800000, default: 86400000 },
    executors: record(ref('ProjectAutonomyExecutor')),
    scopeBudgets: record(ref('ProjectAutonomyScopeBudget')),
  };
  schemas.ProjectAutonomyConfigInput = object(configProperties,
    Object.keys(configProperties).filter(key => !['costPolicy','maxRepeated', 'maxEvidenceAgeMs'].includes(key)));
  schemas.ProjectAutonomyConfig = object(configProperties);
  const configDescription =
    'costPolicy=record-only时费用/Token只记录，全局/分组/单任务消费上限字段必须为null；缺失费用标为未知，不能伪造零或停止正常推进。limited模式须完整正预算。执行时限、取消、重复失败与无进展边界始终保留；阶段budgetScope用于分别归账。';
  schemas.ProjectAutonomyConfigInput.description = configDescription + '省略maxRepeated/maxEvidenceAgeMs时应用默认值；不接受其他字段。';
  schemas.ProjectAutonomyConfig.description = configDescription + '响应包含已解析的全部字段和默认值。';
  schemas.ProjectAutonomyConfigureInput = object({
    spec: ref('ProjectAutonomySpec'), config: ref('ProjectAutonomyConfigInput'),
    expectedVersion: integer, commandId: { type: 'string', format: 'uuid' },
  });
  schemas.ProjectAutonomyConfigureInput.description =
    '首次配置expectedVersion=0。相同commandId与相同完整请求返回保存的回执；同编号不同请求、版本冲突、现有冻结计划被覆盖均返回409。变更需要新版本计划，不删除执行历史。';
  schemas.ProjectAutonomyControlInput = object({
    commandId: { type: 'string', format: 'uuid' }, expectedVersion: integer,
    reason: { ...string(1000), description: '服务端trim后必须非空；记录操作原因。' },
  });
  schemas.ProjectAutonomyControlInput.description =
    'expectedVersion必须匹配监督revision；同commandId同操作同请求幂等，换操作或负载冲突。completed/cancelled计划不能再操作；恢复被停止的执行须先核对会话、费用及有界恢复计划。';

  schemas.ProjectAutonomyTestCounts = object({
    total: positiveTokens(1000000000),
    ...Object.fromEntries(['passed', 'failed', 'skipped', 'unknown'].map(name => [name, { ...integer, maximum: 1000000000 }])),
  });
  schemas.ProjectAutonomyCheck = object({
    id: identifier, command: { ...string(4000), description: '服务端trim后非空。' },
    required: { type: 'boolean' }, executed: { type: 'boolean' },
    status: { type: 'string', enum: ['pass', 'fail', 'skip', 'unknown'] },
    exitCode: nullable({ type: 'integer', minimum: -1, maximum: 255 }),
    evidenceSha256: hash, tests: ref('ProjectAutonomyTestCounts'),
  }, ['id', 'command', 'required', 'executed', 'status', 'exitCode', 'evidenceSha256']);
  schemas.ProjectAutonomyArtifact = object({
    path: {
      ...string(2000),
      pattern: '^(?![\\\\/])(?!.*[\\u0000-\\u001f\\u007f:])(?!.*(?:^|[\\\\/])(?:\\.{1,2})(?:[\\\\/]|$))(?!.*[\\\\/]{2})(?!.*[\\\\/]$).+$',
      description: '相对文件路径；无控制字符、冒号、空路径段、.或..，不能以分隔符起止。',
    },
    sha256: hash, bytes: { ...integer, maximum: 1000000000000 },
  });
  const reportCommon = {
    schemaVersion: { const: 1 }, status: { type: 'string', enum: ['pass', 'fail'] },
    simulated: { const: false }, runId: identifier,
    workspace: {
      ...string(2000),
      pattern: '^(?!.*[\\u0000-\\u001f\\u007f])(?!.*(?:^|[\\\\/])(?:\\.{1,2})(?:[\\\\/]|$))(?:/|[A-Za-z]:[\\\\/]|\\\\\\\\).*$',
      description: '无控制字符、.或..路径段的绝对Unix、Windows盘符或UNC工作目录。',
    },
    goalSpecHash: hash, workPackage: identifier, sourceFingerprint: hash,
    sourceStable: { const: true }, startedAt: date, finishedAt: date,
  };
  const prerequisiteIds=['provider','native-execution','native-recovery','ui-comparison','regression','performance-data','agent-evaluation','agent-promotion','jarvis-workflow','workflow-controls','customer-installation','e2e','long-observation','reuse-records'];
  schemas.ProjectAutonomyPendingPrerequisite = object({
    id:{type:'string',enum:prerequisiteIds},
    reasonCode:{type:'string',enum:['FIXED_SCOPE_PRODUCER_EVIDENCE_PENDING','FACTORY_INTERNAL_PROVIDER_CONTEXT_EVIDENCE_PENDING','FACTORY_NATIVE_PROCESS_CHAIN_EVIDENCE_PENDING','CUSTOMER_INSTALL_RESTORE_ROLLBACK_EVIDENCE_PENDING','LONG_OBSERVATION_IN_PROGRESS','LONG_EXCEPTION_AND_IDLE_USAGE_EVIDENCE_PENDING']},
    actualObservedSeconds:{type:'number',minimum:0,maximum:259200},requiredSeconds:{const:259200},
  },['id','reasonCode']);
  schemas.ProjectAutonomyPrerequisiteStatus=object({
    schemaVersion:{const:1},kind:{const:'project-autonomy-prerequisite-status'},simulated:{const:false},
    runId:{type:'string',pattern:'^(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$'},
    attempt:{type:'string',pattern:'^[a-f0-9]{32}$'},sourceFingerprint:hash,goalSpecHash:hash,workPackage:{type:'string',pattern:'^FA-0[1-9]$'},
    waiting:array(ref('ProjectAutonomyPendingPrerequisite'),1,14),observedAt:date,
    nextCheckSeconds:{type:'integer',minimum:60,maximum:86400},observationsAreAcceptance:{const:false},
  });
  schemas.ProjectAutonomyWaitingPrerequisite=object({
    id:{type:'string',enum:prerequisiteIds},checkId:identifier,objectiveIds:array(identifier,1,1000),errorCode:{const:'TRUSTED_PREREQUISITE_RECEIPT_MISSING'},
  });
  const validationProperties={
    ...reportCommon, kind: { const: 'project-autonomy-validation' },
    checks: array(ref('ProjectAutonomyCheck'), 1, 1000),
    artifacts: array(ref('ProjectAutonomyArtifact'), 1, 1000),
    prerequisiteWaitEligible:{const:true},prerequisiteStatusJson:string(262144),prerequisiteStatusSha256:hash,
    waitingPrerequisites:array(ref('ProjectAutonomyWaitingPrerequisite'),1,1000),
  };
  const waitingFields=['prerequisiteWaitEligible','prerequisiteStatusJson','prerequisiteStatusSha256','waitingPrerequisites'];
  schemas.ProjectAutonomyValidation = object(validationProperties,Object.keys(validationProperties).filter(k=>!waitingFields.includes(k)));
  schemas.ProjectAutonomyValidation.dependentRequired=Object.fromEntries(waitingFields.map(k=>[k,waitingFields.filter(f=>f!==k)]));
  schemas.ProjectAutonomyValidation.allOf=[{if:{required:['prerequisiteWaitEligible']},then:{properties:{status:{const:'fail'}}}}];
  schemas.ProjectAutonomyCriterion = object({
    objectiveId: identifier, outcome: { type: 'string', enum: ['pass', 'fail', 'skip', 'unknown'] },
    evidenceRefs: array({ ...string(2200), description: 'trim后非空；必须绑定固定报告的check:<id>或artifact:<path>。' }, 1, 1000),
    reason: { ...string(8000), description: 'trim后非空的独立评审依据。' },
  });
  schemas.ProjectAutonomyReview = object({
    ...reportCommon, kind: { const: 'project-autonomy-review' },
    validationRunId: identifier, validationReportSha256: hash,
    criteria: array(ref('ProjectAutonomyCriterion'), 1, 1000),
  });
  schemas.ProjectAutonomyDecision = object({
    outcome: { type: 'string', enum: ['pass', 'fail', 'unknown'] },
    reasons: array({ type: 'string' }),
    validation: ref('ProjectAutonomyValidation'), review: ref('ProjectAutonomyReview'), evidenceHash: hash,
  }, ['outcome', 'reasons']);
  schemas.ProjectAutonomyDecision.allOf = [{
    if: { properties: { outcome: { const: 'pass' } }, required: ['outcome'] },
    then: { required: ['validation', 'review', 'evidenceHash'] },
  }];
  schemas.ProjectAutonomyDecision.description =
    '结构合同不证明执行发生。pass须由可信固定验证和另一次只读独立评审得出，绑定当前源码/目标/工作包/运行/新鲜时间，全部必需检查实际通过、测试无跳过未知、全部目标逐项通过且引用真实工件。模型自报、CLI退出0、历史测试或模拟状态不计为交付通过。';
  schemas.ProjectAutonomyCheckpoint = object({
    sourceFingerprint: hash, problemFingerprint: hash,
    repeated: { type: 'integer', minimum: 1 },
  });
  const stageProperties = {
    id: identifier, status: { type: 'string', enum: ['pending', 'worker', 'reviewing', 'waiting-prerequisite', 'validating-prerequisite', 'passed'] },
    attempt: integer, taskId: identifier, reviewTaskId: identifier,
    validationTaskId: identifier, validationRunId: identifier,
    validationIntent: ref('CommandEnvelope'), validationDispatchIntent: ref('CommandEnvelope'),
    waiting: ref('ProjectAutonomyPrerequisiteStatus'), waitingSince: date, nextProbeAt: date, probeCount: integer,
    runId: identifier, reviewRunId: identifier,
    ...Object.fromEntries(['workerIntent', 'reviewIntent', 'dispatchIntent', 'reviewDispatchIntent'].map(name => [name, ref('CommandEnvelope')])),
    decision: ref('ProjectAutonomyDecision'), problem: { type: 'string' },
    checkpoint: ref('ProjectAutonomyCheckpoint'),
  };
  schemas.ProjectAutonomyStageAttempt = object(stageProperties, ['id', 'status', 'attempt']);
  schemas.ProjectAutonomyStage = object({
    ...stageProperties, history: array(ref('ProjectAutonomyStageAttempt')),
  }, ['id', 'status', 'attempt', 'history']);
  schemas.ProjectAutonomyBudget = object({
    spentUSD: { type: 'number', minimum: 0 },
    usedTokens: integer, unknownCostCount: integer, activeRuns: array(identifier),
  });
  schemas.ProjectAutonomyBudget.description =
    '监督绑定的开发与评审运行已报告费用、Token及未知计量数；排队/执行中的运行列入activeRuns。已知USD小计不等同完整账单，未知计量不填造费用或Token；只记账模式保留未知标记且继续推进；限额模式才按消费边界停止派发。';
  schemas.ProjectAutonomyEvent = object({
    seq: { type: 'integer', minimum: 1 }, at: date, kind: { type: 'string' },
    data: { type: 'object', additionalProperties: true }, previousHash: hash, hash,
  });
  schemas.ProjectAutonomyEvent.description =
    '事件按项目过滤、seq升序；seq为全局SQLite序号，可不连续。每项含前一项目事件指纹和当前指纹，首项previousHash为64个0。事件记录过程，不自动等同产品验收。';
  schemas.ProjectAutonomyProfile = object({
    projectId: { type: 'string' }, revision: integer,
    status: { type: 'string', enum: ['configured', 'running', 'paused', 'cancelled', 'blocked', 'completed'] },
    reason: nullable({ type: 'string' }), goalSpecHash: hash,
    spec: ref('ProjectAutonomySpec'), config: ref('ProjectAutonomyConfig'), binding: hash,
    templateHashes: record(hash), stages: array(ref('ProjectAutonomyStage'), 1, 100),
    createdAt: date, updatedAt: date, budget: ref('ProjectAutonomyBudget'),
    verifiedObjectiveIds: array(identifier), events: array(ref('ProjectAutonomyEvent'), undefined, 16),
  });
  schemas.ProjectAutonomyProfile.description =
    '项目级持久监督状态；revision用于并发保护。verifiedObjectiveIds仅来自passed阶段且decision.outcome=pass和有效evidenceHash的逐目标评审，可包含最终整体验证重复ID，客户端按已知目标去重。completed表示本目标集当前独立证据通过，不伪造客户签收或物理使用验收。events是最近至多16项，完整过程从事件分页接口读取。';
  schemas.ProjectAutonomyProfileResponse = object({ data: ref('ProjectAutonomyProfile') });
  schemas.ProjectAutonomyNullableProfileResponse = object({ data: nullable(ref('ProjectAutonomyProfile')) });
  schemas.ProjectAutonomyListResponse = object({ data: array(ref('ProjectAutonomyProfile')) });
  schemas.ProjectAutonomyEventsResponse = object({ data: array(ref('ProjectAutonomyEvent'), undefined, 1000) });
  schemas.ProjectAutonomyError = object({
    error: object({ code: { type: 'string' }, message: { type: 'string' } }),
  });
  document.components.securitySchemes.CookieAuth = {
    type: 'apiKey', in: 'cookie', name: 'jarvis_session',
    description: '已登录本人管理员会话。所有自治监督接口同时要求administrator=true及profileId=me；有效家庭成员会话优先，即使同浏览器有管理员Cookie仍拒绝成员访问。',
    'x-implementation-status': 'implemented',
  };

  function add(method, path, operationId, summary, response, body, query) {
    const operation = {
      operationId, summary, tags: ['Project Autonomy'],
      security: [{ CookieAuth: [] }], 'x-implementation-status': 'implemented',
      'x-runtime-source': 'apps/api/src/runtime/project-autonomy-routes.ts',
      responses: {
        200: {
          description: response === 'html' ? '管理员可阅读的同源执行总纲HTML；不表示其中目标已经实现或交付。' : '真实持久状态、幂等回执或事件；不使用模拟进度。',
          content: response === 'html' ? {
            'text/html': { schema: { type: 'string' } },
            'text/plain': { schema: { type: 'string', description: '白名单中的Markdown原文，UTF-8；不修改源文件。' } },
            'application/json': { schema: { description: '白名单中公开审计/目标文件的原始JSON；不扩展为任意工件浏览。' } },
          } :
            { 'application/json': { schema: ref(response) } },
        },
      },
    };
    for (const [code, description] of Object.entries({
      400: '参数格式无效，INVALID_INPUT；未通过配置/命令格式校验。',
      401: '缺少有效登录，LOGIN_REQUIRED。',
      403: '需要本人管理员，ADMIN_REQUIRED；家庭成员与终端身份没有此权限。',
    })) operation.responses[code] = { description, content: { 'application/json': { schema: ref('ProjectAutonomyError') } } };
    if (response === 'html') {
      operation.description = '省略reference返回总纲HTML，将其中明确引用的本地公开文档/审计链接改为此受保护路由。reference只允许由原主HTML直接href形成的有限白名单及主Markdown，不递归信任引用文档。禁止任意docs/artifacts访问、隐藏/私有路径、越界、符号链接/目录联接及硬链接；读取中改变返回409。返回文件字节，不编辑总纲或证据本体。';
      operation.parameters = [{
        name: 'reference', in: 'query', required: false,
        schema: { type: 'string', minLength: 1, maxLength: 2000 },
        description: '未编码的工作区相对文件路径，放进URL时按查询值编码，如docs/软件工厂无人值守交付总纲.md。必须与主HTML公开href白名单准确匹配；不能含反斜杠、控制字符、冒号、%、?、#、隐藏或空路径段及.或..。不接受其他查询字段。',
      }];
      operation.responses[400].description = 'INVALID_INPUT或INVALID_GUIDE_REFERENCE：查询参数、公开路径格式不正确。';
      operation.responses[403].description = 'ADMIN_REQUIRED或GUIDE_RESOURCE_FORBIDDEN：非本人管理员、未列入主总纲公开引用、路径重定向/链接或超过8MiB读取范围。';
      operation.responses[404] = {
        description: 'GUIDE_RESOURCE_NOT_FOUND：总纲或白名单引用文件尚未部署。',
        content: { 'application/json': { schema: ref('ProjectAutonomyError') } },
      };
      operation.responses[409] = {
        description: 'GUIDE_RESOURCE_CHANGED：读取期间文件身份、尺寸或修改时间发生变化。',
        content: { 'application/json': { schema: ref('ProjectAutonomyError') } },
      };
      operation.responses[200].headers = {
        'Cache-Control': { schema: { const: 'private, no-store' } },
        'X-Content-Type-Options': { schema: { const: 'nosniff' } },
      };
    }
    if (method !== 'get') {
      operation.responses[409] = {
        description: 'CONFLICT或AUTONOMY_RETRY：版本、幂等键、冻结计划、目标依赖、项目/副本/执行器、预算或恢复边界不符合要求。',
        content: { 'application/json': { schema: ref('ProjectAutonomyError') } },
      };
      operation.responses[503] = {
        description: 'RESOURCE_UNAVAILABLE或执行依赖未配置；开发/独立评审节点未就绪。',
        content: { 'application/json': { schema: ref('ProjectAutonomyError') } },
      };
    }
    if (body) operation.requestBody = { required: true, content: { 'application/json': { schema: ref(body) } } };
    if (path.endsWith('/autonomy/start')) {
      operation.responses[422] = {
        description: 'AUTONOMY_RECOVERY_REQUIRED：尝试或停滞保护已触发、执行需对账、既有任务或运行已停止；普通启动不会重置保护或复活旧执行，须先完成对应恢复处理。拒绝时保留原监督状态和历史。',
        content: { 'application/json': { schema: ref('ProjectAutonomyError') } },
      };
    }
    if (path.includes('{id}')) operation.parameters = [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 1 }, description: '贾维斯项目ID；不是软件工厂内部客户产品ID。' },
    ];
    if (query) operation.parameters.push(
      { name: 'after', in: 'query', required: false, schema: { type: 'integer', minimum: 0, default: 0 }, description: '只返回seq大于此值的项目事件；使用上一页最后seq继续。' },
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }, description: '升序返回至多limit项；无事件或无配置返回空数组。' },
    );
    document.paths[path] ??= {};
    document.paths[path][method] = operation;
  }
  add('get', '/api/v1/project-autonomy', 'listProjectAutonomy', '列出已配置的项目级自治监督', 'ProjectAutonomyListResponse');
  add('get', '/api/v1/project-autonomy/guide', 'readProjectAutonomyGuide', '阅读软件工厂无人值守交付总纲', 'html');
  add('get', '/api/v1/project-autonomy/acceptance-plan', 'readProjectAutonomyAcceptancePlan', '阅读现有成果验收与定点修复计划', 'html');
  add('get', '/api/v1/projects/{id}/autonomy', 'getProjectAutonomy', '读取项目自治监督；未配置返回data:null', 'ProjectAutonomyNullableProfileResponse');
  add('get', '/api/v1/projects/{id}/autonomy/events', 'listProjectAutonomyEvents', '按序号分页读取完整监督过程', 'ProjectAutonomyEventsResponse', null, true);
  add('put', '/api/v1/projects/{id}/autonomy', 'configureProjectAutonomy', '冻结项目目标、执行器及独立累计预算', 'ProjectAutonomyProfileResponse', 'ProjectAutonomyConfigureInput');
  for (const [action, summary] of [
    ['start', '启动或按边界恢复既有项目级监督'],
    ['pause', '暂停项目监督并持久重试停止已绑定任务'],
    ['cancel', '取消项目监督并持久重试停止已绑定任务'],
  ]) add('post', '/api/v1/projects/{id}/autonomy/' + action,
    action + 'ProjectAutonomy', summary, 'ProjectAutonomyProfileResponse', 'ProjectAutonomyControlInput');
  schemas.ProjectAutonomyRecoveryInput=object({
    commandId:{type:'string',format:'uuid'},expectedVersion:{type:'integer',minimum:1},reason:string(4000),
    workPackage:string(200),oldTaskId:string(200),oldRunId:string(200),
    goalSpecHash:{type:'string',pattern:'^[a-f0-9]{64}$'},terminalResultSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},
    reconciliationId:{type:'string',format:'uuid'},reconciliationSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},
  });
  schemas.ProjectAutonomyRecoveryInput.description='仅已签名HEARTBEAT_FAILED的当前worker，可依据root维护的固定只读对账文件创建下一有界任务；旧任务和未知费用保留，不复活原run，不代表产品验收。';
  add('post','/api/v1/projects/{id}/autonomy/recover','recoverProjectAutonomyWorker','对账技术中止并创建新的有界任务计划','ProjectAutonomyProfileResponse','ProjectAutonomyRecoveryInput');
  schemas.ProjectAutonomyBaselineInput=object({
    commandId:{type:'string',format:'uuid'},expectedVersion:{type:'integer',minimum:1},goalSpecHash:hash,
    workPackage:identifier,reason:string(1000),reconciliationId:{type:'string',format:'uuid'},reconciliationSha256:hash,
    mainBaselineTaskId:identifier,
  },['commandId','expectedVersion','goalSpecHash','workPackage','reason','reconciliationId','reconciliationSha256']);
  schemas.ProjectAutonomyBaselineInput.description='只为原冻结候选副本登记新的无模型固定核验任务；必须基于新鲜root只读队列对账，原计划blocked/paused/cancelled、目标模板未变、旧run完整签名终结且无活动/待停。不修改原revision、attempt、历史、74目标或费用政策，不派worker/reviewer。登记后从既有tasks/start启动；暂停、取消、急停及终态任务禁止再启动。mainBaselineTaskId仅关联同项目真实窄fixed主线核验，不扩大候选权限。相同commandId与完整请求幂等，旧回执保留当时快照。';
  schemas.ProjectAutonomyBaselineUsage=object({knownCostUSD:{type:'number',minimum:0},tokens:integer,unknownCostCount:integer});
  schemas.ProjectAutonomyMainBaseline=object({
    taskId:identifier,runId:identifier,taskStatus:{type:'string'},runStatus:{type:'string'},
    status:{type:'string',enum:['queued','running','observed','stopped']},sourceRole:{const:'current-main'},workspace:string(2000),
    sourceFingerprint:nullable(hash),usage:ref('ProjectAutonomyBaselineUsage'),validationExitCode:nullable({type:'integer'}),summary:{type:'string'},
  });
  schemas.ProjectAutonomyMainBaseline.description='按本项目真实task/run中的fixed /usr/bin/true及精确sudo窄验证wrapper发现主线核验。observed只表示运行结束，exitCode不是74条目标验收。未知费用保留未知，不从零模型推造零账单。';
  const baselineProperties={
    id:identifier,projectId:identifier,revision:{type:'integer',minimum:1},profileRevision:{type:'integer',minimum:1},
    workPackage:identifier,objectiveIds:array(identifier,1,1000),totalObjectiveCount:{type:'integer',minimum:1},goalSpecHash:hash,
    sourceFingerprint:hash,sourceRole:{const:'frozen-candidate'},executorId:identifier,templateHash:hash,machineId:identifier,agentId:identifier,
    workspace:string(2000),taskId:identifier,mainBaselineTaskId:identifier,createdAt:date,reason:string(1000),
    reconciliationId:{type:'string',format:'uuid'},reconciliationSha256:hash,
    runId:nullable(identifier),status:{type:'string',enum:['registering','ready','queued','running','observed','stopped','blocked']},
    taskStatus:nullable({type:'string'}),runStatus:nullable({type:'string'}),reportStatus:nullable({type:'string',enum:['pass','fail','unknown']}),
    reportSha256:nullable(hash),checks:array(ref('ProjectAutonomyCheck')),summary:{type:'string'},usage:ref('ProjectAutonomyBaselineUsage'),
    projectBudget:ref('ProjectAutonomyBudget'),objectivesAccepted:{const:false},verifiedObjectiveIds:{type:'array',maxItems:0,items:identifier},
    currentMainBaseline:nullable(ref('ProjectAutonomyMainBaseline')),
  };
  schemas.ProjectAutonomyBaseline=object(baselineProperties,Object.keys(baselineProperties).filter(key=>!['taskId','mainBaselineTaskId'].includes(key)));
  schemas.ProjectAutonomyBaseline.description='独立候选对照批次，原冻结计划保持不动。状态和检查来源于真实task/run；pass须完整签名、冻结角色/模板/源码/项目/机器绑定、所需检查实际执行通过且无跳过未知，仍不接受74目标或代替独立评审。projectBudget按本项目所有task的runId去重，含旧监督、main窄主验与候选批次；原Profile.budget仍为原计划账。';
  schemas.ProjectAutonomyBaselineResponse=object({data:ref('ProjectAutonomyBaseline')});
  schemas.ProjectAutonomyBaselinesResponse=object({data:object({items:array(ref('ProjectAutonomyBaseline'),undefined,100),total:integer,offset:integer,nextOffset:nullable(integer),latest:nullable(ref('ProjectAutonomyBaseline')),currentMainBaseline:nullable(ref('ProjectAutonomyMainBaseline'))})});
  const baselinePath='/api/v1/projects/{id}/autonomy/baselines';
  add('get',baselinePath,'listProjectAutonomyBaselines','读取现有成果主验与候选对照批次','ProjectAutonomyBaselinesResponse');
  document.paths[baselinePath].get.parameters.push({name:'offset',in:'query',required:false,schema:{type:'integer',minimum:0,default:0}},{name:'limit',in:'query',required:false,schema:{type:'integer',minimum:1,maximum:100,default:25}});
  add('post',baselinePath,'registerProjectAutonomyBaseline','安全登记新的固定候选核验任务','ProjectAutonomyBaselineResponse','ProjectAutonomyBaselineInput');
  add('get',baselinePath+'/{batchId}','getProjectAutonomyBaseline','读取指定候选批次实际过程与检查','ProjectAutonomyBaselineResponse');
  document.paths[baselinePath+'/{batchId}'].get.parameters.push({name:'batchId',in:'path',required:true,schema:identifier});
  document.paths[baselinePath+'/{batchId}'].get.responses[404]={description:'BASELINE_NOT_FOUND：该项目下不存在此批次；不能跨项目读取。',content:{'application/json':{schema:ref('ProjectAutonomyError')}}};
  return document;
};
