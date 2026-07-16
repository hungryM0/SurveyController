import type {
  AppSettings,
  DashboardState,
  QuestionEntry,
  ProxyStatus,
  QuestionMeta,
  QuestionRow,
  ReverseFillPreview,
  ReverseFillRow,
  RunTaskState,
  RuntimeConfig,
  SettingsGroup,
  ShellState,
  ThreadProgress,
} from '../types'

export interface AppModel {
  shell: ShellState
  settings: AppSettings
  config: RuntimeConfig
  configPath: string
  reverseFillPreview: ReverseFillPreview | null
}

const providerLabels: Record<string, string> = {
  wjx: '问卷星',
  qq: '腾讯问卷',
  credamo: '见数',
}

const proxyLabels: Record<string, string> = {
  default: '默认',
  benefit: '限时福利',
  custom: '自定义',
}

const proxyValues: Record<string, string> = Object.fromEntries(
  Object.entries(proxyLabels).map(([value, label]) => [label, value]),
)

const aiModeLabels: Record<string, string> = {
  free: '限时免费',
  provider: '自定义服务商',
}

const aiModeValues: Record<string, string> = Object.fromEntries(
  Object.entries(aiModeLabels).map(([value, label]) => [label, value]),
)

const aiProviderLabels: Record<string, string> = {
  deepseek: 'DeepSeek',
  custom: 'OpenAI 兼容',
}

const aiProviderValues: Record<string, string> = Object.fromEntries(
  Object.entries(aiProviderLabels).map(([value, label]) => [label, value]),
)

const aiProviderDefaultModels: Record<string, string> = {
  deepseek: 'deepseek-v4-flash',
  custom: '',
}

const defaultAISystemPromptBase = `你现在不是AI助手，而是一名有实际使用经验但不专业的普通用户。
请按照“填写问卷/填空题”的方式作答，而不是解释或对话。

回答规则：
1. 只给出答案本身，不要解释原因，不要分析，不要教学
2. 以个人体验和模糊印象为主，可以不确定，可以用模糊一些的表达
3. 回答尽量简短，避免长句
4. 不要使用专业术语或严谨表述

请注意：
- 不要像AI助手一样分点说明
- 不要补充背景知识
- 不要解释题目
- 不要自称“作为AI”

如果你的回答开始变得专业、详细或像在解释，请立即改回普通用户的随意回答风格。`

const defaultAISystemPromptProvider = `${defaultAISystemPromptBase}

多项填空补充规则：
6. 当题目有多个空位时，按空位顺序输出一个字符串，并使用 || 分隔每个答案（示例：答案1||答案2||答案3）`

const aiProtocols = ['auto', 'chat_completions', 'responses']
const randomUAKeys = ['wechat', 'mobile', 'pc'] as const
const defaultRandomUARatios: Record<string, number> = { wechat: 33, mobile: 33, pc: 34 }

export function buildAppModel(shell: ShellState, settings: AppSettings, config?: RuntimeConfig | null, configPath = ''): AppModel {
  const runtimeConfig = normalizeRuntimeConfig(config ?? {
    url: shell.dashboard.surveyUrl,
    survey_title: shell.dashboard.surveyTitle,
    target: shell.dashboard.targetCount,
    threads: shell.dashboard.threadCount,
    random_ip_enabled: shell.dashboard.randomIpEnabled,
    proxy_source: 'default',
  })
  return {
    shell: applyConfigToShell(shell, settings, runtimeConfig, null),
    settings,
    config: runtimeConfig,
    configPath,
    reverseFillPreview: null,
  }
}

export function applyConfigToShell(
  shell: ShellState,
  settings: AppSettings,
  config: RuntimeConfig,
  preview: ReverseFillPreview | null,
  runState: RunTaskState | null = null,
  proxyStatus: ProxyStatus | null = null,
): ShellState {
  const normalized = normalizeRuntimeConfig(config)
  return {
    ...shell,
    themeMode: settings.themeMode || shell.themeMode,
    dashboard: mapDashboard(shell.dashboard, normalized, runState, proxyStatus),
    runtimeGroups: mapRuntimeGroups(normalized),
    settingsGroups: mapSettingsGroups(settings),
    strategyRules: mapStrategyRules(normalized),
    dimensionGroups: mapDimensionGroups(normalized),
    reverseFillPlan: mapReverseFillRows(normalized, preview),
  }
}

