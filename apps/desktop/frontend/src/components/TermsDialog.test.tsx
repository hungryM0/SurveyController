import { describe, expect, it } from 'vitest'
import { termsDialogCopy } from './TermsDialog'

describe('TermsDialog asset', () => {
  it('keeps terms url stable', () => {
    const repo = 'https://github.com/SurveyController/SurveyController'
    expect(`${repo}/blob/main/README.md`).toContain('/blob/main/README.md')
  })

  it('supports terms and license copies', () => {
    expect(termsDialogCopy('terms').title).toContain('服务条款')
    expect(termsDialogCopy('terms').body).toContain('隐私声明')
    expect(termsDialogCopy('terms').body).toContain('不收集用户填写的问卷内容数据')
    expect(termsDialogCopy('license').subtitle).toBe('GPL-3.0')
    expect(termsDialogCopy('license').body).toContain('对应源码')
  })
})
