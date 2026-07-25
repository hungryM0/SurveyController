import type { AICredentialDraft, AIProfileSettings, AppSettings, ConfigDocument } from '../../types'
import {
  cloneConfigDocument,
  createEmptyConfigDocument,
  isParsedDocument,
  mergeParsedDocument,
  normalizeConfigDocument,
  normalizePair,
  updateSurveyURL,
} from '../../services/configDocument'

export type WizardStepId = 'survey' | 'task' | 'network' | 'answers' | 'review'

export interface WizardStepDefinition {
  id: WizardStepId
  title: string
  description: string
}

export interface WizardDraft {
  config: ConfigDocument
  aiProfile: AIProfileSettings
  credential: AICredentialDraft
}

export const WIZARD_STEPS: readonly WizardStepDefinition[] = [
  { id: 'survey', title: '添加问卷', description: '输入链接并解析问卷结构' },
  { id: 'task', title: '任务设置', description: '设置提交数量和并发方式' },
  { id: 'network', title: '网络设置', description: '选择代理和访问身份' },
  { id: 'answers', title: '答案设置', description: '设置作答时长和答案辅助' },
  { id: 'review', title: '检查并完成', description: '确认配置后保存' },
]

export function cloneWizardDraft(draft: WizardDraft): WizardDraft {
  return structuredClone(draft)
}

export function createWizardDraft(
  config: ConfigDocument | null | undefined,
  settings?: AppSettings | null,
  credential: AICredentialDraft = { value: '', operation: 'keep' },
): WizardDraft {
  return {
    config: normalizeConfigDocument(config ?? createEmptyConfigDocument()),
    aiProfile: structuredClone(settings?.aiProfile ?? defaultAIProfile()),
    credential: { ...credential },
  }
}

export function mergeParsedConfig(
  current: WizardDraft,
  parsed: ConfigDocument,
  url = parsed.survey.url,
): WizardDraft {
  return {
    ...cloneWizardDraft(current),
    config: mergeParsedDocument(current.config, parsed, url),
  }
}

export function updateWizardURL(current: WizardDraft, value: string): WizardDraft {
  return {
    ...cloneWizardDraft(current),
    config: updateSurveyURL(current.config, value),
  }
}

export function isParsedConfig(draft: WizardDraft | null | undefined): boolean {
  return isParsedDocument(draft?.config)
}

export function updateWizardConfig(draft: WizardDraft, config: ConfigDocument): WizardDraft {
  return { ...cloneWizardDraft(draft), config: cloneConfigDocument(config) }
}

export { normalizePair }

export function formatPair(value: number[] | undefined, fallback: [number, number]): string {
  const [start, end] = normalizePair(value, fallback)
  return `${start}-${end}`
}

export function clampInt(value: string | number | undefined, min: number, max: number, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function defaultAIProfile(): AIProfileSettings {
  return {
    mode: 'free',
    provider: 'deepseek',
    baseURL: '',
    apiProtocol: 'auto',
    model: '',
    systemPrompt: '',
    hasAPIKey: false,
  }
}