export function normalizeRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
  const threads = clampInt(config.threads, 1, 128, 1)
  return {
    ...config,
    url: config.url ?? '',
    survey_title: config.survey_title ?? '',
    survey_provider: config.survey_provider ?? inferProvider(config.url),
    target: clampInt(config.target, 1, 999999, 1),
    threads,
    submit_interval: normalizePair(config.submit_interval, [0, 0]),
    answer_duration: normalizePair(config.answer_duration, [60, 120]),
    answer_datetime_window: normalizeStringPair(config.answer_datetime_window),
    random_ip_enabled: Boolean(config.random_ip_enabled),
    proxy_source: config.proxy_source || 'default',
    custom_proxy_api: config.custom_proxy_api ?? '',
    proxy_area_code: normalizeProxyAreaCode(config.proxy_area_code),
    random_ua_enabled: Boolean(config.random_ua_enabled),
    random_ua_ratios: normalizeRandomUARatios(config.random_ua_ratios),
    random_ua_preset: config.random_ua_preset || 'pc_web',
    fail_stop_enabled: config.fail_stop_enabled ?? true,
    pause_on_aliyun_captcha: config.pause_on_aliyun_captcha ?? true,
    reliability_mode_enabled: config.reliability_mode_enabled ?? true,
    psycho_target_alpha: config.psycho_target_alpha ?? 0.85,
    ai_mode: normalizeAIMode(config.ai_mode),
    ai_provider: normalizeAIProvider(config.ai_provider),
    ai_api_key: config.ai_api_key ?? '',
    ai_base_url: config.ai_base_url ?? '',
    ai_api_protocol: normalizeAIProtocol(config.ai_api_protocol),
    ai_model: config.ai_model ?? aiProviderDefaultModels[normalizeAIProvider(config.ai_provider)] ?? '',
    ai_system_prompt: config.ai_system_prompt ?? defaultAISystemPromptForMode(config.ai_mode),
    reverse_fill_enabled: Boolean(config.reverse_fill_enabled),
    reverse_fill_format: config.reverse_fill_format || 'auto',
    reverse_fill_start_row: clampInt(config.reverse_fill_start_row, 1, 999999, 1),
    reverse_fill_threads: clampInt(config.reverse_fill_threads, 1, 128, threads),
    dimension_groups: config.dimension_groups ?? [],
    answer_rules: config.answer_rules ?? [],
    question_entries: config.question_entries ?? [],
    questions_info: config.questions_info ?? [],
  }
}

