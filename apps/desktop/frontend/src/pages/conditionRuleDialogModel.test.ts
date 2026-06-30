import { describe, expect, it } from 'vitest'
import { createConditionRuleDraft, validateConditionRuleDraft } from './conditionRuleDialogModel'
import type { RuntimeConfig } from '../types'

const config: RuntimeConfig = {
  url: 'https://example.com',
  questions_info: [
    {
      num: 1,
      title: '单选',
      description: '',
      type_code: '3',
      options: 2,
      rows: 0,
      row_texts: [],
      option_texts: ['A', 'B'],
      provider: 'wjx',
      provider_type: 'single',
      is_description: false,
      is_text_like: false,
      text_inputs: 0,
    },
    {
      num: 2,
      title: '矩阵',
      description: '',
      type_code: '6',
      options: 2,
      rows: 2,
      row_texts: ['R1', 'R2'],
      option_texts: ['X', 'Y'],
      provider: 'wjx',
      provider_type: 'matrix',
      is_description: false,
      is_text_like: false,
      text_inputs: 0,
    },
  ],
}

describe('conditionRuleDialogModel', () => {
  it('creates a default rule draft', () => {
    const draft = createConditionRuleDraft(config)

    expect(draft.condition_question_num).toBe(1)
    expect(draft.target_question_num).toBe(2)
  })

  it('validates the rule order and selections', () => {
    expect(
      validateConditionRuleDraft(
        {
          condition_question_num: 2,
          condition_mode: 'selected',
          condition_option_indices: [0],
          condition_row_index: 0,
          target_question_num: 1,
          action_mode: 'must_select',
          target_option_indices: [0],
          target_row_index: undefined,
        },
        config.questions_info ?? [],
      ),
    ).toBe('仅支持前置条件：条件题号必须小于目标题号')
  })
})
