import type { RuntimeConfig } from '../../types'

export type WizardQRCodeResult = string | { text: string } | null
export type WizardImportResult = RuntimeConfig | { config: RuntimeConfig } | null
export type WizardSaveResult = RuntimeConfig | { config: RuntimeConfig } | null | void

export interface ConfigurationWizardProps {
  open: boolean
  initialConfig?: RuntimeConfig | null
  onDismiss: () => void
  onParseSurvey: (url: string) => Promise<RuntimeConfig>
  onDecodeQRCode: () => Promise<WizardQRCodeResult>
  onImportConfig: () => Promise<WizardImportResult>
  onChooseReverseFill?: () => Promise<string | null>
  onSave: (config: RuntimeConfig) => Promise<WizardSaveResult>
  onComplete?: (config: RuntimeConfig) => void | Promise<void>
}