export function updateRuntimeConfigField(config: RuntimeConfig, fieldId: string, rawValue: string | boolean): RuntimeConfig {
  const next = normalizeRuntimeConfig(config)
  const text = String(rawValue)
  switch (fieldId) {
    case 'target':
      next.target = clampInt(Number(text), 1, 999999, 1)
      break
    case 'threads':
      next.threads = clampInt(Number(text), 1, 128, 1)
      next.reverse_fill_threads = Math.max(1, next.reverse_fill_threads ?? next.threads)
      break
    case 'interval':
      next.submit_interval = parseRangePair(text, [0, 0])
      break
    case 'answer-duration':
      next.answer_duration = parseRangePair(text, [60, 120])
      break
    case 'answer-datetime-window':
      next.answer_datetime_window = parseDateTimeWindowPair(text)
      break
    case 'random-ip':
      next.random_ip_enabled = Boolean(rawValue)
      break
    case 'proxy-source':
      next.proxy_source = proxyValues[text] ?? text
      break
    case 'custom-proxy-api':
      next.custom_proxy_api = text
      break
    case 'proxy-area-code':
      next.proxy_area_code = normalizeProxyAreaCode(text)
      break
    case 'random-ua':
      next.random_ua_enabled = Boolean(rawValue)
      break
    case 'random-ua-wechat':
      next.random_ua_ratios = updateRandomUARatio(next.random_ua_ratios, 'wechat', Number(text))
      break
    case 'random-ua-mobile':
      next.random_ua_ratios = updateRandomUARatio(next.random_ua_ratios, 'mobile', Number(text))
      break
    case 'random-ua-pc':
      next.random_ua_ratios = updateRandomUARatio(next.random_ua_ratios, 'pc', Number(text))
      break
    case 'random-ua-preset':
      next.random_ua_preset = text
      break
    case 'fail-stop':
      next.fail_stop_enabled = Boolean(rawValue)
      break
    case 'pause-captcha':
      next.pause_on_aliyun_captcha = Boolean(rawValue)
      break
    case 'reverse-fill-enabled':
      next.reverse_fill_enabled = Boolean(rawValue)
      break
    case 'reverse-fill-path':
      next.reverse_fill_source_path = text
      break
    case 'reverse-fill-format':
      next.reverse_fill_format = text
      break
    case 'reverse-fill-start-row':
      next.reverse_fill_start_row = clampInt(Number(text), 1, 999999, 1)
      break
    case 'reverse-fill-threads':
      next.reverse_fill_threads = clampInt(Number(text), 1, 128, next.threads ?? 1)
      break
    case 'ai-mode':
      next.ai_mode = normalizeAIMode(aiModeValues[text] ?? text)
      if (!config.ai_system_prompt || config.ai_system_prompt === defaultAISystemPromptForMode(config.ai_mode)) {
        next.ai_system_prompt = defaultAISystemPromptForMode(next.ai_mode)
      }
      break
    case 'ai-provider':
      next.ai_provider = normalizeAIProvider(aiProviderValues[text] ?? text)
      if (next.ai_provider !== 'custom' && !next.ai_model) {
        next.ai_model = aiProviderDefaultModels[next.ai_provider] ?? ''
      }
      break
    case 'ai-api-key':
      next.ai_api_key = text
      break
    case 'ai-model':
      next.ai_model = text
      break
    case 'ai-base-url':
      next.ai_base_url = text
      break
    case 'ai-api-protocol':
      next.ai_api_protocol = normalizeAIProtocol(text)
      break
    case 'ai-system-prompt':
      next.ai_system_prompt = text
      break
    case 'reliability-mode':
      next.reliability_mode_enabled = Boolean(rawValue)
      break
    case 'psycho-target-alpha':
      next.psycho_target_alpha = clampFloat(Number(text), 0.6, 0.95, 0.85)
      break
  }
  return normalizeRuntimeConfig(next)
}

export function syncRuntimeDefaultsFromConfig(settings: AppSettings, config: RuntimeConfig, fieldId?: string): AppSettings {
  if (fieldId && !fieldId.startsWith('ai-')) {
    return settings
  }
  return {
    ...settings,
    runtimeDefaults: {
      ...(settings.runtimeDefaults ?? {}),
      ai_mode: normalizeAIMode(config.ai_mode),
      ai_provider: normalizeAIProvider(config.ai_provider),
      ai_api_key: config.ai_api_key ?? '',
      ai_base_url: config.ai_base_url ?? '',
      ai_api_protocol: normalizeAIProtocol(config.ai_api_protocol),
      ai_model: config.ai_model ?? '',
      ai_system_prompt: config.ai_system_prompt ?? defaultAISystemPromptForMode(config.ai_mode),
    },
  }
}

