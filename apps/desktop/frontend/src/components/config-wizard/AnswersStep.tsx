import { FileSpreadsheet, FolderOpen, ListChecks } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { Button, InputText, RangeSliderBar, SelectNative, Switch } from '../ui'
import { cloneWizardDraft, normalizePair, type WizardDraft } from './configWizardModel'
import { formatWizardSeconds } from './wizardHelpers'
import AnswerStrategySection from './AnswerStrategySection'

interface AnswersStepProps {
  draft: WizardDraft
  busy: boolean
  onChange: (draft: WizardDraft) => void
  onChooseReverseFill?: () => Promise<string | null>
}

const aiModes = [
  { label: '限时免费', value: 'free' },
  { label: '自定义服务', value: 'provider' },
]

const aiProviders = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'OpenAI 兼容', value: 'custom' },
]

function AnswersStep({ draft, busy, onChange, onChooseReverseFill }: AnswersStepProps) {
  const config = draft.config
  const duration = normalizePair(config.execution.answerDuration, [60, 120])
  const aiMode = draft.aiProfile.mode === 'provider' ? 'provider' : 'free'
  const aiProvider = draft.aiProfile.provider === 'custom' ? 'custom' : 'deepseek'
  const questionCount = config.survey.definition.questions?.length || config.answers.questions?.length || 0

  function updateExecution(values: Partial<typeof config.execution>) {
    const next = cloneWizardDraft(draft)
    next.config.execution = { ...next.config.execution, ...values }
    onChange(next)
  }

  function updateReverseFill(values: Partial<typeof config.reverseFill>) {
    const next = cloneWizardDraft(draft)
    next.config.reverseFill = { ...next.config.reverseFill, ...values }
    onChange(next)
  }

  function updateAIProfile(values: Partial<typeof draft.aiProfile>) {
    const next = cloneWizardDraft(draft)
    next.aiProfile = { ...next.aiProfile, ...values }
    onChange(next)
  }

  function updateCredential(value: string) {
    const next = cloneWizardDraft(draft)
    next.credential = { value, operation: value.trim() ? 'replace' : 'clear' }
    onChange(next)
  }

  async function chooseReverseFill() {
    const path = await onChooseReverseFill?.()
    if (path) updateReverseFill({ enabled: true, sourcePath: path })
  }

  return (
    <section className="config-wizard-step config-wizard-answers-step" aria-labelledby="config-wizard-answers-title">
      <div className="config-wizard-step-heading">
        <h2 id="config-wizard-answers-title">设置作答方式</h2>
        <p>控制整份问卷的作答时长和填空题答案来源。</p>
      </div>

      <div className="config-wizard-form-grid">
        <div className="config-wizard-ready-card" role="status">
          <ListChecks size={19} strokeWidth={1.9} aria-hidden="true" />
          <div>
            <strong>已生成 {questionCount} 道题的初始策略</strong>
            <span>需要时可以在本步骤逐题调整。</span>
          </div>
        </div>

        <AnswerStrategySection draft={draft} busy={busy} onChange={onChange} />

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">作答时长</span>
            <small>每份问卷会在这个时间范围内完成。</small>
          </span>
          <div className="config-wizard-slider-field">
            <RangeSliderBar
              aria-label="作答时长"
              disabled={busy}
              min={1}
              max={3600}
              values={duration}
              onChange={(values) => updateExecution({ answerDuration: values })}
            />
            <output aria-live="polite">{formatWizardSeconds(duration[0])}–{formatWizardSeconds(duration[1])}</output>
          </div>
        </div>

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">Excel 反填</span>
            <small>用表格中的答案生成多份提交，并按题目映射数据列。</small>
          </span>
          <Switch
            aria-label="Excel 反填"
            checked={config.reverseFill.enabled}
            disabled={busy}
            label
            labelOn="开"
            labelOff="关"
            onChange={(checked) => updateReverseFill({ enabled: checked })}
          />
        </div>

        {config.reverseFill.enabled ? (
          <div className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">反填数据文件</span>
              <small>{config.reverseFill.sourcePath || '选择包含答案数据的 Excel 文件。'}</small>
            </span>
            <Button
              value={config.reverseFill.sourcePath ? '更换文件' : '选择 Excel'}
              type="subtle"
              icon={config.reverseFill.sourcePath ? <FileSpreadsheet size={16} strokeWidth={1.9} /> : <FolderOpen size={16} strokeWidth={1.9} />}
              disabled={busy || !onChooseReverseFill}
              onClick={() => void chooseReverseFill()}
            />
          </div>
        ) : null}

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">填空题答案</span>
            <small>AI 只处理填空题。选择题仍按题目策略填写。</small>
          </span>
          <SelectNative
            data={aiModes}
            value={aiMode}
            disabled={busy}
            onChange={(event) => updateAIProfile({ mode: event.target.value })}
          />
        </div>

        {aiMode === 'provider' ? (
          <div className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">AI 服务商</span>
              <small>配置只保存在本机。</small>
            </span>
            <SelectNative
              data={aiProviders}
              value={aiProvider}
              disabled={busy}
              onChange={(event) => updateAIProfile({ provider: event.target.value })}
            />
          </div>
        ) : null}

        {aiMode === 'provider' && aiProvider === 'custom' ? (
          <label className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">接口地址</span>
              <small>填写 OpenAI 兼容接口的基础地址。</small>
            </span>
            <InputText
              aria-label="AI 接口地址"
              disabled={busy}
              placeholder="https://..."
              value={draft.aiProfile.baseURL ?? ''}
              width="100%"
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateAIProfile({ baseURL: event.target.value })}
            />
          </label>
        ) : null}

        {aiMode === 'provider' ? (
          <label className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">API 密钥</span>
              <small>{draft.aiProfile.hasAPIKey && draft.credential.operation === 'keep' ? '凭据已保存，留空保持不变。' : '凭据保存在 Windows 凭据管理器。'}</small>
            </span>
            <InputText
              aria-label="AI API 密钥"
              autoComplete="off"
              disabled={busy}
              type="password"
              value={draft.credential.value}
              width="100%"
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateCredential(event.target.value)}
            />
          </label>
        ) : null}

        {aiMode === 'provider' ? (
          <label className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">模型</span>
              <small>留空时使用服务商默认模型。</small>
            </span>
            <InputText
              aria-label="AI 模型"
              disabled={busy}
              placeholder="默认模型"
              value={draft.aiProfile.model ?? ''}
              width="14rem"
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateAIProfile({ model: event.target.value })}
            />
          </label>
        ) : null}

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">连续失败时停止</span>
            <small>避免在配置失效后继续消耗任务次数。</small>
          </span>
          <Switch
            aria-label="连续失败时停止"
            checked={config.execution.failStop}
            disabled={busy}
            label
            labelOn="开"
            labelOff="关"
            onChange={(checked) => updateExecution({ failStop: checked })}
          />
        </div>

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">遇到验证码时暂停</span>
            <small>检测到阿里云验证码后等待人工处理。</small>
          </span>
          <Switch
            aria-label="遇到验证码时暂停"
            checked={config.execution.pauseOnAliyunCaptcha}
            disabled={busy}
            label
            labelOn="开"
            labelOff="关"
            onChange={(checked) => updateExecution({ pauseOnAliyunCaptcha: checked })}
          />
        </div>
      </div>
    </section>
  )
}

export default AnswersStep
export type { AnswersStepProps }
