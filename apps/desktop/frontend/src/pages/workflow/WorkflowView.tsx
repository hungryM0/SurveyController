import ConfigurationWorkspace from '../../components/config-wizard/ConfigurationWorkspace'
import type { ConfigurationWizardProps } from '../../components/config-wizard'
import type { DashboardState } from '../../types'
import type { RunPhase } from './types'
import WorkflowOverview from './WorkflowOverview'

interface WorkflowViewProps {
  dashboard: DashboardState
  busy: boolean
  runPhase: RunPhase
  canRun: boolean
  runBlockedReason?: string
  wizardProps: ConfigurationWizardProps
  onOpenWizard: () => void
  onRun: () => void
  onCancelRun: () => void
  onPauseRun: () => void
  onResumeRun: () => void
  onOpenRuntime: () => void
  onOpenStrategy: () => void
  onOpenReverseFill: () => void
  onOpenLogs: () => void
}

function WorkflowView({ wizardProps, ...overviewProps }: WorkflowViewProps) {
  return wizardProps.open
    ? <ConfigurationWorkspace {...wizardProps} />
    : <WorkflowOverview {...overviewProps} />
}

export default WorkflowView
export type { WorkflowViewProps }
