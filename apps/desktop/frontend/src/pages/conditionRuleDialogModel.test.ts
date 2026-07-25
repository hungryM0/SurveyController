import { describe, expect, it } from 'vitest'
import { createTestConfig, createTestQuestion } from '../test/configFactory'
import { createConditionRuleDraft, validateConditionRuleDraft } from './conditionRuleDialogModel'

const config = createTestConfig((value) => {
  value.survey.url = 'https://example.com'
  value.survey.definition.questions = [
    createTestQuestion(),
    createTestQuestion((question) => {
      question.num = 2
      question.title = '矩阵'
      question.type_code = '6'
      question.provider_type = 'matrix'
      question.rows = 2
      question.row_texts = ['R1', 'R2']
      question.option_texts = ['X', 'Y']
    }),
  ]
})

describe('conditionRuleDialogModel', () => {
  it('creates a default rule draft', () => {
    const draft = createConditionRuleDraft(config)

    expect(draft.condition_question_num).toBe(1)
    expect(draft.target_question_num).toBe(2)
  })

  it('validates the rule order and selections', () => {
    expect(validateConditionRuleDraft({
      condition_question_num: 2,
      condition_mode: 'selected',
      condition_option_indices: [0],
      condition_row_index: 0,
      target_question_num: 1,
      action_mode: 'must_select',
      target_option_indices: [0],
      target_row_index: undefined,
    }, config.survey.definition.questions ?? [])).toBe('仅支持前置条件：条件题号必须小于目标题号')
  })
})
