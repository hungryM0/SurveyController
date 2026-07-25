import type { AICredentialDraft, AppSettings, ConfigDocument } from '../../types'

export const SETUP_WIZARD_VERSION = 1

interface SetupWizardAutoOpenState {
  loading: boolean
  hasModel: boolean
  alreadyShown: boolean
  deferred: boolean
  completedVersion: number
  configExists: boolean
  surveyURL: string
}

interface SetupWizardPersistenceDeps {
  saveConfig: (config: ConfigDocument, path: string) => Promise<{ path: string; config: ConfigDocument }>
  saveSettings: (settings: AppSettings, credential: AICredentialDraft) => Promise<AppSettings>
}

export function shouldAutoOpenSetupWizard(state: SetupWizardAutoOpenState): boolean {
  return !state.loading
    && state.hasModel
    && !state.alreadyShown
    && !state.deferred
    && state.completedVersion < SETUP_WIZARD_VERSION
    && !state.configExists
    && !state.surveyURL.trim()
}

export async function persistSetupWizard(
  config: ConfigDocument,
  path: string,
  settings: AppSettings,
  credential: AICredentialDraft,
  deps: SetupWizardPersistenceDeps,
) {
  const savedConfig = await deps.saveConfig(config, path)
  const savedSettings = await deps.saveSettings({
    ...settings,
    setupWizardVersion: SETUP_WIZARD_VERSION,
  }, credential)
  return { savedConfig, savedSettings }
}

export type { SetupWizardAutoOpenState, SetupWizardPersistenceDeps }
