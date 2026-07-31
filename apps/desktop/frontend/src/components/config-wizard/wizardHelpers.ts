import { WIZARD_STEPS, type WizardStepId } from './configWizardModel'

export function wizardStepIndex(step: WizardStepId): number {
  const index = WIZARD_STEPS.findIndex((item) => item.id === step)
  return index < 0 ? 0 : index
}

export function wizardNextStep(step: WizardStepId): WizardStepId {
  return WIZARD_STEPS[wizardStepIndex(step) + 1]?.id ?? 'review'
}

export function wizardErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export function formatWizardSeconds(value: number): string {
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  if (!minutes) return `${seconds} 秒`
  if (!seconds) return `${minutes} 分钟`
  return `${minutes} 分 ${seconds} 秒`
}
