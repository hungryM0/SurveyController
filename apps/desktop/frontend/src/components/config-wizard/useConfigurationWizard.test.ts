import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWizardDraft } from './configWizardModel'
import {
  clearWizardDraftStorage,
  persistWizardDraftSnapshot,
  restoreWizardDraft,
} from './useConfigurationWizard'
import { createTestConfig, createTestSettings } from '../../test/configFactory'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('wizard draft storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restores the latest draft without storing the API key', () => {
    const storage = createStorage()
    vi.stubGlobal('window', { localStorage: storage })
    const draft = createWizardDraft(createTestConfig(), createTestSettings())
    draft.config.execution.target = 0
    draft.aiProfile.mode = 'provider'
    draft.credential = { operation: 'replace', value: 'secret-api-key' }

    persistWizardDraftSnapshot(draft, 'D:/configs/task.json')

    const raw = storage.getItem('surveycontroller.task-wizard.draft')
    expect(raw).not.toContain('secret-api-key')
    const restored = restoreWizardDraft(
      createWizardDraft(createTestConfig(), createTestSettings()),
      'D:/configs/task.json',
    )
    expect(restored.config.execution.target).toBe(0)
    expect(restored.aiProfile.mode).toBe('provider')
    expect(restored.credential.operation).toBe('keep')
  })

  it('clears the local draft when the flow explicitly discards it', () => {
    const storage = createStorage()
    vi.stubGlobal('window', { localStorage: storage })
    persistWizardDraftSnapshot(createWizardDraft(createTestConfig(), createTestSettings()), '')

    clearWizardDraftStorage()

    expect(storage.getItem('surveycontroller.task-wizard.draft')).toBeNull()
  })

  it('restores an imported draft when the default config is still missing', () => {
    const storage = createStorage()
    vi.stubGlobal('window', { localStorage: storage })
    const imported = createWizardDraft(createTestConfig(), createTestSettings())
    imported.config.execution.target = 37

    persistWizardDraftSnapshot(imported, 'D:/configs/imported.json')

    const restored = restoreWizardDraft(
      createWizardDraft(createTestConfig(), createTestSettings()),
      'D:/AppData/SurveyController/config.json',
      true,
    )
    expect(restored.config.execution.target).toBe(37)
  })
})
