import type { ProxyStatus } from '../../types'

export type ProxySource = 'default' | 'benefit' | 'custom'
export type NetworkMode = 'direct' | 'fixed' | 'random'
export type NetworkStatusTone = 'success' | 'warning' | 'danger'
export type NetworkStatusIcon = 'direct' | 'loading' | 'connected' | 'unknown' | 'error'
export type CustomProxyTestPhase = 'idle' | 'missing' | 'loading' | 'success' | 'failure'
export type FixedProxyTestPhase = 'idle' | 'missing' | 'invalid' | 'loading' | 'success' | 'failure'

export interface ProxyStatusView {
  tone: NetworkStatusTone
  icon: NetworkStatusIcon
  title: string
  detail: string
  sourceLabel: string
  quotaLabel: string
  poolLabel: string
}

export interface ProxyStatusViewOptions {
  randomIPEnabled: boolean
  source: string
  status?: ProxyStatus | null
  loading?: boolean
  error?: string
}

export interface CustomProxyTestView {
  visible: boolean
  tone: NetworkStatusTone
  icon: NetworkStatusIcon
  title: string
  detail: string
}

export function normalizeProxySource(value: string | null | undefined): ProxySource {
  if (value === 'benefit' || value === '福利' || value === '限时福利') return 'benefit'
  if (value === 'custom' || value === '自定义') return 'custom'
  return 'default'
}

export function networkMode(
  network: Pick<{ randomProxyEnabled: boolean; proxyMode?: string; fixedProxyAddress?: string }, 'randomProxyEnabled' | 'proxyMode' | 'fixedProxyAddress'>,
): NetworkMode {
	if (network.proxyMode === 'direct' || network.proxyMode === 'fixed' || network.proxyMode === 'random') return network.proxyMode
	if (network.fixedProxyAddress?.trim()) return 'fixed'
  return network.randomProxyEnabled ? 'random' : 'direct'
}

export function proxySourceLabel(value: string | null | undefined): string {
  switch (normalizeProxySource(value)) {
    case 'benefit':
      return '限时福利代理'
    case 'custom':
      return '自定义代理 API'
    default:
      return '默认代理'
  }
}

export function buildProxyStatusView({
  randomIPEnabled,
  source,
  status = null,
  loading = false,
  error = '',
}: ProxyStatusViewOptions): ProxyStatusView {
  if (!randomIPEnabled) {
    return {
      tone: 'success',
      icon: 'direct',
      title: '直连',
      detail: error
        ? `本次任务仍使用直连。代理服务状态读取失败：${error}`
        : '随机 IP 未开启，本次任务直接访问问卷。',
      sourceLabel: '直连',
      quotaLabel: '不适用（直连）',
      poolLabel: '不适用（直连）',
    }
  }

  const sourceLabel = proxySourceLabel(source)
  if (loading) {
    return {
      tone: 'warning',
      icon: 'loading',
      title: '正在读取代理状态',
      detail: '正在从 Wails 服务读取当前代理状态。',
      sourceLabel,
      quotaLabel: '读取中',
      poolLabel: '读取中',
    }
  }

  if (error) {
    return {
      tone: 'danger',
      icon: 'error',
      title: '代理状态读取失败',
      detail: error,
      sourceLabel,
      quotaLabel: '未知',
      poolLabel: '未知',
    }
  }

  if (!status) {
    return {
      tone: 'warning',
      icon: 'unknown',
      title: '代理状态未知',
      detail: '尚未从 Wails 服务读取到代理状态。',
      sourceLabel,
      quotaLabel: '未知',
      poolLabel: '未知',
    }
  }

  const message = status.message.trim()
  const quotaLabel = formatProxyQuota(status)
  const poolLabel = formatProxyPool(status)
  if (isProxyUnavailableMessage(message)) {
    return {
      tone: 'danger',
      icon: 'error',
      title: '代理不可用',
      detail: message,
      sourceLabel,
      quotaLabel,
      poolLabel,
    }
  }

  const hasKnownConnection = status.quotaKnown
    || status.poolRemainingKnown
    || status.available > 0
    || status.inUse > 0
    || /连接|同步|成功/.test(message)

  if (!hasKnownConnection) {
    return {
      tone: 'warning',
      icon: 'unknown',
      title: '代理状态未知',
      detail: message || '服务已返回状态，但没有可用的连接或额度信息。',
      sourceLabel,
      quotaLabel,
      poolLabel,
    }
  }

  return {
    tone: 'success',
    icon: 'connected',
    title: '代理状态已确认',
    detail: message || '服务已返回当前代理状态。',
    sourceLabel,
    quotaLabel,
    poolLabel,
  }
}

