import { CheckCircle2, QrCode, Upload } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { Button, InputText } from '../ui'
import type { WizardDraft } from './configWizardModel'

interface SurveyStepProps {
  draft: WizardDraft
  parsed: boolean
  busy: boolean
  statusMessage?: string
  onURLChange: (value: string) => void
  onDecodeQRCode: () => void
  onImport: () => void
}

function SurveyStep({
  draft,
  parsed,
  busy,
  statusMessage,
  onURLChange,
  onDecodeQRCode,
  onImport,
}: SurveyStepProps) {
  const config = draft.config
  const questionCount = config.survey.definition.questions?.length || config.answers.questions?.length || 0

  return (
    <section className="config-wizard-step config-wizard-survey-step" aria-labelledby="config-wizard-survey-title">
      <div className="config-wizard-step-heading">
        <h2 id="config-wizard-survey-title">添加要填写的问卷</h2>
        <p>粘贴问卷链接，程序会读取题目和可用选项。</p>
      </div>

      <label className="config-wizard-field config-wizard-url-field">
        <span className="config-wizard-field-label">问卷链接</span>
        <InputText
          aria-label="问卷链接"
          autoFocus
          clearButton
          disabled={busy}
          placeholder="https://..."
          setStatus={parsed ? 'success' : 'default'}
          value={config.survey.url}
          width="100%"
          onChange={(event: ChangeEvent<HTMLInputElement>) => onURLChange(event.target.value)}
          onClearButtonClick={() => onURLChange('')}
        />
      </label>

      <div className="config-wizard-inline-actions">
        <Button
          type="subtle"
          icon={<QrCode size={16} strokeWidth={1.9} />}
          value="识别二维码"
          disabled={busy}
          onClick={onDecodeQRCode}
        />
        <Button
          type="subtle"
          icon={<Upload size={16} strokeWidth={1.9} />}
          value="导入已有配置"
          disabled={busy}
          onClick={onImport}
        />
      </div>

      {parsed ? (
        <div className="config-wizard-parse-result is-success" role="status">
          <CheckCircle2 size={18} strokeWidth={1.9} aria-hidden="true" />
          <div>
            <strong>{config.survey.title.trim() || '问卷已解析'}</strong>
            <span>{questionCount} 道题，可以继续设置任务。</span>
          </div>
        </div>
      ) : statusMessage ? (
        <p className="config-wizard-status" role="status">{statusMessage}</p>
      ) : (
        <p className="config-wizard-hint">也可以识别图片中的二维码，或导入以前保存的配置。</p>
      )}
    </section>
  )
}

export default SurveyStep
export type { SurveyStepProps }
