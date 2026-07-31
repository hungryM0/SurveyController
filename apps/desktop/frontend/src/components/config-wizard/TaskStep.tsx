import type { ChangeEvent } from 'react'
import DateTimeWindowField from '../DateTimeWindowField'
import { InputText, RangeSliderBar, SliderBar } from '../ui'
import { parseDateTimeWindowPair } from '../../services/configDocumentValues'
import { cloneWizardDraft, normalizePair, type WizardDraft } from './configWizardModel'
import { getTaskValidationErrors } from './wizardValidation'

interface TaskStepProps {
  draft: WizardDraft
  busy: boolean
  onChange: (draft: WizardDraft) => void
}

function TaskStep({ draft, busy, onChange }: TaskStepProps) {
  const execution = draft.config.execution
  const errors = getTaskValidationErrors(draft.config)
  const target = Number.isFinite(execution.target) ? execution.target : ''
  const threads = Number.isFinite(execution.threads) ? execution.threads : ''
  const displayThreads = Number.isFinite(execution.threads)
    ? Math.min(128, Math.max(1, execution.threads))
    : 1
  const submitInterval = normalizePair(execution.submitInterval, [0, 0])
  const answerDatetimeWindow = execution.answerDatetimeWindow ?? ['', '']

  function updateExecution(values: Partial<typeof execution>) {
    const next = cloneWizardDraft(draft)
    next.config.execution = { ...next.config.execution, ...values }
    onChange(next)
  }

  return (
    <section className="config-wizard-step config-wizard-task-step" aria-labelledby="config-wizard-task-title">
      <div className="config-wizard-step-heading">
        <h2 id="config-wizard-task-title">设置本次任务</h2>
        <p>先定提交数量和并发，后续步骤仍可返回调整。</p>
      </div>

      <div className="config-wizard-form-grid">
        <label className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">目标份数</span>
            <small>任务达到这个数量后停止。</small>
          </span>
          <InputText
            aria-label="目标份数"
            disabled={busy}
            min={1}
            max={999999}
            type="number"
            value={target}
            width="9rem"
            aria-describedby={errors.target ? 'config-wizard-task-target-error' : undefined}
            aria-invalid={Boolean(errors.target)}
            onChange={(event: ChangeEvent<HTMLInputElement>) => updateExecution({
              target: parseNumberInput(event.target.value),
            })}
          />
          <FieldError id="config-wizard-task-target-error" message={errors.target} />
        </label>

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">并发数</span>
            <small>同时处理的问卷数量。网络不稳定时建议调低。</small>
          </span>
          <div className="config-wizard-slider-field">
            <SliderBar
              aria-label="并发数"
              aria-describedby={errors.threads ? 'config-wizard-task-threads-error' : undefined}
              aria-invalid={Boolean(errors.threads)}
              disabled={busy}
              min={1}
              max={128}
              value={displayThreads}
              thumbLabel="并发数"
              tooltip={`${execution.threads} 路并发`}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateExecution({
                threads: parseNumberInput(event.target.value),
              })}
            />
            <output aria-live="polite">{execution.threads} 路</output>
          </div>
          <FieldError id="config-wizard-task-threads-error" message={errors.threads} />
        </div>

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">提交间隔</span>
            <small>每份问卷提交前等待的时间范围。</small>
          </span>
          <div className="config-wizard-slider-field">
            <RangeSliderBar
              aria-label="提交间隔"
              aria-describedby={errors.submitInterval ? 'config-wizard-task-interval-error' : undefined}
              aria-invalid={Boolean(errors.submitInterval)}
              disabled={busy}
              min={0}
              max={1800}
              values={submitInterval}
              onChange={(values) => updateExecution({ submitInterval: values })}
            />
            <output aria-live="polite">{submitInterval[0]}–{submitInterval[1]} 秒</output>
          </div>
          <FieldError id="config-wizard-task-interval-error" message={errors.submitInterval} />
        </div>

        <div className="config-wizard-field config-wizard-task-time-window">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">时间窗口</span>
            <small>限制任务允许提交的日期和时间，留空表示不限制。</small>
          </span>
          <DateTimeWindowField
            disabled={busy}
            start={answerDatetimeWindow[0] ?? ''}
            end={answerDatetimeWindow[1] ?? ''}
            onChange={(value) => updateExecution({ answerDatetimeWindow: parseDateTimeWindowPair(value) })}
          />
          <FieldError id="config-wizard-task-time-window-error" message={errors.answerDatetimeWindow} />
        </div>
      </div>
    </section>
  )
}

function parseNumberInput(value: string): number {
  return value.trim() === '' ? 0 : Number(value)
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <div className="config-wizard-error" id={id} role="alert">{message}</div> : null
}

export default TaskStep
export type { TaskStepProps }
