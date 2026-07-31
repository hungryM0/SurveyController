import type { ChangeEvent } from 'react'
import { InputText, RangeSliderBar, SliderBar } from '../ui'
import { clampInt, cloneWizardDraft, normalizePair, type WizardDraft } from './configWizardModel'

interface TaskStepProps {
  draft: WizardDraft
  busy: boolean
  onChange: (draft: WizardDraft) => void
}

function TaskStep({ draft, busy, onChange }: TaskStepProps) {
  const execution = draft.config.execution
  const target = clampInt(execution.target, 1, 999999, 1)
  const threads = clampInt(execution.threads, 1, 128, 1)
  const submitInterval = normalizePair(execution.submitInterval, [0, 0])

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
            onChange={(event: ChangeEvent<HTMLInputElement>) => updateExecution({
              target: clampInt(event.target.value, 1, 999999, 1),
            })}
          />
        </label>

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">并发数</span>
            <small>同时处理的问卷数量。网络不稳定时建议调低。</small>
          </span>
          <div className="config-wizard-slider-field">
            <SliderBar
              aria-label="并发数"
              disabled={busy}
              min={1}
              max={32}
              value={Math.min(threads, 32)}
              thumbLabel="并发数"
              tooltip={`${threads} 路并发`}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateExecution({
                threads: clampInt(event.target.value, 1, 32, 1),
              })}
            />
            <output aria-live="polite">{threads} 路</output>
          </div>
        </div>

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">提交间隔</span>
            <small>每份问卷提交前等待的时间范围。</small>
          </span>
          <div className="config-wizard-slider-field">
            <RangeSliderBar
              aria-label="提交间隔"
              disabled={busy}
              min={0}
              max={1800}
              values={submitInterval}
              onChange={(values) => updateExecution({ submitInterval: values })}
            />
            <output aria-live="polite">{submitInterval[0]}–{submitInterval[1]} 秒</output>
          </div>
        </div>
      </div>
    </section>
  )
}

export default TaskStep
export type { TaskStepProps }
