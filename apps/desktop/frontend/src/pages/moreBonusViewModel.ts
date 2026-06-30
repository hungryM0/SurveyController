import type { RandomIPBonusState } from '../types'

export function buildBonusMessage(result: RandomIPBonusState): string {
  if (result.claimed && result.bonusQuota > 0) {
    return `恭喜发现彩蛋，额度+${formatQuotaValue(result.bonusQuota)}`
  }
  if (result.claimed) {
    return '恭喜发现彩蛋，隐藏福利已到账'
  }
  if (result.detail === 'bonus_already_claimed' || result.detail === 'easter_egg_already_claimed') {
    return '彩蛋已触发，无需重复领取'
  }
  if (result.detail === 'bonus_claim_not_available' || result.detail === 'easter_egg_not_available') {
    return '当前暂时无法领取彩蛋奖励，请稍后再试'
  }
  return result.detail || '领取彩蛋奖励失败'
}

export function formatQuotaValue(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const rounded = Math.round(value * 100) / 100
  if (Number.isInteger(rounded)) {
    return String(rounded)
  }
  return rounded.toFixed(2).replace(/\.?0+$/, '')
}
