import { describe, expect, it } from 'vitest'
import { createTestSettings } from '../test/configFactory'
import { mapSettingsGroups, updateAppSettingsField } from './settings'

describe('settings view model', () => {
  it('updates persisted app settings fields', () => {
    let next = createTestSettings()
    next = updateAppSettingsField(next, 'autosave', '10')
    next = updateAppSettingsField(next, 'ask-save-on-close', false)
    next = updateAppSettingsField(next, 'prevent-sleep', false)
    next = updateAppSettingsField(next, 'task-result-notification', false)
    next = updateAppSettingsField(next, 'submission-report-telemetry', false)
    next = updateAppSettingsField(next, 'auto-update', false)
    next = updateAppSettingsField(next, 'auto-save-logs', false)

    expect(next).toMatchObject({
      autosaveLogCount: 10,
      askSaveOnClose: false,
      preventSleepDuringRun: false,
      taskResultNotification: false,
      submissionReportTelemetry: false,
      autoCheckUpdate: false,
      autoSaveLogs: false,
    })
    expect(updateAppSettingsField(next, 'nav-text', false).showNavigationText).toBe(false)
  })

  it('maps the main settings switches into setting groups', () => {
    const groups = mapSettingsGroups(createTestSettings())
    const fields = groups.flatMap((group) => group.fields)

    expect(fields.map((field) => field.id)).toEqual(expect.arrayContaining([
      'ask-save-on-close',
      'prevent-sleep',
      'task-result-notification',
      'submission-report-telemetry',
      'auto-save-logs',
      'autosave',
      'auto-update',
    ]))
    expect(fields.find((field) => field.id === 'autosave')?.options).toEqual(['3', '5', '10', '20', '30', '50'])
    expect(fields.find((field) => field.id === 'nav-text')).toMatchObject({ label: '导航文字', description: '在侧栏显示页面名称' })
    expect(fields.map((field) => field.description).join(' ')).not.toMatch(/QFluentWidgets|WinUI/)
  })
})
