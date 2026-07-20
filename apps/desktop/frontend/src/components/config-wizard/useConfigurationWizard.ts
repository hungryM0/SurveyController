import { Dialogs } from '@wailsio/runtime'
import { useEffect, useRef, useState } from 'react'
import {
  buildDefaultConfig,
  decodeQRCode,
  loadRuntimeConfig,
  saveRuntimeConfig,
  saveSettings,
} from '../../services/shell'
import type { AppSettings, RuntimeConfig } from '../../types'
import { persistSetupWizard, shouldAutoOpenSetupWizard } from './setupWizardLifecycle'
import type { ConfigurationWizardProps } from './wizardTypes'

interface PersistedSetupWizardState {
  config: RuntimeConfig
  configPath: string
  settings: AppSettings
}

interface UseConfigurationWizardOptions {
  loading: boolean
  config: RuntimeConfig | null
  configExists: boolean
  configPath: string
  settings: AppSettings | null
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
  onPersisted,
  onNotice,
  onComplete,
}: UseConfigurationWizardOptions) {
  const [open, setOpen] = useState(false)
  const autoShown = useRef(false)
  const deferred = useRef(false)
  const importPath = useRef('')

  useEffect(() => {
    if (!shouldAutoOpenSetupWizard({
      loading,
      hasModel: Boolean(config && settings),
      alreadyShown: autoShown.current,
      deferred: deferred.current,
      completedVersion: settings?.setupWizardVersion ?? 0,
      configExists,
      surveyURL: config?.url ?? '',
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
    if (!path || Array.isArray(path)) {
      return null
    }
    return await decodeQRCode(path)
  }

  async function importWizardConfig() {
    const path = await Dialogs.OpenFile({
      Title: '导入配置',
      CanChooseFiles: true,
      Filters: [{ DisplayName: 'JSON 配置', Pattern: '*.json' }],
    })
    if (!path || Array.isArray(path)) {
      return null
    }
    const loaded = await loadRuntimeConfig(path)
    importPath.current = loaded.path
    return loaded
  }

  async function chooseWizardReverseFill() {
    const path = await Dialogs.OpenFile({
      Title: '选择反填 Excel',
      CanChooseFiles: true,
      Filters: [{ DisplayName: 'Excel 文件', Pattern: '*.xlsx;*.xlsm' }],
    })
    if (!path || Array.isArray(path)) {
      return null
    }
    return path
  }

  async function saveWizardConfig(nextConfig: RuntimeConfig) {
    if (!settings) {
      throw new Error('应用设置尚未载入')
    }
    const savePath = importPath.current || configPath
    const { savedConfig, savedSettings } = await persistSetupWizard(
      nextConfig,
      savePath,
      settings,
      { saveConfig: saveRuntimeConfig, saveSettings },
    )
    importPath.current = ''
    onPersisted({
      config: savedConfig.config,
      configPath: savedConfig.path,
      settings: savedSettings,
    })
    onNotice('配置已保存')
    return savedConfig
  }

  const wizardProps: ConfigurationWizardProps = {
    open,
    initialConfig: config,
    onDismiss: dismissWizard,
    onParseSurvey: buildDefaultConfig,
    onDecodeQRCode: decodeWizardQRCode,
    onImportConfig: importWizardConfig,
    onChooseReverseFill: chooseWizardReverseFill,
    onSave: saveWizardConfig,
    onComplete,
  }

  return { openWizard, wizardProps }
}

export type { PersistedSetupWizardState, UseConfigurationWizardOptions }
