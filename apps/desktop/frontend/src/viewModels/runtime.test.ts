import { describe, expect, it } from 'vitest'
import { createTestConfig, createTestSettings } from '../test/configFactory'
import { mapRuntimeGroups, updateAIProfileField } from './runtime'

describe('runtime view model', () => {
  it('keeps AI profile updates in app settings', () => {
    let settings = createTestSettings()
    settings = updateAIProfileField(settings, 'ai-mode', '自定义服务商')
    settings = updateAIProfileField(settings, 'ai-provider', 'OpenAI 兼容')
    settings = updateAIProfileField(settings, 'ai-base-url', 'https://ai.example/v1')
    settings = updateAIProfileField(settings, 'ai-api-protocol', 'responses')
    settings = updateAIProfileField(settings, 'ai-model', 'demo-model')

    expect(settings.aiProfile).toMatchObject({
      mode: 'provider',
      provider: 'custom',
      baseURL: 'https://ai.example/v1',
      apiProtocol: 'responses',
      model: 'demo-model',
    })
  })

  it('maps credentials into UI fields without putting them in ConfigDocument', () => {
    const config = createTestConfig()
    const groups = mapRuntimeGroups(
      config,
      createTestSettings((settings) => {
        settings.aiProfile.hasAPIKey = true
      }),
      { value: '', operation: 'keep' },
    )
    const fields = groups.flatMap((group) => group.fields)

    expect(fields.find((field) => field.id === 'ai-api-key')?.description).toContain('凭据已保存')
    expect(JSON.stringify(config)).not.toMatch(/apiKey|hasAPIKey/)
  })
})