export function updateAppSettingsField(settings: AppSettings, fieldId: string, rawValue: string | boolean): AppSettings {
  const next = { ...settings }
  const text = String(rawValue)
  switch (fieldId) {
    case 'nav-text':
      next.showNavigationText = Boolean(rawValue)
      break
    case 'mica':
      next.micaEnabled = Boolean(rawValue)
      break
    case 'topmost':
      next.topmost = Boolean(rawValue)
      break
    case 'ask-save-on-close':
      next.askSaveOnClose = Boolean(rawValue)
      break
    case 'prevent-sleep':
      next.preventSleepDuringRun = Boolean(rawValue)
      break
    case 'task-result-notification':
      next.taskResultNotification = Boolean(rawValue)
      next.notifications = next.taskResultNotification
      break
    case 'submission-report-telemetry':
      next.submissionReportTelemetry = Boolean(rawValue)
      break
    case 'auto-update':
      next.autoCheckUpdate = Boolean(rawValue)
      break
    case 'auto-save-logs':
      next.autoSaveLogs = Boolean(rawValue)
      break
    case 'notifications':
      next.notifications = Boolean(rawValue)
      next.taskResultNotification = next.notifications
      break
    case 'autosave':
      next.autosaveLogCount = clampInt(Number(text), 1, 100, 10)
      break
    case 'theme':
      next.themeMode = text
      break
    case 'config-directory':
      next.configDirectory = text
      break
  }
  return next
}

export function questionTypeLabel(question: QuestionMeta): string {
  switch (question.provider_type || question.type_code) {
    case 'single':
    case 'radio':
    case '3':
      return '单选题'
    case 'multiple':
    case '4':
      return '多选题'
    case 'scale':
    case '5':
      return '量表题'
    case 'matrix':
    case 'matrix_radio':
    case '6':
      return '矩阵题'
    case 'dropdown':
    case 'select':
    case '7':
      return '下拉题'
    default:
      return '填空题'
  }
}

function mapDashboard(base: DashboardState, config: RuntimeConfig, runState: RunTaskState | null, proxyStatus: ProxyStatus | null): DashboardState {
  const questions = config.questions_info ?? []
  const target = config.target ?? 1
  const current = runState?.result
    ? runState.result.success + runState.result.fail
    : clampInt(base.progressCurrent, 0, target, 0)
  const runningText = runState?.canceling
    ? '正在停止'
    : runState?.paused
      ? (runState.pauseReason ? `已暂停：${runState.pauseReason}` : '已暂停')
      : runState?.running
        ? '运行中'
        : ''
  const resultText = runState?.result
    ? `成功 ${runState.result.success}，失败 ${runState.result.fail}`
    : ''
  const proxyKnown = proxyStatus?.quotaKnown ?? false
  const proxyMessage = proxyStatus?.message ?? ''
  const quotaLabel = proxyMessage || (proxyKnown
    ? `${proxyStatus?.remainingQuota || '0'} / ${proxyStatus?.totalQuota || '0'}`
    : '未同步')
  return {
    ...base,
    surveyTitle: config.survey_title || '未命名问卷',
    surveyUrl: config.url,
    targetCount: target,
    threadCount: config.threads ?? 1,
    randomIpEnabled: Boolean(config.random_ip_enabled),
    proxySource: proxyLabels[config.proxy_source ?? 'default'] ?? config.proxy_source ?? '默认',
    randomIpQuota: proxyKnown ? 100 : 0,
    randomIpQuotaLabel: quotaLabel,
    randomIpStatus: proxyMessage || (proxyKnown ? '额度已同步' : '未连接代理服务'),
    randomIpStatusTone: proxyMessage || proxyKnown ? 'success' : '',
    proxyRemainingQuota: proxyStatus?.remainingQuota ?? '0',
    proxyTotalQuota: proxyStatus?.totalQuota ?? '0',
    proxyQuotaKnown: proxyKnown,
    proxyUserId: proxyStatus?.userId ?? 0,
    proxyUserKnown: proxyStatus?.userKnown ?? false,
    proxyPoolRemainingIp: proxyStatus?.poolRemainingIp ?? 0,
    proxyPoolRemainingKnown: proxyStatus?.poolRemainingKnown ?? false,
    proxyAvailable: proxyStatus?.available ?? 0,
    proxyInUse: proxyStatus?.inUse ?? 0,
    questionCount: questions.length,
    progressCurrent: current,
    progressTarget: target,
    progressPercent: target > 0 ? clampInt(Math.round((current / target) * 100), 0, 100, 0) : 0,
    statusText: runningText || runState?.error || resultText || (config.url ? '等待启动' : '等待配置'),
    platformLabel: providerLabels[config.survey_provider ?? 'wjx'] ?? '问卷星',
    metrics: [
      { label: '已解析题目', value: String(questions.length) },
      { label: '当前并发', value: String(config.threads ?? 1) },
      { label: '随机 IP', value: config.random_ip_enabled ? '已启用' : '未启用', tone: config.random_ip_enabled ? 'success' : '' },
      { label: '反填', value: config.reverse_fill_enabled ? '已启用' : '未启用', tone: config.reverse_fill_enabled ? 'success' : '' },
    ],
    quickActions: [
      { id: 'parse', label: '智能解析问卷', icon: 'scan', emphasis: 'primary' },
      { id: 'load-config', label: '导入配置', icon: 'import' },
      { id: 'save-config', label: '导出配置', icon: 'export' },
      { id: 'open-runtime', label: '高级参数', icon: 'tune' },
    ],
    runtimeHint: config.random_ua_enabled ? '随机 UA 已开启' : '随机 UA 未开启',
    proxyHint: config.fail_stop_enabled ? '失败停止已开启' : '失败停止已关闭',
    questionRows: mapQuestionRows(config),
    sessionRows: mapSessionRows(runState?.result?.thread_progress ?? []),
  }
}

