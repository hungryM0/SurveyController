import { Dialogs } from '@wailsio/runtime'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createSurveyDocument,
  decodeQRCode,
  loadConfigDocument,
  saveConfigDocument,
  saveSettings,
} from '../../services/shell'
import type { AICredentialDraft, AppSettings, ConfigDocument } from '../../types'
import { createWizardDraft, type WizardDraft } from './configWizardModel'
import { persistSetupWizard, shouldAutoOpenSetupWizard } from './setupWizardLifecycle'
import type { ConfigurationWizardProps } from './wizardTypes'

interface PersistedSetupWizardState {
  config: ConfigDocument
  configPath: string
  settings: AppSettings
  credential: AICredentialDraft
}

interface UseConfigurationWizardOptions {
  loading: boolean
  config: ConfigDocument | null
  configExists: boolean
  configPath: string
  settings: AppSettings | null
  credential: AICredentialDraft
  onPersisted: (state: PersistedSetupWizardState) => void
  onNotice: (message: string) => void
  onComplete: () => void
}

export function useConfigurationWizard({
  loading,
  config,
  configExists,
  configPath,
  settings,
  credential,
  onPersisted,
  onNotice,
  onComplete,
}: UseConfigurationWizardOptions) {
  const [open, setOpen] = useState(false)
  const autoShown = useRef(false)
  const deferred = useRef(false)
  const importPath = useRef('')
  const initialDraft = useMemo(
    () => createWizardDraft(config, settings, credential),
    [config, credential, settings],
  )

  useEffect(() => {
    if (!shouldAutoOpenSetupWizard({
      loading,
      hasModel: Boolean(config && settings),
      alreadyShown: autoShown.current,
      deferred: deferred.current,
      completedVersion: settings?.setupWizardVersion ?? 0,
      configExists,
      surveyURL: config?.survey.url ?? '',
    })) {
      return
    }
    autoShown.current = true
    setOpen(true)
  }, [config, configExists, loading, settings])

  function openWizard() {
    importPath.current = ''
    setOpen(true)
  }

  function dismissWizard() {
    deferred.current = true
    importPath.current = ''
    setOpen(false)
  }

  async function decodeWizardQRCode() {
    const path = await Dialogs.OpenFile({
      Title: '识别二维码',
      CanChooseFiles: true,
      Filters: [{ DisplayName: '图片文件', Pattern: '*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp' }],
    })
    if (!path || Array.isArray(path)) return null
    return await decodeQRCode(path)
  }

  async function importWizardConfig() {
    const path = await Dialogs.OpenFile({
      Title: '导入配置',
      CanChooseFiles: true,
      Filters: [{ DisplayName: 'JSON 配置', Pattern: '*.json' }],
    })
    if (!path || Array.isArray(path)) return null
    const loaded = await loadConfigDocument(path)
    importPath.current = loaded.path
    return loaded
  }

  async function chooseWizardReverseFill() {
    const path = await Dialogs.OpenFile({
      Title: '选择反填 Excel',
      CanChooseFiles: true,
      Filters: [{ DisplayName: 'Excel 文件', Pattern: '*.xlsx;*.xlsm' }],
    })
    return !path || Array.isArray(path) ? null : path
  }

  async function saveWizardDraft(nextDraft: WizardDraft): Promise<WizardDraft> {
    if (!settings) throw new Error('应用设置尚未载入')
    const savePath = importPath.current || configPath
    const nextSettings = { ...settings, aiProfile: nextDraft.aiProfile }
    const { savedConfig, savedSettings } = await persistSetupWizard(
      nextDraft.config,
      savePath,
      nextSettings,
      nextDraft.credential,
      { saveConfig: saveConfigDocument, saveSettings },
    )
    const savedCredential: AICredentialDraft = { value: '', operation: 'keep' }
    importPath.current = ''
    onPersisted({
      config: savedConfig.config,
      configPath: savedConfig.path,
      settings: savedSettings,
      credential: savedCredential,
    })
    onNotice('配置已保存')
    return createWizardDraft(savedConfig.config, savedSettings, savedCredential)
  }

  const wizardProps: ConfigurationWizardProps = {
    open,
    initialDraft,
    onDismiss: dismissWizard,
    onParseSurvey: createSurveyDocument,
    onDecodeQRCode: decodeWizardQRCode,
    onImportConfig: importWizardConfig,
    onChooseReverseFill: chooseWizardReverseFill,
    onSave: saveWizardDraft,
    onComplete,
  }

  return { openWizard, wizardProps }
}

export type { PersistedSetupWizardState, UseConfigurationWizardOptions }
