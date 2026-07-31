import { ArrowLeft, ArrowRight, Save, Search } from 'lucide-react'
import { Button } from '../ui'
import AnswersStep from './AnswersStep'
import NetworkStep from './NetworkStep'
import ReviewStep from './ReviewStep'
import SurveyStep from './SurveyStep'
import TaskStep from './TaskStep'
import { WIZARD_STEPS, type WizardDraft, type WizardStepId } from './configWizardModel'
import WizardProgress from './WizardProgress'

interface WizardFrameProps {
  draft: WizardDraft
  step: WizardStepId
  parsed: boolean
  highestStepIndex: number
  busy: boolean
  error: string
  statusMessage: string
  confirmDismiss: boolean
  onURLChange: (value: string) => void
  onDecodeQRCode: () => void
  onImport: () => void
  onChooseReverseFill?: () => Promise<string | null>
  onChange: (draft: WizardDraft) => void
  onStepSelect: (step: WizardStepId) => void
  onBack: () => void
  onPrimary: () => void
  onRequestDismiss: () => void
  onDismiss: () => void
  onContinueEditing: () => void
}

function WizardFrame({
  draft,
  step,
  parsed,
  highestStepIndex,
  busy,
  error,
  statusMessage,
  confirmDismiss,
  onURLChange,
  onDecodeQRCode,
  onImport,
  onChooseReverseFill,
  onChange,
  onStepSelect,
  onBack,
  onPrimary,
  onRequestDismiss,
  onDismiss,
  onContinueEditing,
}: WizardFrameProps) {
  const stepIndex = indexOfStep(step)
  const interactionLocked = busy || confirmDismiss

  return (
    <section className="config-wizard-workspace surface" aria-labelledby="config-wizard-title" aria-describedby="config-wizard-description">
        <header className="config-wizard-header">
          <div>
            <h1 className="config-wizard-title" id="config-wizard-title">配置任务</h1>
            <p className="config-wizard-description" id="config-wizard-description">
              按步骤完成设置，保存后即可启动任务。
            </p>
          </div>
          <span className="config-wizard-step-count" aria-live="polite">
            {stepIndex + 1} / {WIZARD_STEPS.length}
          </span>
        </header>

        <div className="config-wizard-layout">
          <WizardProgress
            currentStep={step}
            highestStepIndex={highestStepIndex}
            disabled={interactionLocked}
            onStepSelect={onStepSelect}
          />

          <main className="config-wizard-main">
            {step === 'survey' ? (
              <SurveyStep
                draft={draft}
                parsed={parsed}
                busy={interactionLocked}
                statusMessage={statusMessage}
                onURLChange={onURLChange}
                onDecodeQRCode={onDecodeQRCode}
                onImport={onImport}
              />
            ) : null}
            {step === 'task' ? <TaskStep draft={draft} busy={interactionLocked} onChange={onChange} /> : null}
            {step === 'network' ? <NetworkStep draft={draft} busy={interactionLocked} onChange={onChange} /> : null}
            {step === 'answers' ? (
              <AnswersStep
                draft={draft}
                busy={interactionLocked}
                onChange={onChange}
                onChooseReverseFill={onChooseReverseFill}
              />
            ) : null}
            {step === 'review' ? <ReviewStep draft={draft} /> : null}

            {error ? <div className="config-wizard-error" role="alert">{error}</div> : null}
          </main>
        </div>

        <footer className="config-wizard-footer">
          {confirmDismiss ? (
            <div className="config-wizard-discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="config-wizard-discard-title">
              <div>
                <strong id="config-wizard-discard-title">放弃未保存的修改？</strong>
                <span>当前设置不会写入配置文件。</span>
              </div>
              <div className="config-wizard-discard-actions">
                <Button value="继续编辑" type="subtle" onClick={onContinueEditing} />
                <Button value="放弃并退出" type="danger" onClick={onDismiss} />
              </div>
            </div>
          ) : null}
          <div className="config-wizard-footer-main">
            <Button value="稍后设置" type="subtle" disabled={interactionLocked} onClick={onRequestDismiss} />
            <div className="config-wizard-footer-actions">
              <Button
                value="返回"
                type="subtle"
                icon={<ArrowLeft size={16} strokeWidth={1.9} />}
                disabled={interactionLocked || stepIndex === 0}
                onClick={onBack}
              />
              <Button
                value={primaryLabel(step, busy, parsed)}
                type="primary"
                icon={primaryIcon(step)}
                isLoading={busy}
                disabled={busy || confirmDismiss}
                onClick={onPrimary}
              />
            </div>
          </div>
        </footer>
    </section>
  )
}

function indexOfStep(step: WizardStepId): number {
  const index = WIZARD_STEPS.findIndex((item) => item.id === step)
  return index < 0 ? 0 : index
}

function primaryLabel(step: WizardStepId, busy: boolean, parsed: boolean): string {
  if (step === 'survey') {
    if (parsed) {
      return '继续'
    }
    return busy ? '正在解析' : '解析并继续'
  }
  if (step === 'review') {
    return busy ? '正在保存' : '保存并完成'
  }
  return '继续'
}

function primaryIcon(step: WizardStepId) {
  if (step === 'survey') {
    return <Search size={16} strokeWidth={1.9} />
  }
  if (step === 'review') {
    return <Save size={16} strokeWidth={1.9} />
  }
  return <ArrowRight size={16} strokeWidth={1.9} />
}

export default WizardFrame
export type { WizardFrameProps }
