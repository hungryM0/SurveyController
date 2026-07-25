import type { DashboardState } from '../../types'

export type RunPhase = 'idle' | 'running' | 'paused' | 'canceling'

export interface DashboardViewProps {
  dashboard: DashboardState
  busy?: boolean
  runPhase?: RunPhase
  canRun?: boolean
  runBlockedReason?: string
  onUpdateUrl: (value: string) => void
  onAutoConfig: () => void
  onLoadQRCode: () => void
  onDecodeQRCodeImage: (file: File) => void
  onLoadConfig: () => void
  onSaveConfig: () => void
  onOpenSetupWizard?: () => void
  onOpenRuntime: () => void
  onTargetChange: (value: number) => void
  onThreadsChange: (value: number) => void
  onRandomIpChange: (value: boolean) => void
  onProxySourceChange: (value: string) => void
  customProxyAPI: string
  onCustomProxyAPIChange: (value: string) => void
  onSyncProxyStatus: () => void
  onRedeemProxyCard: (cardCode: string) => void
  onRun: () => void
  onCancelRun: () => void
  onPauseRun: () => void
  onResumeRun: () => void
}
