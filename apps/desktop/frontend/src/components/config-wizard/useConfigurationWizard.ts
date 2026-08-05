import { Dialogs } from '@wailsio/runtime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createSurveyDocument,
  decodeQRCode,
  decodeQRCodeDataURL,
  loadConfigDocument,
  saveConfigDocument,
  saveSettings,
} from '../../services/shell'
import type { AICredentialDraft, AIProfileSettings, AppSettings, ConfigDocument } from '../../types'
import { createWizardDraft, type WizardDraft } from './configWizardModel'
import { persistSetupWizard } from './setupWizardLifecycle'
import type { ConfigurationWizardProps, WizardDismissRequest } from './wizardTypes'
import { readFileAsDataURL } from './qrImage'

interface PersistedSetupWizardState {
  config: ConfigDocument
  configPath: string
  settings: AppSettings
  credential: AICredentialDraft
}

const wizardDraftStorageKey = 'surveycontroller.task-wizard.draft'

interface StoredWizardDraft {
  version: 1
  configPath: string
  config: ConfigDocument
  aiProfile: AIProfileSettings
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
  const dismissRequest = useRef<WizardDismissRequest | null>(null)
  const pendingDismissAction = useRef<(() => void) | null>(null)
  const draftSaveTimer = useRef<number | null>(null)
  const draftSaveRevision = useRef(0)
  const pendingDraftSave = useRef<{ revision: number; resolve: () => void; reject: (cause: unknown) => void } | null>(null)
  const activeDraftSave = useRef<Promise<void> | null>(null)
  const initialDraft = useMemo(
    () => restoreWizardDraft(createWizardDraft(config, settings, credential), configPath, !configExists),
    [config, configExists, configPath, credential, settings],
  )

  useEffect(() => {
    if (loading || !config || !settings || autoShown.current || deferred.current) {
      return
    }
    autoShown.current = true
    setOpen(true)
  }, [config, loading, settings])

  const settlePendingDraftSave = useCallback((cause?: unknown) => {
    const pending = pendingDraftSave.current
    pendingDraftSave.current = null
    if (!pending) return
    if (cause === undefined) {
      pending.resolve()
    } else {
      pending.reject(cause)
    }
  }, [])

  const cancelDraftSave = useCallback(() => {
    if (draftSaveTimer.current !== null) {
      window.clearTimeout(draftSaveTimer.current)
      draftSaveTimer.current = null
    }
    settlePendingDraftSave()
  }, [settlePendingDraftSave])

  const persistDraftSnapshot = useCallback(async (nextDraft: WizardDraft, revision: number) => {
    const previousSave = activeDraftSave.current
    if (previousSave) {
      // Serialize disk writes so an older debounced save cannot finish after the newest one.
      await previousSave.catch(() => undefined)
    }
    if (!settings || revision !== draftSaveRevision.current) return
    try {
      const savePath = importPath.current || configPath
      const savedConfig = await saveConfigDocument(nextDraft.config, savePath)
      if (revision !== draftSaveRevision.current) return
      // Keep the raw draft snapshot even though the config service normalizes its file output.
      persistWizardDraftSnapshot(nextDraft, savedConfig.path)
      const savedSettings = await saveSettings(
        { ...settings, aiProfile: structuredClone(nextDraft.aiProfile) },
        nextDraft.credential,
      )
      if (revision !== draftSaveRevision.current) return
      importPath.current = ''
      onPersisted({
        config: savedConfig.config,
        configPath: savedConfig.path,
        settings: savedSettings,
        credential: nextDraft.credential,
      })
    } catch (cause) {
      if (revision === draftSaveRevision.current) {
        onNotice(`草稿保存失败：${cause instanceof Error ? cause.message : String(cause)}`)
      }
      throw cause
    }
  }, [configPath, onNotice, onPersisted, settings])

  const scheduleDraftSave = useCallback((nextDraft: WizardDraft): Promise<void> => {
    const cloned = structuredClone(nextDraft)
    const revision = ++draftSaveRevision.current
    const savePath = importPath.current || configPath
    cancelDraftSave()
    persistWizardDraftSnapshot(cloned, savePath)

    if (!settings) return Promise.resolve()

    // Keep the in-memory model current so closing the window can flush the latest draft.
    onPersisted({
      config: cloned.config,
      configPath: savePath,
      settings: { ...settings, aiProfile: structuredClone(cloned.aiProfile) },
      credential: cloned.credential,
    })
    return new Promise<void>((resolve, reject) => {
      pendingDraftSave.current = { revision, resolve, reject }
      draftSaveTimer.current = window.setTimeout(() => {
        draftSaveTimer.current = null
        const operation = persistDraftSnapshot(cloned, revision)
        activeDraftSave.current = operation
        void operation.then(
          () => {
            if (draftSaveRevision.current === revision) settlePendingDraftSave()
          },
          (cause) => {
            if (draftSaveRevision.current === revision) settlePendingDraftSave(cause)
          },
        ).finally(() => {
          if (activeDraftSave.current === operation) activeDraftSave.current = null
        })
      }, 350)
    })
  }, [cancelDraftSave, configPath, onPersisted, persistDraftSnapshot, settlePendingDraftSave, settings])

