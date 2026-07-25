import { Dialogs } from '@wailsio/runtime'
import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { resetSettings, saveSettings } from '../services/shell'
import type { AICredentialDraft, AppSettings } from '../types'
import type { AppModel } from '../viewModels/appModel'
import { updateAppSettingsField } from '../viewModels/settings'

interface SettingsActionsOptions {
  settingsRef: MutableRefObject<AppSettings | null>
  credentialRef: MutableRefObject<AICredentialDraft>
  setCredential: Dispatch<SetStateAction<AICredentialDraft>>
  setModel: Dispatch<SetStateAction<AppModel | null>>
  withBusy: (action: () => Promise<void>) => Promise<void>
  setNotice: (message: string) => void
}

export function useSettingsActions({
  settingsRef,
  credentialRef,
  setCredential,
  setModel,
  withBusy,
  setNotice,
}: SettingsActionsOptions) {
  const persistSettings = useCallback(async (): Promise<AppSettings> => {
    const current = settingsRef.current
    if (!current) throw new Error('应用设置尚未载入')
    const saved = await saveSettings(current, credentialRef.current)
    const cleanCredential: AICredentialDraft = { value: '', operation: 'keep' }
    setCredential(cleanCredential)
    setModel((model) => model ? { ...model, settings: saved } : model)
    return saved
  }, [credentialRef, setCredential, setModel, settingsRef])

  const saveAppSettings = useCallback(async () => {
    await withBusy(async () => {
      await persistSettings()
      setNotice('设置已保存')
    })
  }, [persistSettings, setNotice, withBusy])

  const resetAppSettings = useCallback(async () => {
    await withBusy(async () => {
      const saved = await resetSettings()
      setCredential({ value: '', operation: 'keep' })
      setModel((model) => model ? { ...model, settings: saved } : model)
      setNotice('设置已恢复默认')
    })
  }, [setCredential, setModel, setNotice, withBusy])

  const chooseConfigDirectory = useCallback(async () => {
    await withBusy(async () => {
      const path = await Dialogs.OpenFile({
        Title: '选择配置目录',
        CanChooseDirectories: true,
        CanChooseFiles: false,
      })
      if (!path || Array.isArray(path)) return
      setModel((model) => model
        ? { ...model, settings: updateAppSettingsField(model.settings, 'config-directory', path) }
        : model)
      setNotice('配置目录已选中，记得保存')
    })
  }, [setModel, setNotice, withBusy])

  return { persistSettings, saveAppSettings, resetAppSettings, chooseConfigDirectory }
}
