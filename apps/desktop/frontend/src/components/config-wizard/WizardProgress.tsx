import { Check } from 'lucide-react'
import { WIZARD_STEPS, type WizardStepId } from './configWizardModel'

interface WizardProgressProps {
  currentStep: WizardStepId
  highestStepIndex: number
  disabled?: boolean
  onStepSelect: (step: WizardStepId) => void
}

function WizardProgress({ currentStep, highestStepIndex, disabled = false, onStepSelect }: WizardProgressProps) {
  const currentIndex = WIZARD_STEPS.findIndex((step) => step.id === currentStep)

  return (
    <nav className="config-wizard-progress" aria-label="配置进度">
      <ol>
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
                <span className="config-wizard-progress-copy">
                  <strong>{step.title}</strong>
                  <small>{step.description}</small>
                </span>
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
