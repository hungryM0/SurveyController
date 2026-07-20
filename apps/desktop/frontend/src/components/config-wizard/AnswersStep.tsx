import { FileSpreadsheet, FolderOpen, ListChecks } from 'lucide-react'
import type { ChangeEvent, ReactElement } from 'react'
import type { RuntimeConfig } from '../../types'
import { Button, InputText, RangeSliderBar, SelectNative, Switch } from '../ui'
import { normalizePair } from './configWizardModel'

interface AnswersStepProps {
  draft: RuntimeConfig
  busy: boolean
  onChange: (draft: RuntimeConfig) => void
  onChooseReverseFill?: () => Promise<string | null>
}

const SelectControl = SelectNative as unknown as (props: {
  data: Array<{ label: string; value: string }>
  value?: string
  disabled?: boolean
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
}) => ReactElement

const aiModes = [
  { label: '限时免费', value: 'free' },
  { label: '自定义服务', value: 'provider' },
]

const aiProviders = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'OpenAI 兼容', value: 'custom' },
]

function AnswersStep({ draft, busy, onChange, onChooseReverseFill }: AnswersStepProps) {
  const duration = normalizePair(draft.answer_duration, [60, 120])
  const aiMode = draft.ai_mode === 'provider' ? 'provider' : 'free'
  const aiProvider = draft.ai_provider === 'custom' ? 'custom' : 'deepseek'
  const questionCount = draft.questions_info?.length || draft.question_entries?.length || 0

  async function chooseReverseFill() {
    const path = await onChooseReverseFill?.()
    if (path) {
      onChange({ ...draft, reverse_fill_enabled: true, reverse_fill_source_path: path })
    }
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
            <span>完成向导后，可在“题目策略”中逐题调整。</span>
          </div>
        </div>

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
              onChange={(values) => onChange({ ...draft, answer_duration: values })}
            />
            <output aria-live="polite">{formatSeconds(duration[0])}–{formatSeconds(duration[1])}</output>
          </div>
        </div>

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">Excel 反填</span>
            <small>用表格中的答案生成多份提交，可稍后在“反填”页预览。</small>
          </span>
          <Switch
            aria-label="Excel 反填"
            checked={Boolean(draft.reverse_fill_enabled)}
            disabled={busy}
            label
            labelOn="开"
            labelOff="关"
            onChange={(checked) => onChange({ ...draft, reverse_fill_enabled: checked })}
          />
        </div>

        {draft.reverse_fill_enabled ? (
          <div className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">反填数据文件</span>
              <small>{draft.reverse_fill_source_path || '选择包含答案数据的 Excel 文件。'}</small>
            </span>
            <Button
              value={draft.reverse_fill_source_path ? '更换文件' : '选择 Excel'}
              type="subtle"
              icon={draft.reverse_fill_source_path ? <FileSpreadsheet size={16} strokeWidth={1.9} /> : <FolderOpen size={16} strokeWidth={1.9} />}
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
          <SelectControl
            data={aiModes}
            value={aiMode}
            disabled={busy}
            onChange={(event) => onChange({ ...draft, ai_mode: event.target.value })}
          />
        </div>

        {aiMode === 'provider' ? (
          <div className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">AI 服务商</span>
              <small>配置只保存在本机。</small>
            </span>
            <SelectControl
              data={aiProviders}
              value={aiProvider}
              disabled={busy}
              onChange={(event) => onChange({ ...draft, ai_provider: event.target.value })}
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
              value={draft.ai_base_url ?? ''}
              width="100%"
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...draft, ai_base_url: event.target.value })}
            />
          </label>
        ) : null}

        {aiMode === 'provider' ? (
          <label className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">API 密钥</span>
              <small>密钥只写入本地配置。</small>
            </span>
            <InputText
              aria-label="AI API 密钥"
              autoComplete="off"
              disabled={busy}
              type="password"
              value={draft.ai_api_key ?? ''}
              width="100%"
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...draft, ai_api_key: event.target.value })}
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
              value={draft.ai_model ?? ''}
              width="14rem"
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...draft, ai_model: event.target.value })}
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
            checked={draft.fail_stop_enabled ?? true}
            disabled={busy}
            label
            labelOn="开"
            labelOff="关"
            onChange={(checked) => onChange({ ...draft, fail_stop_enabled: checked })}
          />
        </div>

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">遇到验证码时暂停</span>
            <small>检测到阿里云验证码后等待人工处理。</small>
          </span>
          <Switch
            aria-label="遇到验证码时暂停"
            checked={draft.pause_on_aliyun_captcha ?? true}
            disabled={busy}
            label
            labelOn="开"
            labelOff="关"
            onChange={(checked) => onChange({ ...draft, pause_on_aliyun_captcha: checked })}
          />
        </div>
      </div>
    </section>
  )
}

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  if (!minutes) {
    return `${seconds} 秒`
  }
  if (!seconds) {
    return `${minutes} 分钟`
  }
  return `${minutes} 分 ${seconds} 秒`
}

export default AnswersStep
export type { AnswersStepProps }
