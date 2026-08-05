import type { ConfigDocument, ProxyStatus, RunResult, RunTaskState } from '../../types'
import type { WizardDraft, WizardStepId } from './configWizardModel'

export type WizardQRCodeResult = string | { text: string } | null
export type WizardImportResult = ConfigDocument | { config: ConfigDocument } | null
export type WizardSaveResult = WizardDraft | null | void
export type WizardDismissRequest = (afterDismiss?: () => void) => void

export type WizardCheckStatus = 'ready' | 'warning' | 'blocked'
export interface WizardCheckProblem {
  code: string
  message: string
  step: string
  severity: string
}
export interface WizardCheckState {
  status: WizardCheckStatus
  problems: WizardCheckProblem[]
}

export type WizardAsyncCallback = () => void | Promise<void>

export interface ConfigurationWizardProps {
  open: boolean
  initialDraft: WizardDraft
  onDismiss: () => void
  onParseSurvey: (url: string) => Promise<ConfigDocument>
  onDecodeQRCode: () => Promise<WizardQRCodeResult>
  onDecodeQRCodeImage?: (file: File) => Promise<WizardQRCodeResult>
  onImportConfig: () => Promise<WizardImportResult>
  onChooseReverseFill?: () => Promise<string | null>
  onSave: (draft: WizardDraft) => Promise<WizardSaveResult>
  onComplete?: (draft: WizardDraft) => void | Promise<void>
  onRegisterDismissRequest?: (request: WizardDismissRequest | null) => void
  resumeConfigured?: boolean
  onDraftChange?: (draft: WizardDraft) => void | Promise<void>
  onStepChange?: (step: WizardStepId) => void | Promise<void>
  onCheckTask?: (draft: WizardDraft) => Promise<WizardCheckState>
  checkState?: WizardCheckState | null
  proxyStatus?: ProxyStatus | null
  onProxyStatusChange?: (status: ProxyStatus | null) => void
  runTaskState?: RunTaskState | null
  runLogs?: string[]
  runError?: string
  runResult?: RunResult | null
  onStartRun?: () => void | Promise<void>
  onPauseRun?: () => void | Promise<void>
  onResumeRun?: () => void | Promise<void>
  onStopRun?: () => void | Promise<void>
  onExportResult?: () => void | Promise<void>
}