function mapSessionRows(progress: ThreadProgress[]): Array<{ thread: string, status: string, progress: number }> {
  return progress.map((item, index) => {
    const total = item.step_total || 1
    return {
      thread: item.thread_name || `Worker-${index + 1}`,
      status: item.status_text || (item.running ? '运行中' : '空闲'),
      progress: clampInt(Math.round(((item.step_current || 0) / total) * 100), 0, 100, 0),
    }
  })
}

function mapRuntimeGroups(config: RuntimeConfig): SettingsGroup[] {
  const answerDuration = normalizePair(config.answer_duration, [60, 120])
  const submitInterval = normalizePair(config.submit_interval, [0, 0])
  const uaRatios = normalizeRandomUARatios(config.random_ua_ratios)
  return [
    {
      title: '执行参数',
      fields: [
        field('target', '目标份数', '限制本次任务的目标提交量', 'number', String(config.target ?? 1)),
        field('threads', '并发数', '纯 HTTP 并发，不走浏览器兜底', 'number', String(config.threads ?? 1)),
        field('interval', '提交间隔（秒）', '每份提交之间的等待范围', 'range', `${submitInterval[0]} - ${submitInterval[1]}`),
        field('answer-duration', '作答时长（秒）', '控制整卷耗时分布', 'range', `${answerDuration[0]} - ${answerDuration[1]}`),
        field('answer-datetime-window', '提交时间', '设置见数的提交日期时间范围', 'datetime-window', formatDateTimeWindow(config.answer_datetime_window)),
      ],
    },
    {
      title: '代理与身份',
      fields: [
        field('random-ip', '随机 IP', '启用后按会话申请代理', 'toggle', String(Boolean(config.random_ip_enabled))),
        field('proxy-source', '代理源', '默认 / 福利 / 自定义', 'select', proxyLabels[config.proxy_source ?? 'default'] ?? '默认', ['默认', '限时福利', '自定义']),
        field('proxy-area-code', '代理地区代码', '6 位行政区划代码，留空不限地区', 'text', config.proxy_area_code ?? ''),
        field('custom-proxy-api', '自定义代理 API', '', 'text', config.custom_proxy_api ?? ''),
        field('random-ua', '随机 UA', '拆散重复指纹', 'toggle', String(Boolean(config.random_ua_enabled))),
        field('random-ua-wechat', '微信访问占比', '三个访问占比总和固定为 100%', 'number', String(uaRatios.wechat)),
        field('random-ua-mobile', '手机访问占比', '三个访问占比总和固定为 100%', 'number', String(uaRatios.mobile)),
        field('random-ua-pc', '链接访问占比', '三个访问占比总和固定为 100%', 'number', String(uaRatios.pc)),
        field('fail-stop', '失败停止', '失败过多时停止任务', 'toggle', String(config.fail_stop_enabled ?? true)),
      ],
    },
    {
      title: 'AI 与反填',
      fields: [
        field('ai-mode', 'AI 模式', '目前仅可用于填空题、多项填空题的 AI 填空作答', 'select', aiModeLabels[config.ai_mode ?? 'free'] ?? '限时免费', Object.values(aiModeLabels)),
        field('ai-privacy-notice', '隐私声明', '不会上传 API Key 等隐私信息，所有配置仅保存在本地。', 'notice', ''),
        field('ai-provider', 'AI 服务商', '选择 AI 服务，自定义模式支持任意 OpenAI 兼容接口', 'select', aiProviderLabels[config.ai_provider ?? 'deepseek'] ?? 'DeepSeek', Object.values(aiProviderLabels)),
        field('ai-api-key', 'API Key', '输入对应服务的 API 密钥，获取方法请查阅服务商 API 文档', 'password', config.ai_api_key ?? ''),
        field('ai-base-url', 'Base URL', '自定义模式下可填根地址或完整端点', 'text', config.ai_base_url ?? ''),
        field('ai-api-protocol', 'AI 协议', '', 'select', config.ai_api_protocol ?? 'auto', aiProtocols),
        field('ai-model', '模型 ID', '请查阅所选服务商 API 文档后再填写准确的模型 ID', 'text', config.ai_model ?? aiProviderDefaultModels[config.ai_provider ?? 'deepseek'] ?? ''),
        field('ai-test-connection', '测试 AI 连接', '验证 API 配置是否正确', 'action', ''),
        field('ai-system-prompt', '系统提示词', '编辑 AI 填空的系统提示词，留空使用默认提示词', 'textarea', config.ai_system_prompt ?? defaultAISystemPromptForMode(config.ai_mode)),
        field('reliability-mode', '信效度计划', '', 'toggle', String(config.reliability_mode_enabled ?? true)),
        field('psycho-target-alpha', '目标 Alpha', '', 'number', String(config.psycho_target_alpha ?? 0.85)),
        field('reverse-fill-enabled', 'Excel 反填', '按导出的 Excel 回放答案', 'toggle', String(Boolean(config.reverse_fill_enabled))),
        field('reverse-fill-path', '反填文件', 'xlsx 文件路径', 'text', config.reverse_fill_source_path ?? ''),
        field('reverse-fill-format', '反填格式', '问卷星导出格式', 'select', config.reverse_fill_format ?? 'auto', ['auto', 'wjx_text', 'wjx_score', 'wjx_sequence']),
        field('reverse-fill-start-row', '起始行', 'Excel 数据起始行', 'number', String(config.reverse_fill_start_row ?? 1)),
        field('reverse-fill-threads', '反填并发', '反填任务并发数', 'number', String(config.reverse_fill_threads ?? config.threads ?? 1)),
      ],
    },
  ]
}

