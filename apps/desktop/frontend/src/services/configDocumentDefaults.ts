import type { ConfigDocument, NetworkSettings } from '../types'

export const defaultRandomUARatios: NonNullable<NetworkSettings['randomUaRatios']> = {
  wechat: 33,
  mobile: 33,
  pc: 34,
}

export function createEmptyConfigDocument(url = ''): ConfigDocument {
  const provider = inferProvider(url)
  return {
    schemaVersion: 2,
    survey: {
      url,
      provider,
      title: '',
      definition: { provider, title: '', questions: [] },
    },
    execution: {
      target: 1,
      threads: 1,
      submitInterval: [0, 0],
      answerDuration: [60, 120],
      answerDatetimeWindow: ['', ''],
      failStop: true,
      pauseOnAliyunCaptcha: true,
    },
    network: {
      randomProxyEnabled: false,
      fixedProxyAddress: '',
      proxySource: 'default',
      customProxyApi: '',
      proxyAreaCode: undefined,
      randomUaEnabled: false,
      randomUaRatios: { ...defaultRandomUARatios },
    },
    answers: { rules: [], dimensions: [], questions: [] },
    reverseFill: { enabled: false, sourcePath: '', format: 'auto', startRow: 1, threads: 1 },
    psychometrics: { enabled: true, targetAlpha: 0.85 },
  }
}

export function inferProvider(url: string): string {
  const normalized = url.toLowerCase()
  if (normalized.includes('wj.qq.com')) return 'qq'
  if (normalized.includes('credamo')) return 'credamo'
  return 'wjx'
}
