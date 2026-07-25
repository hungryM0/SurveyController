import type { SettingField } from '../../types'

export function proxySourceValue(value: string | undefined): string {
  if (value === '限时福利' || value === 'benefit') return 'benefit'
  if (value === '自定义' || value === 'custom') return 'custom'
  return 'default'
}

export function aiModeValue(value: string | undefined): string {
  return value === '自定义服务商' || value === 'provider' ? 'provider' : 'free'
}

export function aiProviderValue(value: string | undefined): string {
  return value === 'OpenAI 兼容' || value === 'custom' ? 'custom' : 'deepseek'
}

export function isRuntimeFieldVisible(field: SettingField, proxySource: string, aiMode: string, aiProvider: string): boolean {
  if (field.id === 'custom-proxy-api') return proxySource === 'custom'
  if (field.id === 'ai-privacy-notice') return aiMode !== 'free'
  if (field.id.startsWith('ai-') && field.id !== 'ai-mode' && field.id !== 'ai-privacy-notice') {
    if (aiMode === 'free') return field.id === 'ai-test-connection' || field.id === 'ai-system-prompt'
    if (field.id === 'ai-base-url' || field.id === 'ai-api-protocol') return aiProvider === 'custom'
  }
  return true
}
