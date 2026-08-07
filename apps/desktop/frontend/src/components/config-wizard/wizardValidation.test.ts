import { describe, expect, it } from 'vitest'
import { validateSurveyURL } from './wizardValidation'

describe('validateSurveyURL', () => {
  it('allows a newly entered HTTP survey link before parsing', () => {
    expect(validateSurveyURL('https://v.wjx.cn/vm/ei3sVrE.aspx')).toEqual({ valid: true })
  })

  it('rejects missing and unsupported survey links', () => {
    expect(validateSurveyURL('')).toEqual({ valid: false, message: '请先输入问卷链接。' })
    expect(validateSurveyURL('ftp://v.wjx.cn/vm/ei3sVrE.aspx')).toEqual({
      valid: false,
      message: '问卷链接需要以 http:// 或 https:// 开头。',
    })
  })
})
