import { describe, expect, it } from 'vitest'
import { buildAppModel } from './stateMapper'
import { emptyShellState } from './shellFixture'
import type { AppSettings, RuntimeConfig } from '../types'

const settings: AppSettings = {
  configDirectory: 'D:/configs',
  themeMode: 'system',
  showNavigationText: true,
  micaEnabled: true,
  topmost: false,
  notifications: true,
  autosaveLogCount: 5,
  setupWizardVersion: 0,
}

const config: RuntimeConfig = {
  url: 'https://www.wjx.cn/vm/demo.aspx',
  survey_title: '示例问卷',
  target: 3,
  threads: 2,
}

describe('shell helpers', () => {
  it('builds a shell-backed app model', () => {
    const model = buildAppModel(emptyShellState, settings, config)

    expect(model.shell.appTitle).toBe('SurveyController')
    expect(model.config.target).toBe(3)
    expect(model.shell.dashboard.surveyTitle).toBe('示例问卷')
  })
})
