import type { ConfigDocument } from '../../types'
import type { WizardDraft } from './configWizardModel'

export type WizardQRCodeResult = string | { text: string } | null
export type WizardImportResult = ConfigDocument | { config: ConfigDocument } | null
export type WizardSaveResult = WizardDraft | null | void
export type WizardDismissRequest = (afterDismiss?: () => void) => void

export interface ConfigurationWizardProps {
  open: boolean
  initialDraft: WizardDraft
  onDismiss: () => void
  onParseSurvey: (url: string) => Promise<ConfigDocument>
  onDecodeQRCode: () => Promise<WizardQRCodeResult>
  onImportConfig: () => Promise<WizardImportResult>
  onChooseReverseFill?: () => Promise<string | null>
  onSave: (draft: WizardDraft) => Promise<WizardSaveResult>
  onComplete?: (draft: WizardDraft) => void | Promise<void>
  onRegisterDismissRequest?: (request: WizardDismissRequest | null) => void
  resumeConfigured?: boolean
}
