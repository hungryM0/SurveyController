import WizardDialogRoot from './WizardDialogRoot'
import { useWizardFlow } from './useWizardFlow'
import type { ConfigurationWizardProps } from './wizardTypes'

function ConfigurationWizard(props: ConfigurationWizardProps) {
  const { frameProps, requestDismiss } = useWizardFlow(props)
  if (!props.open) {
    return null
  }
  return <WizardDialogRoot open frameProps={frameProps} onRequestDismiss={requestDismiss} />
}

export default ConfigurationWizard
export type { ConfigurationWizardProps } from './wizardTypes'
export type { WizardImportResult, WizardQRCodeResult, WizardSaveResult } from './wizardTypes'