function mapSettingsGroups(settings: AppSettings): SettingsGroup[] {
  const taskResultNotification = settings.taskResultNotification ?? settings.notifications ?? true
  const autoSaveLogs = settings.autoSaveLogs ?? true
  return [
    {
      title: '界面外观',
      fields: [
        field('theme', '主题', '跟随系统或固定明暗色', 'select', settings.themeMode || 'system', ['system', 'light', 'dark']),
        field('nav-text', '显示导航文本', '贴近 QFluentWidgets 侧栏表现', 'toggle', String(settings.showNavigationText)),
        field('mica', '启用 Mica 背景', 'WinUI 3 风格窗口材质', 'toggle', String(settings.micaEnabled)),
      ],
    },
    {
      title: '行为设置',
      fields: [
        field('topmost', '窗口置顶', '任务运行时便于观察', 'toggle', String(settings.topmost)),
        field('ask-save-on-close', '关闭前询问是否保存', '', 'toggle', String(settings.askSaveOnClose ?? true)),
        field('prevent-sleep', '执行期间阻止自动休眠', '', 'toggle', String(settings.preventSleepDuringRun ?? true)),
        field('task-result-notification', '后台任务完成/失败时通知', '', 'toggle', String(taskResultNotification)),
        field('submission-report-telemetry', '提交结果遥测', '', 'toggle', String(settings.submissionReportTelemetry ?? true)),
        field('auto-save-logs', '自动保存日志', '任务结束后保存最近日志', 'toggle', String(autoSaveLogs)),
        field('autosave', '日志保留数量', '保留最近几份日志', 'select', String(settings.autosaveLogCount || 10), ['3', '5', '10', '20', '30', '50']),
        field('config-directory', '配置目录', '载入和保存配置的默认目录', 'text', settings.configDirectory || ''),
      ],
    },
    {
      title: '更新设置',
      fields: [
        field('auto-update', '在应用程序启动时检查更新', '', 'toggle', String(settings.autoCheckUpdate ?? true)),
      ],
    },
  ]
}

