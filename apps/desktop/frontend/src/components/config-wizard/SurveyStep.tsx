import { CheckCircle2, QrCode, Search, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react'
import { Button, InputText } from '../ui'
import type { WizardDraft } from './configWizardModel'
import { hasPotentialQRImage, supportedQRImageFromTransfer } from './qrImage'

interface SurveyStepProps {
  draft: WizardDraft
  parsed: boolean
  busy: boolean
  statusMessage?: string
  primaryLabel: string
  onURLChange: (value: string) => void
  onDecodeQRCode: () => void
  onDecodeQRCodeImage?: (file: File) => void
  onImport: () => void
  onPrimary: () => void
}

function SurveyStep({
  draft,
  parsed,
  busy,
  statusMessage,
  primaryLabel,
  onURLChange,
  onDecodeQRCode,
  onDecodeQRCodeImage,
  onImport,
  onPrimary,
}: SurveyStepProps) {
  const [qrDropActive, setQRDropActive] = useState(false)
  const qrDragDepth = useRef(0)
  const config = draft.config
  const questionCount = config.survey.definition.questions?.length || config.answers.questions?.length || 0

  function decodeTransferredImage(file: File | null, event: { preventDefault: () => void }) {
    if (!file || busy || !onDecodeQRCodeImage) return
    event.preventDefault()
    onDecodeQRCodeImage(file)
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    decodeTransferredImage(supportedQRImageFromTransfer(event.clipboardData), event)
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (busy || !onDecodeQRCodeImage || !hasPotentialQRImage(event.dataTransfer)) return
    event.preventDefault()
    qrDragDepth.current += 1
    setQRDropActive(true)
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (busy || !onDecodeQRCodeImage || !hasPotentialQRImage(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave() {
    qrDragDepth.current = Math.max(0, qrDragDepth.current - 1)
    if (qrDragDepth.current === 0) setQRDropActive(false)
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    const file = supportedQRImageFromTransfer(event.dataTransfer)
    qrDragDepth.current = 0
    setQRDropActive(false)
    decodeTransferredImage(file, event)
  }

  return (
    <section
      className={`config-wizard-step config-wizard-survey-step ${qrDropActive ? 'qr-drop-active' : ''}`}
      aria-labelledby="config-wizard-survey-title"
      onPaste={handlePaste}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="config-wizard-step-heading config-wizard-survey-heading">
        <h2 id="config-wizard-survey-title">添加要填写的问卷</h2>
        <Button
          type="subtle"
          icon={<Upload size={16} strokeWidth={1.9} />}
          value="导入已有配置"
          disabled={busy}
          onClick={onImport}
        />
      </div>

      <div className="config-wizard-inline-actions">
        <Button
          type="subtle"
          icon={<QrCode size={16} strokeWidth={1.9} />}
          value="识别二维码"
          disabled={busy}
          onClick={onDecodeQRCode}
        />
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

      <div className="config-wizard-survey-actions">
        <Button
          type="primary"
          icon={<Search size={16} strokeWidth={1.9} />}
          value={primaryLabel}
          isLoading={busy}
          disabled={busy}
          onClick={onPrimary}
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
      ) : null}
    </section>
  )
}

export default SurveyStep
export type { SurveyStepProps }
