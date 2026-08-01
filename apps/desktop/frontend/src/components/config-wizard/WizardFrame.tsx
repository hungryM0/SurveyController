import { ArrowLeft, ArrowRight, Circle, Pause, PlayCircle, RotateCcw, Save, Square } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '../ui'
import AnswersStep from './AnswersStep'
import NetworkStep from './NetworkStep'
import ReviewStep from './ReviewStep'
import SurveyStep from './SurveyStep'
import TaskStep from './TaskStep'
import RunStep from './RunStep'
import { WIZARD_STEPS, type WizardDraft, type WizardStepId } from './configWizardModel'
import WizardProgress from './WizardProgress'
import type { WizardCheckState } from './wizardTypes'
import type { ProxyStatus, RunResult, RunTaskState } from '../../types'

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
  onDismiss: () => void
  onContinueEditing: () => void
  checkState?: WizardCheckState | null
  onReturnToStep?: (step: WizardStepId) => void
  onProxyStatusChange?: (status: ProxyStatus | null) => void
  runTaskState?: RunTaskState | null
  runLogs?: string[]
  runError?: string
  runResult?: RunResult | null
  onStartRun?: () => void
  onPauseRun?: () => void
  onResumeRun?: () => void
  onStopRun?: () => void
  onExportResult?: () => void
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
  onDismiss,
  onContinueEditing,
  checkState,
  onReturnToStep,
  onProxyStatusChange,
  runTaskState,
  runLogs,
  runError,
  runResult,
  onStartRun,
  onPauseRun,
  onResumeRun,
  onStopRun,
  onExportResult,
}: WizardFrameProps) {
  const discardDialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const stepIndex = indexOfStep(step)
  const interactionLocked = busy || confirmDismiss
  const runStatus = runTaskState?.status ?? 'idle'
  const runLifecycleLocked = step === 'run' && isRunInProgress(runStatus)
  const runStartUnavailable = step === 'run' && !onStartRun

  useEffect(() => {
    if (!confirmDismiss) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = discardDialogRef.current
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])
    focusable()[0]?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onContinueEditing()
        return
      }
      if (event.key !== 'Tab') return
      const controls = focusable()
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [confirmDismiss, onContinueEditing])

  return (
    <section className={`config-wizard-workspace surface ${step === 'survey' ? 'is-survey' : ''}`} aria-label="配置任务">
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
                primaryLabel={primaryLabel(step, busy, parsed, Boolean(onStartRun), runStatus)}
                onURLChange={onURLChange}
                onDecodeQRCode={onDecodeQRCode}
                onImport={onImport}
                onPrimary={onPrimary}
              />
            ) : null}
            {step === 'task' ? <TaskStep draft={draft} busy={interactionLocked} onChange={onChange} /> : null}
            {step === 'network' ? <NetworkStep draft={draft} busy={interactionLocked} onChange={onChange} onProxyStatusChange={onProxyStatusChange} /> : null}
            {step === 'answers' ? (
              <AnswersStep
                draft={draft}
                busy={interactionLocked}
                onChange={onChange}
                onChooseReverseFill={onChooseReverseFill}
              />
            ) : null}
            {step === 'review' ? <ReviewStep draft={draft} checkState={checkState} onReturnToStep={onReturnToStep} /> : null}
            {step === 'run' ? (
              <RunStep
                runTaskState={runTaskState}
                logs={runLogs}
                error={runError}
                result={runResult}
                busy={busy}
                onStart={onStartRun}
                onPause={onPauseRun}
                onResume={onResumeRun}
                onStop={onStopRun}
                onExportResult={onExportResult}
              />
            ) : null}

            {error ? <div className="config-wizard-error" role="alert">{error}</div> : null}
          </main>
        </div>

        {step !== 'survey' || confirmDismiss ? (
          <footer className="config-wizard-footer">
          {confirmDismiss ? (
            <div ref={discardDialogRef} className="config-wizard-discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="config-wizard-discard-title">
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
            <div className="config-wizard-footer-actions">
              <Button
                value="返回"
                type="subtle"
                icon={<ArrowLeft size={16} strokeWidth={1.9} />}
                disabled={interactionLocked || stepIndex === 0}
                onClick={onBack}
              />
              <Button
                value={primaryLabel(step, busy, parsed, Boolean(onStartRun), runStatus)}
                type="primary"
                icon={primaryIcon(step, runStatus)}
                isLoading={busy}
                disabled={interactionLocked || runLifecycleLocked || runStartUnavailable}
                onClick={onPrimary}
              />
            </div>
          </div>
          </footer>
        ) : null}
    </section>
  )
}

function indexOfStep(step: WizardStepId): number {
  const index = WIZARD_STEPS.findIndex((item) => item.id === step)
  return index < 0 ? 0 : index
}

function primaryLabel(
  step: WizardStepId,
  busy: boolean,
  parsed: boolean,
  hasStartCallback: boolean,
  runStatus: RunTaskState['status'] | 'idle',
): string {
  if (step === 'survey') {
    if (parsed) {
      return '继续'
    }
    return busy ? '正在解析' : '解析并继续'
  }
  if (step === 'review') {
    return busy ? '正在保存' : hasStartCallback ? '保存并进入运行' : '保存并完成'
  }
  if (step === 'run') {
    if (busy) {
      if (runStatus === 'canceling') return '正在停止'
      if (runStatus === 'idle' || runStatus === 'succeeded' || runStatus === 'failed' || runStatus === 'stopped') {
        return '正在启动'
      }
      return '正在处理'
    }
    if (runStatus === 'running') return '运行中'
    if (runStatus === 'paused') return '已暂停'
    if (runStatus === 'canceling') return '正在停止'
    if (runStatus === 'succeeded' || runStatus === 'failed' || runStatus === 'stopped') return '重新运行'
    return hasStartCallback ? '启动任务' : '等待启动'
  }
  return '继续'
}

function primaryIcon(step: WizardStepId, runStatus: RunTaskState['status'] | 'idle') {
  if (step === 'review') {
    return <Save size={16} strokeWidth={1.9} />
  }
  if (step === 'run') {
    if (runStatus === 'paused') return <Pause size={16} strokeWidth={1.9} />
    if (runStatus === 'canceling') return <Square size={16} strokeWidth={1.9} />
    if (runStatus === 'running') return <Circle size={16} strokeWidth={1.9} />
    if (runStatus === 'succeeded' || runStatus === 'failed' || runStatus === 'stopped') {
      return <RotateCcw size={16} strokeWidth={1.9} />
    }
  }
  return <ArrowRight size={16} strokeWidth={1.9} />
}

function isRunInProgress(status: RunTaskState['status'] | 'idle'): boolean {
  return status === 'running' || status === 'paused' || status === 'canceling'
}

export default WizardFrame
export type { WizardFrameProps }