function mapQuestionRows(config: RuntimeConfig): QuestionRow[] {
  const entries = config.question_entries ?? []
  return (config.questions_info ?? []).filter((question) => !question.is_description).map((question) => {
    const entry = entries.find((item) => item.question_num === question.num)
    return {
      index: question.num,
      type: questionTypeLabel(question),
      dimension: entry?.dimension ?? '',
      strategy: strategyLabel(entry),
    }
  })
}

function mapStrategyRules(config: RuntimeConfig) {
  return (config.answer_rules ?? []).map((rule, index) => ({
    condition: ruleConditionLabel(rule, index),
    action: ruleActionLabel(rule),
    target: ruleTargetLabel(rule),
  }))
}

function strategyLabel(entry: QuestionEntry | undefined): string {
  if (!entry) {
    return '随机'
  }
  if (entry.ai_enabled) {
    return 'AI'
  }
  return String(entry.distribution_mode || entry.psycho_bias || '随机')
}

export function mapDimensionGroups(config: RuntimeConfig): string[] {
  const groups = new Set<string>()
  for (const item of config.dimension_groups ?? []) {
    const text = String(item || '').trim()
    if (text) {
      groups.add(text)
    }
  }
  for (const entry of config.question_entries ?? []) {
    const text = String(entry.dimension || '').trim()
    if (text) {
      groups.add(text)
    }
  }
  return [...groups]
}

function ruleConditionLabel(rule: Record<string, unknown>, index: number): string {
  const questionNum = Number(rule.condition_question_num)
  const mode = String(rule.condition_mode || '')
  const options = optionIndicesLabel(rule.condition_option_indices)
  const row = rowLabel(rule.condition_row_index)
  if (!Number.isFinite(questionNum) || questionNum <= 0) {
    return `规则 ${index + 1}`
  }
  return `第 ${questionNum} 题${row} ${conditionModeLabel(mode)} ${options}`
}

function ruleActionLabel(rule: Record<string, unknown>): string {
  return String(rule.action_mode) === 'must_not_select' ? '不得选择' : '必须选择'
}

function ruleTargetLabel(rule: Record<string, unknown>): string {
  const questionNum = Number(rule.target_question_num)
  const row = rowLabel(rule.target_row_index)
  const options = optionIndicesLabel(rule.target_option_indices)
  if (!Number.isFinite(questionNum) || questionNum <= 0) {
    return options
  }
  return `第 ${questionNum} 题${row} ${options}`
}

function conditionModeLabel(mode: string): string {
  return mode === 'not_selected' ? '未选中' : '选中'
}

function optionIndicesLabel(raw: unknown): string {
  if (!Array.isArray(raw) || !raw.length) {
    return '-'
  }
  return raw
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .map((item) => String(item + 1))
    .join('、') || '-'
}

function rowLabel(raw: unknown): string {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) {
    return ''
  }
  return `第 ${value + 1} 行`
}

function mapReverseFillRows(config: RuntimeConfig, preview: ReverseFillPreview | null): ReverseFillRow[] {
  const columns = preview?.question_columns ?? {}
  const questions = config.questions_info ?? []
  if (!questions.length) {
    return []
  }
  return questions.map((question) => {
    const matched = columns[String(question.num)] ?? []
    return {
      question: `第 ${question.num} 题`,
      column: matched.map((item) => item.header).join(', ') || '-',
      state: matched.length ? `已匹配 ${preview?.total_data_rows ?? 0} 行` : '未匹配',
    }
  })
}

