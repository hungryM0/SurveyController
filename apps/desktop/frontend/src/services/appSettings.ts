import type { AppSettings } from '../types'

export function createDefaultAppSettings(): AppSettings {
  return {
    schemaVersion: 2,
    configDirectory: '',
    themeMode: 'system',
    showNavigationText: true,
    micaEnabled: true,
    topmost: false,
    askSaveOnClose: true,
    preventSleepDuringRun: true,
    taskResultNotification: true,
    submissionReportTelemetry: true,
    setupWizardVersion: 0,
    autoCheckUpdate: true,
    autoSaveLogs: true,
    autosaveLogCount: 10,
    aiProfile: {
      mode: 'free',
      provider: 'deepseek',
      baseURL: '',
      apiProtocol: 'auto',
      model: '',
      systemPrompt: '',
      hasAPIKey: false,
    },
  }
}
