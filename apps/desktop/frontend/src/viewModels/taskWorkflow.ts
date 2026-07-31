import type { ConfigDocument, ProxyStatus, RunTaskEvent, RunTaskState } from '../types'
import { isHttpProxyAddress, normalizeProxySource } from '../services/configDocumentValues'
import { networkMode } from '../components/config-wizard/networkStepModel'

export const WORKFLOW_STEPS = ['survey', 'answers', 'task', 'network', 'check', 'run'] as const

export type WorkflowStepId = (typeof WORKFLOW_STEPS)[number]
export type WorkflowStepState = 'locked' | 'available' | 'current' | 'complete'
export type TaskLifecycleStatus =
  | 'new'
  | 'configuring'
  | 'needs_check'
  | 'ready'
  | 'running'
  | 'paused'
  | 'canceling'
  | 'completed'
  | 'failed'

export type StatusTone = 'neutral' | 'active' | 'warning' | 'success' | 'danger'

export interface StatusPresentation {
  label: string
  icon: string
  tone: StatusTone
}

export interface WorkflowStep {
  id: WorkflowStepId
  index: number
  label: string
  state: WorkflowStepState
  completed: boolean
  accessible: boolean
}

export interface WorkflowCheckIssue {
  field: string
  message: string
  step: WorkflowStepId
  severity: 'warning' | 'error'
}

export interface WorkflowCheck {
  level: 'ready' | 'warning' | 'blocked'
  label: string
  icon: string
  tone: StatusTone
  issues: WorkflowCheckIssue[]
  configFingerprint: string
  isStale: boolean
  confirmed: boolean
}

export interface TaskWorkflowInput {
  config: ConfigDocument
  runState?: RunTaskState | null
  proxyStatus?: ProxyStatus | null
  currentStep?: WorkflowStepId
  checkedConfigFingerprint?: string
  checkedStatus?: WorkflowCheck['level']
}

export interface TaskWorkflow {
  status: TaskLifecycleStatus
  statusPresentation: StatusPresentation
  steps: WorkflowStep[]
  check: WorkflowCheck
  configFingerprint: string
  canStart: boolean
}

export interface RunResultSummary {
  status: string
  icon: string
  tone: StatusTone
  success: string
  failed: string
  total: string
}

export interface FormattedLogEvent {
  sequence: string
  time: string
  worker: string
  message: string
  icon: string
  tone: StatusTone
  progress: string
}

const stepLabels: Record<WorkflowStepId, string> = {
  survey: '问卷',
  answers: '答案',
  task: '任务',
  network: '网络',
  check: '检查',
  run: '运行',
}

const statusPresentations: Record<TaskLifecycleStatus, StatusPresentation> = {
  new: { label: '新建', icon: 'file-plus-2', tone: 'neutral' },
  configuring: { label: '配置中', icon: 'pencil-line', tone: 'active' },
  needs_check: { label: '待检查', icon: 'clipboard-list', tone: 'warning' },
  ready: { label: '可以运行', icon: 'circle-check', tone: 'success' },
  running: { label: '运行中', icon: 'play-circle', tone: 'active' },
  paused: { label: '已暂停', icon: 'pause-circle', tone: 'warning' },
  canceling: { label: '正在停止', icon: 'loader-circle', tone: 'warning' },
  completed: { label: '已完成', icon: 'circle-check-big', tone: 'success' },
  failed: { label: '运行失败', icon: 'circle-x', tone: 'danger' },
}

export function mapTaskWorkflow(input: TaskWorkflowInput): TaskWorkflow {
  const fingerprint = fingerprintConfig(input.config)
  const completion = mapCompletion(input.config, input.proxyStatus)
  const check = mapWorkflowCheck(input.config, input.proxyStatus, input.checkedConfigFingerprint, input.checkedStatus)
  const checkComplete = check.level !== 'blocked' && check.confirmed && !check.isStale
  const completionWithWorkflow = [...completion, checkComplete, isRunFinished(input.runState)]
  const activeIndex = input.currentStep ? WORKFLOW_STEPS.indexOf(input.currentStep) : -1
  const steps = WORKFLOW_STEPS.map((id, index) => {
    const completed = completionWithWorkflow[index]
    const accessible = id === 'run'
      ? checkComplete
      : index === 0 || completionWithWorkflow.slice(0, index).every(Boolean)
    const state: WorkflowStepState = completed
      ? 'complete'
      : activeIndex === index && accessible
        ? 'current'
        : accessible
          ? 'available'
          : 'locked'
    return { id, index: index + 1, label: stepLabels[id], state, completed, accessible }
  })
  const status = mapTaskLifecycleStatus(input.runState, completion, {
    ...check,
    level: checkComplete ? 'ready' : check.level === 'ready' ? 'warning' : check.level,
  })
  return {
    status,
    statusPresentation: statusPresentations[status],
    steps,
    check,
    configFingerprint: fingerprint,
    canStart: checkComplete && !isRunActive(input.runState),
  }
}

