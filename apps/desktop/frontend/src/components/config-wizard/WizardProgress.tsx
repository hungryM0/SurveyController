import { Check } from 'lucide-react'
import { SelectNative } from '../ui'
import { WIZARD_STEPS, type WizardStepId } from './configWizardModel'

interface WizardProgressProps {
  currentStep: WizardStepId
  highestStepIndex: number
  disabled?: boolean
  onStepSelect: (step: WizardStepId) => void
}

export function getCompactWizardSteps(currentStep: WizardStepId, highestStepIndex: number) {
  return WIZARD_STEPS.filter((step, index) => index <= highestStepIndex || step.id === currentStep)
}

function WizardProgress({ currentStep, highestStepIndex, disabled = false, onStepSelect }: WizardProgressProps) {
  const currentIndex = WIZARD_STEPS.findIndex((step) => step.id === currentStep)
  const currentDefinition = WIZARD_STEPS[currentIndex] ?? WIZARD_STEPS[0]
  const compactStepOptions = getCompactWizardSteps(currentStep, highestStepIndex).map((step) => {
    const index = WIZARD_STEPS.findIndex((item) => item.id === step.id)
    return { label: `${index + 1}. ${step.title}`, value: step.id }
  })

  return (
    <nav className="config-wizard-progress" aria-label="配置进度">
      <div className="config-wizard-progress-compact">
        <div className="config-wizard-progress-compact-header">
          <strong className="config-wizard-progress-compact-current">
            第 {currentIndex + 1} / {WIZARD_STEPS.length} 步 · {currentDefinition.title}
          </strong>
          <label className="config-wizard-progress-compact-menu">
            <span>跳转</span>
            <SelectNative
              data={compactStepOptions}
              value={currentStep}
              disabled={disabled}
              onChange={(event) => {
                const nextStep = WIZARD_STEPS.find((step) => step.id === event.target.value)
                const nextIndex = nextStep ? WIZARD_STEPS.findIndex((step) => step.id === nextStep.id) : -1
                if (!disabled && nextStep && (nextIndex <= highestStepIndex || nextStep.id === currentStep)) {
                  onStepSelect(nextStep.id)
                }
              }}
            />
          </label>
        </div>
        <progress
          className="config-wizard-progress-compact-line"
          max={WIZARD_STEPS.length}
          value={currentIndex + 1}
          aria-label={`当前为第 ${currentIndex + 1} 步，共 ${WIZARD_STEPS.length} 步`}
        />
      </div>

      <ol className="config-wizard-progress-steps">
        {WIZARD_STEPS.map((step, index) => {
          const complete = index < currentIndex
          const active = step.id === currentStep
          const reachable = index <= highestStepIndex
          return (
            <li
              className={`${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`.trim()}
              key={step.id}
            >
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                aria-label={`第 ${index + 1} 步：${step.title}`}
                disabled={disabled || !reachable || active}
                onClick={() => onStepSelect(step.id)}
              >
                <span className="config-wizard-progress-index" aria-hidden="true">
                  {complete ? <Check size={13} strokeWidth={2.4} /> : index + 1}
                </span>
                <strong className="config-wizard-progress-copy">{step.title}</strong>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default WizardProgress
export type { WizardProgressProps }