function field(id: string, label: string, description: string, kind: string, value: string, options?: string[]) {
  return { id, label, description, kind, value, options }
}

function inferProvider(url: string): string {
  const normalized = (url || '').toLowerCase()
  if (normalized.includes('wj.qq.com')) {
    return 'qq'
  }
  if (normalized.includes('credamo')) {
    return 'credamo'
  }
  return 'wjx'
}

function normalizePair(value: number[] | undefined, fallback: [number, number]): [number, number] {
  if (!value || value.length < 2) {
    return fallback
  }
  const left = clampInt(value[0], 0, 999999, fallback[0])
  const right = clampInt(value[1], left, 999999, fallback[1])
  return [left, right]
}

function normalizeStringPair(value: string[] | undefined): [string, string] {
  return [String(value?.[0] ?? '').trim(), String(value?.[1] ?? '').trim()]
}

function parseDateTimeWindowPair(value: string): [string, string] {
  const parts = String(value || '')
    .split(/\s*(?:\||~)\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
  return [parts[0] ?? '', parts[1] ?? '']
}

function formatDateTimeWindow(value: string[] | undefined): string {
  const [start, end] = normalizeStringPair(value)
  if (!start && !end) {
    return ''
  }
  return `${start} | ${end}`.trim()
}

function parseRangePair(value: string, fallback: [number, number]): [number, number] {
  const parts = String(value || '').match(/\d+/g) ?? []
  if (!parts.length) {
    return fallback
  }
  const left = clampInt(Number(parts[0]), 0, 999999, fallback[0])
  const right = clampInt(Number(parts[1] ?? parts[0]), left, 999999, fallback[1])
  return [left, right]
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(min, Math.min(max, parsed))
}

function normalizeAIProtocol(value?: string): string {
  const text = String(value ?? 'auto').trim().toLowerCase()
  return aiProtocols.includes(text) ? text : 'auto'
}

function normalizeAIMode(value?: string): string {
  const text = String(value ?? 'free').trim().toLowerCase()
  return text === 'provider' ? 'provider' : 'free'
}

function normalizeAIProvider(value?: string): string {
  const text = String(value ?? 'deepseek').trim().toLowerCase()
  return text in aiProviderLabels ? text : 'deepseek'
}

function defaultAISystemPromptForMode(mode?: string): string {
  return normalizeAIMode(mode) === 'provider' ? defaultAISystemPromptProvider : defaultAISystemPromptBase
}

function normalizeProxyAreaCode(value?: string | null): string | null {
  const text = String(value ?? '').trim()
  return /^\d{6}$/.test(text) ? text : null
}

function normalizeRandomUARatios(value?: Record<string, number>): Record<string, number> {
  if (!value) {
    return { ...defaultRandomUARatios }
  }
  const result: Record<string, number> = {}
  let sum = 0
  for (const key of randomUAKeys) {
    const item = clampInt(value[key], 0, 100, -1)
    if (item < 0) {
      return { ...defaultRandomUARatios }
    }
    result[key] = item
    sum += item
  }
  if (sum !== 100) {
    return { ...defaultRandomUARatios }
  }
  return result
}

function updateRandomUARatio(current: Record<string, number> | undefined, key: typeof randomUAKeys[number], value: number): Record<string, number> {
  const next = normalizeRandomUARatios(current)
  next[key] = clampInt(value, 0, 100, next[key])
  let delta = Object.values(next).reduce((sum, item) => sum + item, 0) - 100
  for (const candidate of randomUAKeys) {
    if (candidate === key || delta === 0) {
      continue
    }
    if (delta > 0) {
      const decrease = Math.min(delta, next[candidate])
      next[candidate] -= decrease
      delta -= decrease
    } else {
      const increase = Math.min(-delta, 100 - next[candidate])
      next[candidate] += increase
      delta += increase
    }
  }
  return normalizeRandomUARatios(next)
}
