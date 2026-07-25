import { describe, expect, it } from 'vitest'
import { createTestConfig } from '../test/configFactory'
import {
  createEmptyConfigDocument,
  normalizeConfigDocument,
  updateConfigDocumentField,
  updateSurveyURL,
} from './configDocument'

describe('configDocument', () => {
  it('normalizes invalid execution and network values', () => {
    const config = createEmptyConfigDocument('https://www.wjx.cn/vm/demo.aspx')
    config.execution.target = -1
    config.execution.threads = 0
    config.reverseFill.threads = 0
    config.network.proxySource = 'unknown'

    const normalized = normalizeConfigDocument(config)

    expect(normalized.survey.provider).toBe('wjx')
    expect(normalized.execution.target).toBe(1)
    expect(normalized.execution.threads).toBe(1)
    expect(normalized.reverseFill.threads).toBe(1)
    expect(normalized.network.proxySource).toBe('default')
  })

  it('updates editable fields without mixing settings or credentials into the document', () => {
    let config = createTestConfig()
    config = updateConfigDocumentField(config, 'target', '12')
    config = updateConfigDocumentField(config, 'threads', '4')
    config = updateConfigDocumentField(config, 'random-ip', true)
    config = updateConfigDocumentField(config, 'proxy-source', '自定义')
    config = updateConfigDocumentField(config, 'proxy-area-code', '110100')
    config = updateConfigDocumentField(config, 'custom-proxy-api', 'https://proxy.example/api')
    config = updateConfigDocumentField(config, 'random-ua', true)
    config = updateConfigDocumentField(config, 'random-ua-wechat', '60')
    config = updateConfigDocumentField(config, 'interval', '2-5')
    config = updateConfigDocumentField(config, 'answer-duration', '45-90')
    config = updateConfigDocumentField(config, 'reliability-mode', false)
    config = updateConfigDocumentField(config, 'psycho-target-alpha', '0.9')
    config = updateConfigDocumentField(config, 'answer-datetime-window', '2024-03-10 09:00:00 | 2024-03-10 10:00:00')

    expect(config.execution).toMatchObject({
      target: 12,
      threads: 4,
      submitInterval: [2, 5],
      answerDuration: [45, 90],
      answerDatetimeWindow: ['2024-03-10 09:00:00', '2024-03-10 10:00:00'],
    })
    expect(config.network).toMatchObject({
      randomProxyEnabled: true,
      proxySource: 'custom',
      proxyAreaCode: '110100',
      customProxyApi: 'https://proxy.example/api',
      randomUaEnabled: true,
      randomUaRatios: { wechat: 60, mobile: 6, pc: 34 },
    })
    expect(config.psychometrics).toEqual({ enabled: false, targetAlpha: 0.9 })
    expect(JSON.stringify(config)).not.toMatch(/apiKey|hasAPIKey|themeMode/)

    config = updateConfigDocumentField(config, 'proxy-area-code', 'bad')
    expect(config.network.proxyAreaCode).toBeUndefined()
  })

  it('invalidates parser-owned state when the URL changes', () => {
    const config = createTestConfig((value) => {
      value.survey.url = 'https://www.wjx.cn/vm/old.aspx'
      value.survey.title = '旧问卷'
      value.survey.definition.title = '旧问卷'
      value.answers.dimensions = ['服务']
    })

    const next = updateSurveyURL(config, 'https://wj.qq.com/s/new')

    expect(next.survey.provider).toBe('qq')
    expect(next.survey.title).toBe('')
    expect(next.survey.definition.questions).toEqual([])
    expect(next.answers).toEqual({ rules: [], dimensions: [], questions: [] })
  })
})
