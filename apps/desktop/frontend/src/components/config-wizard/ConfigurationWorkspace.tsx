import { useEffect } from 'react'
import WizardFrame from './WizardFrame'
import { useWizardFlow } from './useWizardFlow'
import type { ConfigurationWizardProps } from './wizardTypes'

function ConfigurationWorkspace(props: ConfigurationWizardProps) {
  const { frameProps, requestDismiss } = useWizardFlow({ ...props, resumeConfigured: true })

  useEffect(() => {
    props.onRegisterDismissRequest?.(requestDismiss)
    return () => props.onRegisterDismissRequest?.(null)
  }, [props.onRegisterDismissRequest, requestDismiss])

  if (!props.open) {
    return null
  }

  return <WizardFrame {...frameProps} />
}

export default ConfigurationWorkspace