  function openWizard() {
    importPath.current = ''
    setOpen(true)
  }

  function dismissWizard() {
    deferred.current = true
    importPath.current = ''
    setOpen(false)
  }

  const registerDismissRequest = useCallback((request: WizardDismissRequest | null) => {
    dismissRequest.current = request
    if (request && pendingDismissAction.current) {
      const afterDismiss = pendingDismissAction.current
      pendingDismissAction.current = null
      request(afterDismiss)
    }
  }, [])

  const requestWizardDismiss = useCallback((afterDismiss?: () => void) => {
    if (!open) {
      afterDismiss?.()
      return
    }
    if (dismissRequest.current) {
      dismissRequest.current(afterDismiss)
      return
    }
    pendingDismissAction.current = afterDismiss ?? null
  }, [open])

  async function decodeWizardQRCode() {
    const path = await Dialogs.OpenFile({
      Title: '识别二维码',
      CanChooseFiles: true,
      Filters: [{ DisplayName: '图片文件', Pattern: '*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp' }],
    })
    if (!path || Array.isArray(path)) return null
    return await decodeQRCode(path)
  }

  async function decodeWizardQRCodeImage(file: File) {
    return await decodeQRCodeDataURL(await readFileAsDataURL(file), file.name)
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
    if (activeDraftSave.current) {
      await activeDraftSave.current
    }
    ++draftSaveRevision.current
    cancelDraftSave()
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
    clearWizardDraftStorage()
    onNotice('配置已保存')
    return createWizardDraft(savedConfig.config, savedSettings, savedCredential)
  }

  const wizardProps: ConfigurationWizardProps = {
    open,
    initialDraft,
    onDismiss: dismissWizard,
    onParseSurvey: createSurveyDocument,
    onDecodeQRCode: decodeWizardQRCode,
    onDecodeQRCodeImage: decodeWizardQRCodeImage,
    onImportConfig: importWizardConfig,
    onChooseReverseFill: chooseWizardReverseFill,
    onSave: saveWizardDraft,
    onComplete,
    onRegisterDismissRequest: registerDismissRequest,
    onDraftChange: scheduleDraftSave,
  }

  return { openWizard, requestWizardDismiss, wizardProps }
}

export type { PersistedSetupWizardState, UseConfigurationWizardOptions }

export function restoreWizardDraft(baseDraft: WizardDraft, configPath: string, allowMismatchedPath = false): WizardDraft {
  const stored = readStoredWizardDraft()
  if (!stored || (!allowMismatchedPath && stored.configPath !== configPath) || !isConfigDocumentLike(stored.config)) {
    return baseDraft
  }
  return {
    ...baseDraft,
    config: structuredClone(stored.config),
    aiProfile: { ...baseDraft.aiProfile, ...structuredClone(stored.aiProfile) },
  }
}

export function persistWizardDraftSnapshot(draft: WizardDraft, configPath: string): void {
  if (typeof window === 'undefined') return
  const stored: StoredWizardDraft = {
    version: 1,
    configPath,
    config: structuredClone(draft.config),
    // Credentials never enter the WebView storage snapshot.
    aiProfile: snapshotAIProfile(draft.aiProfile),
  }
  try {
    window.localStorage.setItem(wizardDraftStorageKey, JSON.stringify(stored))
  } catch {
    // Wails persistence remains the authoritative store when local storage is unavailable.
  }
}

function snapshotAIProfile(profile: AIProfileSettings): AIProfileSettings {
  return {
    mode: profile.mode,
    provider: profile.provider,
    baseURL: profile.baseURL,
    apiProtocol: profile.apiProtocol,
    model: profile.model,
    systemPrompt: profile.systemPrompt,
    hasAPIKey: profile.hasAPIKey,
  }
}

export function clearWizardDraftStorage(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(wizardDraftStorageKey)
  } catch {
    return
  }
}

function readStoredWizardDraft(): StoredWizardDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(wizardDraftStorageKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StoredWizardDraft>
    if (value.version !== 1 || typeof value.configPath !== 'string' || !value.config || !value.aiProfile) {
      return null
    }
    return value as StoredWizardDraft
  } catch {
    return null
  }
}

function isConfigDocumentLike(value: ConfigDocument): boolean {
  return Boolean(value
    && value.survey
    && value.survey.definition
    && value.execution
    && value.network
    && value.answers
    && value.reverseFill
    && value.psychometrics)
}