export function mapTaskLifecycleStatus(
  runState: RunTaskState | null | undefined,
  completion: readonly boolean[],
  check: Pick<WorkflowCheck, 'level' | 'isStale'>,
): TaskLifecycleStatus {
  const runtimeStatus = mapRunTaskStatus(runState?.status)
  if (runtimeStatus !== 'new') return runtimeStatus
  if (!completion[0]) return 'new'
  if (!completion.slice(0, 4).every(Boolean)) return 'configuring'
  if (check.level === 'ready' && !check.isStale) return 'ready'
  return 'needs_check'
}

export function mapRunTaskStatus(status: RunTaskState['status'] | null | undefined): TaskLifecycleStatus {
  switch (status) {
    case 'running':
      return 'running'
    case 'paused':
      return 'paused'
    case 'canceling':
      return 'canceling'
    case 'succeeded':
    case 'stopped':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'idle':
    default:
      return 'new'
  }
}

export function getStatusPresentation(status: TaskLifecycleStatus): StatusPresentation {
  return statusPresentations[status]
}

export function mapWorkflowCheck(
  config: ConfigDocument,
  proxyStatus?: ProxyStatus | null,
  checkedConfigFingerprint?: string,
  checkedStatus?: WorkflowCheck['level'],
): WorkflowCheck {
  const fingerprint = fingerprintConfig(config)
  const issues = collectIssues(config, proxyStatus)
  const hasErrors = issues.some((issue) => issue.severity === 'error')
  const level = hasErrors || checkedStatus === 'blocked'
    ? 'blocked'
    : checkedStatus === 'warning' || issues.length > 0
      ? 'warning'
      : 'ready'
  const isStale = checkedConfigFingerprint !== fingerprint
  return {
    level,
    label: level === 'ready' ? '可以启动' : level === 'warning' ? '需要注意' : '无法启动',
    icon: level === 'ready' ? 'circle-check' : level === 'warning' ? 'triangle-alert' : 'circle-x',
    tone: level === 'ready' ? 'success' : level === 'warning' ? 'warning' : 'danger',
    issues,
    configFingerprint: fingerprint,
    isStale,
    confirmed: checkedConfigFingerprint === fingerprint,
  }
}

export function fingerprintConfig(config: ConfigDocument): string {
  return stableSerialize(config)
}

export function formatRunResultSummary(result: RunTaskState['result'] | null | undefined): RunResultSummary {
  if (!result) {
    return { status: '尚未启动', icon: 'circle-dashed', tone: 'neutral', success: '未知', failed: '未知', total: '未知' }
  }
  const success = numberText(result.success)
  const failed = numberText(result.fail)
  return {
    status: result.stopped ? '已停止' : '已完成',
    icon: result.stopped ? 'square' : 'circle-check-big',
    tone: result.stopped ? 'warning' : 'success',
    success,
    failed,
    total: typeof result.success === 'number' && typeof result.fail === 'number' ? String(result.success + result.fail) : '未知',
  }
}

export function formatRunLogEvent(event: RunTaskEvent | null | undefined): FormattedLogEvent {
  if (!event) {
    return { sequence: '未知', time: '未知', worker: '未知', message: '尚未启动', icon: 'circle-dashed', tone: 'neutral', progress: '未知' }
  }
  const detail = event.event
  const current = numberText(detail?.current)
  const total = numberText(detail?.total)
  const success = detail?.success === true
  const failed = detail?.fail === true
  return {
    sequence: numberText(event.sequence),
    time: textOrUnknown(detail?.time),
    worker: textOrUnknown(detail?.worker),
    message: textOrUnknown(detail?.message),
    icon: failed ? 'circle-x' : success ? 'circle-check' : 'activity',
    tone: failed ? 'danger' : success ? 'success' : 'active',
    progress: current === '未知' || total === '未知' ? '未知' : `${current} / ${total}`,
  }
}

