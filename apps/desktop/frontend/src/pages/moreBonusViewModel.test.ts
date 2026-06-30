import { describe, expect, it } from 'vitest'
import { buildBonusMessage, formatQuotaValue } from './moreBonusViewModel'

describe('moreBonusViewModel', () => {
  it('formats bonus messages and quota values', () => {
    expect(formatQuotaValue(5)).toBe('5')
    expect(formatQuotaValue(5.5)).toBe('5.5')
    expect(formatQuotaValue(Number.NaN)).toBe('0')
    expect(buildBonusMessage({ claimed: true, bonusQuota: 5, playConfetti: true })).toBe('恭喜发现彩蛋，额度+5')
    expect(buildBonusMessage({ claimed: true, bonusQuota: 0, playConfetti: true })).toBe('恭喜发现彩蛋，隐藏福利已到账')
    expect(buildBonusMessage({ claimed: false, bonusQuota: 0, detail: 'bonus_already_claimed', playConfetti: false })).toBe('彩蛋已触发，无需重复领取')
    expect(buildBonusMessage({ claimed: false, bonusQuota: 0, detail: '', playConfetti: false })).toBe('领取彩蛋奖励失败')
  })
})
