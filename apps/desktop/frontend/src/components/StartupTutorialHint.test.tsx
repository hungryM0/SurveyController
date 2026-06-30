import { describe, expect, it } from 'vitest'
import {
  STARTUP_TUTORIAL_DOC_URL,
  startupTutorialCopy,
  shouldScheduleStartupTutorialHint,
} from './StartupTutorialHint'

describe('startup tutorial hint', () => {
  it('keeps main startup tutorial copy and url', () => {
    expect(STARTUP_TUTORIAL_DOC_URL).toBe('https://surveydoc.hungrym0.com/')
    expect(startupTutorialCopy).toMatchObject({
      title: '第一次用？先看教程',
      content: '教程里有相关设置的详细说明',
      hint: '将使用外部浏览器打开教程页面',
      dismiss: '不再显示',
      open: '打开教程',
    })
  })

  it('schedules only after app loading when not seen', () => {
    expect(shouldScheduleStartupTutorialHint(true, true)).toBe(false)
    expect(shouldScheduleStartupTutorialHint(false, false)).toBe(false)
    expect(shouldScheduleStartupTutorialHint(false, undefined)).toBe(false)
    expect(shouldScheduleStartupTutorialHint(false, true)).toBe(true)
  })
})