export function isRunActive(runState: RunTaskState | null | undefined): boolean {
  return runState?.status === 'running' || runState?.status === 'paused' || runState?.status === 'canceling'
}

function mapCompletion(config: ConfigDocument, proxyStatus: ProxyStatus | null | undefined): boolean[] {
  const survey = isSurveyParsed(config)
  const answers = survey && hasAnswerStrategies(config)
  const task = answers && isExecutionValid(config)
  const network = task && isNetworkReady(config, proxyStatus)
  return [survey, answers, task, network]
}

function collectIssues(config: ConfigDocument, proxyStatus: ProxyStatus | null | undefined): WorkflowCheckIssue[] {
  const issues: WorkflowCheckIssue[] = []
  if (!isSurveyParsed(config)) issues.push({ field: 'survey.definition.questions', message: '问卷尚未真实解析成功', step: 'survey', severity: 'error' })
  if (isSurveyParsed(config) && !hasAnswerStrategies(config)) issues.push({ field: 'answers.questions', message: '仍有题目没有答案策略', step: 'answers', severity: 'error' })
  if (isSurveyParsed(config) && hasAnswerStrategies(config) && !isExecutionValid(config)) {
    issues.push({ field: 'execution', message: '任务参数存在无效值，请检查目标数量、并发数和范围', step: 'task', severity: 'error' })
  }
  if (isSurveyParsed(config) && hasAnswerStrategies(config) && isExecutionValid(config) && !isNetworkReady(config, proxyStatus)) {
    issues.push({ field: 'network', message: networkIssueMessage(config), step: 'network', severity: 'error' })
  }
  return issues
}

function isSurveyParsed(config: ConfigDocument): boolean {
  return Boolean(config.survey.url.trim() && config.survey.definition.questions?.some((question) => !question.is_description))
}

function hasAnswerStrategies(config: ConfigDocument): boolean {
  const questions = (config.survey.definition.questions ?? []).filter((question) => !question.is_description)
  const strategies = config.answers.questions ?? []
  return questions.length > 0 && questions.every((question) => strategies.some((strategy) => strategy.question_num === question.num))
}

function isExecutionValid(config: ConfigDocument): boolean {
  const execution = config.execution
  return Number.isInteger(execution.target) && execution.target > 0
    && Number.isInteger(execution.threads) && execution.threads > 0
    && validRange(execution.submitInterval) && validRange(execution.answerDuration)
}

export function isNetworkReady(config: ConfigDocument, proxyStatus: ProxyStatus | null | undefined): boolean {
  const mode = networkMode(config.network)
  if (mode === 'direct') return true
  if (mode === 'fixed') return isHttpProxyAddress(config.network.fixedProxyAddress)
  if (!proxyStatus) return false
  if (normalizeProxySource(config.network.proxySource) !== normalizeProxySource(proxyStatus.source)) return false
  const message = proxyStatus.message.trim()
  if (/失败|错误|不可用|已用完|为空/.test(message)) return false
  return proxyStatus.quotaKnown
    || proxyStatus.poolRemainingKnown
    || proxyStatus.available > 0
    || /连接|同步|成功/.test(message)
}

function networkIssueMessage(config: ConfigDocument): string {
  if (networkMode(config.network) === 'fixed' && !isHttpProxyAddress(config.network.fixedProxyAddress)) {
    return '固定代理模式需要填写有效的 HTTP 或 HTTPS 代理地址'
  }
  return '代理状态尚未确认，或代理连接测试失败'
}

function isRunFinished(runState: RunTaskState | null | undefined): boolean {
  return runState?.status === 'succeeded' || runState?.status === 'stopped'
}

function validRange(value: number[] | null | undefined): boolean {
  return Boolean(value && value.length >= 2 && value.every((item) => Number.isFinite(item) && item >= 0) && value[0] <= value[1])
}

function numberText(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '未知'
}

function textOrUnknown(value: string | null | undefined): string {
  return value?.trim() || '未知'
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
