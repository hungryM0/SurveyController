import type { AICredentialDraft, AppSettings, ConfigDocument, SettingField, SettingsGroup } from '../types'
import { formatDateTimeWindow, normalizePair } from '../services/configDocument'

const proxyLabels = {
  default: '默认',
  benefit: '限时福利',
  custom: '自定义',
}

const aiModeLabels = {
  free: '限时免费',
  provider: '自定义服务商',
}

const aiProviderLabels = {
  deepseek: 'DeepSeek',
  custom: 'OpenAI 兼容',
}

const aiProtocols = ['auto', 'chat_completions', 'responses']
const defaultModels = { deepseek: 'deepseek-v4-flash', custom: '' }

const defaultPromptBase = `你现在不是AI助手，而是一名有实际使用经验但不专业的普通用户。
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

const defaultPromptProvider = `${defaultPromptBase}

多项填空补充规则：
6. 当题目有多个空位时，按空位顺序输出一个字符串，并使用 || 分隔每个答案（示例：答案1||答案2||答案3）`

export function mapRuntimeGroups(
  config: ConfigDocument,
  settings: AppSettings,
  credential: AICredentialDraft,
): SettingsGroup[] {
  const answerDuration = normalizePair(config.execution.answerDuration, [60, 120])
  const submitInterval = normalizePair(config.execution.submitInterval, [0, 0])
  const ratios = config.network.randomUaRatios ?? { wechat: 33, mobile: 33, pc: 34 }
  const profile = settings.aiProfile
  const mode = normalizeAIMode(profile.mode)
  const provider = normalizeAIProvider(profile.provider)
  const keyDescription = profile.hasAPIKey && credential.operation === 'keep'
    ? '凭据已保存。输入新值会替换现有密钥。'
    : '输入对应服务的 API 密钥，获取方法请查阅服务商 API 文档'

  return [
    {
      title: '执行参数',
      fields: [
        field('target', '目标份数', '限制本次任务的目标提交量', 'number', String(config.execution.target)),
        field('threads', '并发数', '同时处理的任务数量', 'number', String(config.execution.threads)),
        field('interval', '提交间隔（秒）', '每份提交之间的等待范围', 'range', `${submitInterval[0]} - ${submitInterval[1]}`),
        field('answer-duration', '作答时长（秒）', '控制整卷耗时分布', 'range', `${answerDuration[0]} - ${answerDuration[1]}`),
        field('answer-datetime-window', '提交时间', '设置见数的提交日期时间范围', 'datetime-window', formatDateTimeWindow(config.execution.answerDatetimeWindow)),
      ],
    },
    {
      title: '代理与身份',
      fields: [
        field('random-ip', '随机 IP', '启用后按会话申请代理', 'toggle', String(config.network.randomProxyEnabled)),
        field('proxy-source', '代理源', '默认 / 福利 / 自定义', 'select', proxyLabels[config.network.proxySource as keyof typeof proxyLabels] ?? '默认', Object.values(proxyLabels)),
        field('proxy-area-code', '代理地区代码', '6 位行政区划代码，留空不限地区', 'text', config.network.proxyAreaCode ?? ''),
        field('custom-proxy-api', '自定义代理 API', '', 'text', config.network.customProxyApi ?? ''),
        field('random-ua', '随机 UA', '拆散重复指纹', 'toggle', String(config.network.randomUaEnabled)),
        field('random-ua-wechat', '微信访问占比', '三项访问占比合计固定为 100%', 'slider', String(ratios.wechat ?? 33)),
        field('random-ua-mobile', '手机访问占比', '', 'slider', String(ratios.mobile ?? 33)),
        field('random-ua-pc', '链接访问占比', '', 'slider', String(ratios.pc ?? 34)),
        field('fail-stop', '失败停止', '失败过多时停止任务', 'toggle', String(config.execution.failStop)),
      ],
    },
    {
      title: 'AI 设置',
      fields: [
        field('ai-mode', 'AI 模式', '目前仅可用于填空题、多项填空题的 AI 填空作答', 'select', aiModeLabels[mode], Object.values(aiModeLabels)),
        field('ai-privacy-notice', '隐私声明', '不会上传 API Key 等隐私信息，所有配置仅保存在本地。', 'notice', ''),
        field('ai-provider', 'AI 服务商', '选择 AI 服务，自定义模式支持任意 OpenAI 兼容接口', 'select', aiProviderLabels[provider], Object.values(aiProviderLabels)),
        field('ai-api-key', 'API Key', keyDescription, 'password', credential.value),
        field('ai-base-url', 'Base URL', '自定义模式下可填根地址或完整端点', 'text', profile.baseURL ?? ''),
        field('ai-api-protocol', 'AI 协议', '', 'select', profile.apiProtocol || 'auto', aiProtocols),
        field('ai-model', '模型 ID', '请查阅所选服务商 API 文档后再填写准确的模型 ID', 'text', profile.model ?? defaultModels[provider]),
        field('ai-test-connection', '测试 AI 连接', '验证 API 配置是否正确', 'action', ''),
        field('ai-system-prompt', '系统提示词', '编辑 AI 填空的系统提示词，留空使用默认提示词', 'textarea', profile.systemPrompt ?? defaultPrompt(mode)),
        field('reliability-mode', '信效度计划', '', 'toggle', String(config.psychometrics.enabled)),
        field('psycho-target-alpha', '目标 Alpha', '', 'number', String(config.psychometrics.targetAlpha)),
      ],
    },
  ]
}

export function updateAIProfileField(
  settings: AppSettings,
  fieldId: string,
  rawValue: string | boolean,
): AppSettings {
  const next = structuredClone(settings)
  const text = String(rawValue)
  const profile = next.aiProfile
  switch (fieldId) {
    case 'ai-mode': {
      const previousMode = normalizeAIMode(profile.mode)
      profile.mode = text === '自定义服务商' ? 'provider' : normalizeAIMode(text)
      if (!profile.systemPrompt || profile.systemPrompt === defaultPrompt(previousMode)) {
        profile.systemPrompt = defaultPrompt(profile.mode)
      }
      break
    }
    case 'ai-provider':
      profile.provider = text === 'OpenAI 兼容' ? 'custom' : normalizeAIProvider(text)
      if (profile.provider !== 'custom' && !profile.model) {
        profile.model = defaultModels.deepseek
      }
      break
    case 'ai-base-url':
      profile.baseURL = text
      break
    case 'ai-api-protocol':
      profile.apiProtocol = aiProtocols.includes(text) ? text : 'auto'
      break
    case 'ai-model':
      profile.model = text
      break
    case 'ai-system-prompt':
      profile.systemPrompt = text
      break
  }
  return next
}

export function isAIProfileField(fieldId: string): boolean {
  return fieldId.startsWith('ai-') && fieldId !== 'ai-api-key' && fieldId !== 'ai-test-connection'
}

function normalizeAIMode(value: string): keyof typeof aiModeLabels {
  return value === 'provider' || value === '自定义服务商' ? 'provider' : 'free'
}

function normalizeAIProvider(value: string): keyof typeof aiProviderLabels {
  return value === 'custom' || value === 'OpenAI 兼容' ? 'custom' : 'deepseek'
}

function defaultPrompt(mode: string): string {
  return normalizeAIMode(mode) === 'provider' ? defaultPromptProvider : defaultPromptBase
}

function field(
  id: string,
  label: string,
  description: string,
  kind: string,
  value: string,
  options?: string[],
): SettingField {
  return { id, label, description, kind, value, options }
}
