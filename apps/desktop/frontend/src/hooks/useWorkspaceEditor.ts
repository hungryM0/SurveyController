import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AICredentialDraft, ConfigDocument } from '../types'
import type { AppModel } from '../viewModels/appModel'
import { updateConfigDocumentField } from '../services/configDocument'
import { isAIProfileField, updateAIProfileField } from '../viewModels/runtime'
import { updateAppSettingsField } from '../viewModels/settings'

interface WorkspaceEditorOptions {
  model: AppModel | null
  setModel: Dispatch<SetStateAction<AppModel | null>>
  credential: AICredentialDraft
  setCredential: Dispatch<SetStateAction<AICredentialDraft>>
}

export function useWorkspaceEditor({ model, setModel, credential, setCredential }: WorkspaceEditorOptions) {
  const setConfig = useCallback((next: ConfigDocument) => {
    setModel((current) => current ? { ...current, config: next } : current)
  }, [setModel])

  const updateField = useCallback((id: string, value: string | boolean) => {
    if (id === 'ai-api-key') {
      const text = String(value)
      setCredential({ value: text, operation: text.trim() ? 'replace' : 'clear' })
      return
    }
    if (isAIProfileField(id)) {
      setModel((current) => current
        ? { ...current, settings: updateAIProfileField(current.settings, id, value) }
        : current)
      return
    }
    setModel((current) => current
      ? { ...current, config: updateConfigDocumentField(current.config, id, value) }
      : current)
  }, [setCredential, setModel])

  const updateSettings = useCallback((id: string, value: string | boolean) => {
    setModel((current) => current
      ? { ...current, settings: updateAppSettingsField(current.settings, id, value) }
      : current)
  }, [setModel])

  return {
    config: model?.config ?? null,
    settings: model?.settings ?? null,
    credential,
    setConfig,
    updateField,
    updateSettings,
  }
}
