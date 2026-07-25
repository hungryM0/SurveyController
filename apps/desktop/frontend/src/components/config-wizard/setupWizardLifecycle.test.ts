import { describe, expect, it, vi } from 'vitest'
import { createTestConfig, createTestSettings } from '../../test/configFactory'
import type { AICredentialDraft, AppSettings, ConfigDocument } from '../../types'
import {
  SETUP_WIZARD_VERSION,
  persistSetupWizard,
  shouldAutoOpenSetupWizard,
} from './setupWizardLifecycle'

const settings = createTestSettings((value) => {
  value.configDirectory = 'D:/configs'
  value.setupWizardVersion = 0
})
const credential: AICredentialDraft = { operation: 'keep', value: '' }

describe('setup wizard lifecycle', () => {
  it('opens only for an unfinished first run without a saved configuration', () => {
    const firstRun = {
      loading: false,
      hasModel: true,
      alreadyShown: false,
      deferred: false,
      completedVersion: 0,
      configExists: false,
      surveyURL: '',
    }

    expect(shouldAutoOpenSetupWizard(firstRun)).toBe(true)
    expect(shouldAutoOpenSetupWizard({ ...firstRun, configExists: true })).toBe(false)
    expect(shouldAutoOpenSetupWizard({ ...firstRun, surveyURL: 'https://example.com' })).toBe(false)
    expect(shouldAutoOpenSetupWizard({ ...firstRun, completedVersion: SETUP_WIZARD_VERSION })).toBe(false)
    expect(shouldAutoOpenSetupWizard({ ...firstRun, deferred: true })).toBe(false)
  })

  it('saves the configuration before marking the wizard complete', async () => {
    const calls: string[] = []
    const config = createTestConfig((value) => {
      value.survey.url = 'https://www.wjx.cn/vm/example.aspx'
    })
    const saveConfig = vi.fn(async (next: ConfigDocument, path: string) => {
      calls.push('config')
      return { path, config: next }
    })
    const saveSettings = vi.fn(async (next: AppSettings, nextCredential: AICredentialDraft) => {
      calls.push('settings')
      expect(nextCredential).toEqual(credential)
      return next
    })

    const saved = await persistSetupWizard(config, 'D:/configs/example.json', settings, credential, {
      saveConfig,
      saveSettings,
    })

    expect(calls).toEqual(['config', 'settings'])
    expect(saved.savedSettings.setupWizardVersion).toBe(SETUP_WIZARD_VERSION)
  })

  it('does not mark completion when saving the configuration fails', async () => {
    const saveSettings = vi.fn(async (next: AppSettings) => next)

    await expect(persistSetupWizard(createTestConfig(), '', settings, credential, {
      saveConfig: vi.fn(async () => { throw new Error('保存失败') }),
      saveSettings,
    })).rejects.toThrow('保存失败')

    expect(saveSettings).not.toHaveBeenCalled()
  })
})
