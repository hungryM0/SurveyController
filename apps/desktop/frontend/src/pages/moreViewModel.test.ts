import { describe, expect, it } from 'vitest'
import {
  buildStableReleaseInfo,
  buildVelopackFeedReleaseInfo,
  compareVersion,
  formatReleaseDate,
  latestFullVelopackAsset,
  previewReleaseNotes,
  releaseStatusText,
  shouldAutoCheckRelease,
  WINDOWS_LATEST_SETUP_URL,
} from './moreViewModel'

describe('moreViewModel', () => {
  it('compares semantic versions with v prefix', () => {
    expect(compareVersion('v4.1.0', '4.0.9')).toBeGreaterThan(0)
    expect(compareVersion('4.0.6', 'v4.0.6')).toBe(0)
    expect(compareVersion('4.0.5', '4.0.6')).toBeLessThan(0)
  })

  it('marks remote newer release as outdated', () => {
    const info = buildStableReleaseInfo({
      version: 'v4.1.0',
      published_at: '2026-06-01T12:00:00Z',
      installer_url: 'https://example.test/SurveyController.exe',
    }, '4.0.6')

    expect(info.status).toBe('outdated')
    expect(info.message).toBe('发现新版本 v4.1.0')
    expect(releaseStatusText(info)).toContain('2026-06-01')
    expect(info.htmlUrl).toBe('https://example.test/SurveyController.exe')
  })

  it('marks same release as latest', () => {
    const info = buildStableReleaseInfo({ version: 'v4.0.6' }, '4.0.6')

    expect(info.status).toBe('latest')
    expect(info.message).toBe('当前已是最新版本 v4.0.6')
    expect(info.htmlUrl).toBe(WINDOWS_LATEST_SETUP_URL)
  })

  it('marks local newer than remote as preview', () => {
    const info = buildStableReleaseInfo({ version: 'v4.0.6' }, '4.1.0')

    expect(info.status).toBe('preview')
    expect(info.message).toBe('远端最新版是 v4.0.6，当前版本 v4.1.0')
  })

  it('handles unknown and date formatting boundaries', () => {
    expect(buildStableReleaseInfo({}, '4.0.6').status).toBe('unknown')
    expect(formatReleaseDate('bad-date')).toBe('bad-date')
    expect(previewReleaseNotes('# 标题\n\n\n正文', 20)).toBe('标题\n\n正文')
    expect(previewReleaseNotes('', 20)).toBe('暂无更新说明')
  })

  it('falls back to the highest full asset in stable feed', () => {
    const payload = {
      Assets: [
        { Version: '4.0.9', Type: 'Full', FileName: 'SurveyController-4.0.9-full.nupkg' },
        { Version: '4.1.0', Type: 'Delta', FileName: 'SurveyController-4.1.0-delta.nupkg' },
        { Version: '4.1.0', Type: 'Full', FileName: 'SurveyController-4.1.0-full.nupkg', NotesMarkdown: '修复说明' },
      ],
    }

    expect(latestFullVelopackAsset(payload)?.Version).toBe('4.1.0')
    const info = buildVelopackFeedReleaseInfo(payload, '4.0.6')
    expect(info.status).toBe('outdated')
    expect(info.latestVersion).toBe('4.1.0')
    expect(info.releaseNotes).toBe('修复说明')
    expect(info.htmlUrl).toContain('SurveyController-4.1.0-full.nupkg')
  })

  it('honors startup auto update setting but keeps manual refresh', () => {
    expect(shouldAutoCheckRelease(true, 0)).toBe(true)
    expect(shouldAutoCheckRelease(false, 0)).toBe(false)
    expect(shouldAutoCheckRelease(false, 1)).toBe(true)
  })

})