export function buildFixedProxyStatusView(
  phase: FixedProxyTestPhase,
  message = '',
): ProxyStatusView {
  const labels = {
    sourceLabel: '固定代理',
    quotaLabel: '不适用（固定代理）',
    poolLabel: '不适用（固定代理）',
  }
  switch (phase) {
    case 'loading':
      return { ...labels, tone: 'warning', icon: 'loading', title: '正在测试固定代理', detail: 'Wails 服务正在通过该地址访问测试目标。' }
    case 'success':
      return { ...labels, tone: 'success', icon: 'connected', title: '固定代理连接通过', detail: message || '服务已确认固定代理可以访问测试目标。' }
    case 'failure':
      return { ...labels, tone: 'danger', icon: 'error', title: '固定代理连接失败', detail: message || '服务未能通过固定代理访问测试目标。' }
    case 'missing':
      return { ...labels, tone: 'danger', icon: 'error', title: '需要固定代理地址', detail: '请先填写固定代理地址。' }
    case 'invalid':
      return { ...labels, tone: 'danger', icon: 'error', title: '固定代理地址无效', detail: '地址必须是 HTTP 或 HTTPS 代理地址，可填写 host:port。' }
    default:
      return { ...labels, tone: 'warning', icon: 'unknown', title: '固定代理尚未测试', detail: '请测试连接，确认该地址可以访问问卷。' }
  }
}

export function formatProxyQuota(status: ProxyStatus | null | undefined): string {
  if (!status?.quotaKnown) return '未知'
  const remaining = status.remainingQuota.trim()
  const total = status.totalQuota.trim()
  if (remaining && total) return `剩余 ${remaining} / ${total}`
  if (remaining) return `剩余 ${remaining}`
  if (total) return `总额 ${total}`
  return '未知（服务未返回数值）'
}

export function formatProxyPool(status: ProxyStatus | null | undefined): string {
  if (!status) return '未知'
  if (status.poolRemainingKnown) return `${status.poolRemainingIp} 个可用 IP`
  if (status.available > 0 || status.inUse > 0) {
    return `${status.available} 个可用 / ${status.inUse} 个使用中`
  }
  return '未知'
}

export function buildCustomProxyTestView(
  phase: CustomProxyTestPhase,
  message = '',
  proxyCount = 0,
): CustomProxyTestView {
  const detail = message.trim()
  switch (phase) {
    case 'missing':
      return {
        visible: true,
        tone: 'warning',
        icon: 'unknown',
        title: '需要代理 API 地址',
        detail: '请先填写代理 API 地址，再测试连接。',
      }
    case 'loading':
      return {
        visible: true,
        tone: 'warning',
        icon: 'loading',
        title: '正在测试代理 API',
        detail: 'Wails 服务正在请求该地址，请稍候。',
      }
    case 'success':
      return {
        visible: true,
        tone: 'success',
        icon: 'connected',
        title: '代理 API 连接测试通过',
        detail: `${detail || '服务返回连接成功'}${proxyCount > 0 ? `，返回 ${proxyCount} 个代理地址。` : ''}`,
      }
    case 'failure':
      return {
        visible: true,
        tone: 'danger',
        icon: 'error',
        title: '代理 API 连接测试失败',
        detail: detail || '服务返回失败，但没有提供原因。',
      }
    default:
      return {
        visible: false,
        tone: 'warning',
        icon: 'unknown',
        title: '',
        detail: '',
      }
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return '服务未返回具体错误原因。'
}

function isProxyUnavailableMessage(message: string): boolean {
  return /失败|错误|不可用|已用完|为空|未启用|失效/.test(message)
}
