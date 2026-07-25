import type {
  ConfigDocument,
  DashboardState,
  ProxyStatus,
  QuestionEntry,
  QuestionMeta,
  QuestionRow,
  RunTaskState,
  SessionRow,
  ThreadProgress,
} from '../types'

const providerLabels = {
  wjx: '问卷星',
  qq: '腾讯问卷',
  credamo: '见数',
}

const proxyLabels = {
  default: '默认',
  benefit: '限时福利',
  custom: '自定义',
}

export function mapDashboard(
  base: DashboardState,
  config: ConfigDocument,
  runState: RunTaskState | null,
  proxyStatus: ProxyStatus | null,
): DashboardState {
  const questions = config.survey.definition.questions ?? []
  const target = config.execution.target
  const current = runState?.result
    ? runState.result.success + runState.result.fail
    : clamp(Math.round(base.progressCurrent), 0, target)
  const runningText = runState?.status === 'canceling'
    ? '正在停止'
    : runState?.status === 'paused'
      ? (runState.pauseReason ? `已暂停：${runState.pauseReason}` : '已暂停')
      : runState?.status === 'running'
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
  const provider = config.survey.provider as keyof typeof providerLabels
  const proxySource = config.network.proxySource as keyof typeof proxyLabels

  return {
    ...base,
    surveyTitle: config.survey.title || config.survey.definition.title || '未命名问卷',
    surveyUrl: config.survey.url,
    targetCount: target,
    threadCount: config.execution.threads,
    randomIpEnabled: config.network.randomProxyEnabled,
    proxySource: proxyLabels[proxySource] ?? config.network.proxySource,
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
    progressPercent: target > 0 ? clamp(Math.round((current / target) * 100), 0, 100) : 0,
    statusText: runningText || runState?.error || resultText || (config.survey.url ? '等待启动' : '等待配置'),
    platformLabel: providerLabels[provider] ?? '问卷星',
    metrics: [
      { label: '已解析题目', value: String(questions.length) },
      { label: '并发数', value: String(config.execution.threads) },
      { label: '随机 IP', value: config.network.randomProxyEnabled ? '已启用' : '未启用', tone: config.network.randomProxyEnabled ? 'success' : '' },
      { label: '反填', value: config.reverseFill.enabled ? '已启用' : '未启用', tone: config.reverseFill.enabled ? 'success' : '' },
    ],
    quickActions: [
      { id: 'parse', label: '解析问卷', icon: 'scan', emphasis: 'primary' },
      { id: 'load-config', label: '导入配置', icon: 'import' },
      { id: 'save-config', label: '保存配置', icon: 'export' },
      { id: 'open-runtime', label: '高级参数', icon: 'tune' },
    ],
    runtimeHint: config.network.randomUaEnabled ? '随机 UA 已开启' : '随机 UA 未开启',
    proxyHint: config.execution.failStop ? '失败停止已开启' : '失败停止已关闭',
    questionRows: mapQuestionRows(config),
    sessionRows: mapSessionRows(runState?.result?.thread_progress ?? []),
  }
}

export function questionTypeLabel(question: Pick<QuestionMeta, 'provider_type' | 'type_code'>): string {
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

function mapQuestionRows(config: ConfigDocument): QuestionRow[] {
  const entries = config.answers.questions ?? []
  return (config.survey.definition.questions ?? [])
    .filter((question) => !question.is_description)
    .map((question) => {
      const entry = entries.find((item) => item.question_num === question.num)
      return {
        index: question.num,
        type: questionTypeLabel(question),
        dimension: entry?.dimension ?? '',
        strategy: strategyLabel(entry),
      }
    })
}

function strategyLabel(entry: QuestionEntry | undefined): string {
  if (!entry) return '随机'
  if (entry.ai_enabled) return 'AI'
  return entry.distribution_mode || entry.psycho_bias || '随机'
}

function mapSessionRows(progress: ThreadProgress[]): SessionRow[] {
  return progress.map((item, index) => {
    const total = item.step_total || 1
    return {
      thread: item.thread_name || `Worker-${index + 1}`,
      status: item.status_text || (item.running ? '运行中' : '空闲'),
      progress: clamp(Math.round(((item.step_current || 0) / total) * 100), 0, 100),
    }
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
