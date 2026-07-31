import { describe, expect, it } from 'vitest'
import { wizardNextStep } from './wizardHelpers'

describe('wizardHelpers', () => {
  it('follows the configured wizard order after parsing a survey', () => {
    expect(wizardNextStep('survey')).toBe('answers')
    expect(wizardNextStep('answers')).toBe('task')
    expect(wizardNextStep('task')).toBe('network')
    expect(wizardNextStep('network')).toBe('review')
    expect(wizardNextStep('review')).toBe('review')
  })
})
