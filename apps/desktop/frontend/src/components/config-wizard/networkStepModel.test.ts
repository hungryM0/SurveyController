import { describe, expect, it } from 'vitest'
import type { ProxyStatus } from '../../types'
import {
  buildCustomProxyTestView,
  buildFixedProxyStatusView,
  buildProxyStatusView,
  errorMessage,
  formatProxyPool,
  formatProxyQuota,
  normalizeProxySource,
  networkMode,
  proxySourceLabel,
} from './networkStepModel'

const emptyStatus: ProxyStatus = {
  available: 0,
  inUse: 0,
  userId: 0,
  userKnown: false,
  poolRemainingIp: 0,
  poolRemainingKnown: false,
  remainingQuota: '',
  totalQuota: '',
  quotaKnown: false,
  randomIpEnabled: true,
  source: 'default',
  message: '',
  quota: {
    RemainingQuota: 0,
    TotalQuota: 0,
    UsedQuota: 0,
    QuotaKnown: false,
  },
}

describe('networkStepModel', () => {
  it('normalizes the supported proxy source values', () => {
    expect(normalizeProxySource('福利')).toBe('benefit')
    expect(normalizeProxySource('自定义')).toBe('custom')
    expect(normalizeProxySource('unexpected')).toBe('default')
    expect(proxySourceLabel('custom')).toBe('自定义代理 API')
  })

  it('keeps explicit direct mode ahead of a stale fixed address', () => {
    expect(networkMode({ proxyMode: 'direct', randomProxyEnabled: false, fixedProxyAddress: 'ftp://stale' })).toBe('direct')
    expect(networkMode({ randomProxyEnabled: false, fixedProxyAddress: '127.0.0.1:8080' })).toBe('fixed')
  })

  it('keeps direct mode explicit and does not invent proxy quota', () => {
    const view = buildProxyStatusView({ randomIPEnabled: false, source: 'default' })

    expect(view.icon).toBe('direct')
    expect(view.title).toBe('直连')
    expect(view.quotaLabel).toBe('不适用（直连）')
    expect(view.poolLabel).toBe('不适用（直连）')
  })

  it('reports an unknown state until the service returns usable status data', () => {
    const view = buildProxyStatusView({ randomIPEnabled: true, source: 'default', status: emptyStatus })

    expect(view.tone).toBe('warning')
    expect(view.icon).toBe('unknown')
    expect(view.quotaLabel).toBe('未知')
    expect(view.poolLabel).toBe('未知')
  })

  it('formats real quota and pool values returned by the service', () => {
    const status: ProxyStatus = {
      ...emptyStatus,
      available: 2,
      inUse: 1,
      poolRemainingIp: 17,
      poolRemainingKnown: true,
      remainingQuota: '12',
      totalQuota: '20',
      quotaKnown: true,
      message: '官方代理额度已同步',
    }
    const view = buildProxyStatusView({ randomIPEnabled: true, source: 'default', status })

    expect(view.tone).toBe('success')
    expect(view.icon).toBe('connected')
    expect(view.quotaLabel).toBe('剩余 12 / 20')
    expect(view.poolLabel).toBe('17 个可用 IP')
    expect(formatProxyQuota(status)).toBe('剩余 12 / 20')
    expect(formatProxyPool(status)).toBe('17 个可用 IP')
  })

  it('preserves service failures as an error state', () => {
    const view = buildProxyStatusView({
      randomIPEnabled: true,
      source: 'default',
      status: { ...emptyStatus, message: '官方代理额度已用完' },
    })

    expect(view.tone).toBe('danger')
    expect(view.icon).toBe('error')
    expect(view.detail).toContain('额度已用完')
  })

  it('distinguishes missing, loading, successful, and failed custom API tests', () => {
    expect(buildCustomProxyTestView('missing').detail).toContain('先填写')
    expect(buildCustomProxyTestView('loading').icon).toBe('loading')
    expect(buildCustomProxyTestView('success', '检测通过', 1).detail).toContain('返回 1 个')
    expect(buildCustomProxyTestView('failure', '请求失败').tone).toBe('danger')
  })

  it('does not report a fixed proxy as connected before the service test', () => {
    const view = buildFixedProxyStatusView('idle')
    expect(view.tone).toBe('warning')
    expect(view.title).toBe('固定代理尚未测试')
    expect(buildFixedProxyStatusView('success', '检测通过').icon).toBe('connected')
    expect(buildFixedProxyStatusView('invalid').title).toBe('固定代理地址无效')
  })

  it('keeps unknown service errors visible to the user', () => {
    expect(errorMessage(new Error('网络不可用'))).toBe('网络不可用')
    expect(errorMessage(null)).toBe('服务未返回具体错误原因。')
  })
})
