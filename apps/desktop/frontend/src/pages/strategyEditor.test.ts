import { describe, expect, it } from 'vitest'
import {
  buildQuestionTreePages,
  buildQuestionSearchHits,
  buildDimensionQuestionRows,
  addDimensionGroup,
  createDefaultRule,
  deleteDimensionGroup,
  deleteRuleAtIndex,
  dimensionUsageCount,
  findQuestionEntry,
  getEligibleQuestions,
  normalizeRule,
  renameDimensionGroup,
  questionLogicSummary,
  questionLogicDetails,
  questionMediaSummary,
  questionMediaItems,
  questionSearchText,
  sanitizeDimensionGroups,
  setQuestionDimension,
  setQuestionAiEnabled,
  setQuestionAttachedOptionSelects,
  setQuestionCustomWeights,
  setQuestionFillableOptions,
  setQuestionLocationParts,
  setQuestionOptionFillTexts,
  setQuestionPsychoBias,
  setQuestionMultiTextBlankConfig,
  setQuestionTextRandomIntRange,
  setQuestionTextRandomMode,
  moveQuestionsToDimension,
  updateRuleAtIndex,
} from './strategyEditor'
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
      logic_parse_status: 'complete',
      jump_rules: [{ option_index: 0, jumpto: 4 }],
      display_conditions: [{ condition_question_num: 1, condition_mode: 'selected', condition_option_indices: [1] }],
      controls_display_targets: [{ target_question_num: 3, condition_option_indices: [0] }],
      question_media: [{ scope: 'title', index: null, source_url: 'https://example.com/a.png', label: '题干图' }],
    },
    {
      num: 3,
      title: '说明',
      description: '',
      type_code: '1',
      options: 0,
      rows: 0,
      row_texts: [],
      option_texts: [],
      provider: 'wjx',
      provider_type: 'text',
      is_description: true,
      is_text_like: true,
      text_inputs: 0,
    },
  ],
  question_entries: [
    { question_type: 'single', probabilities: [1, 1], question_num: 1, dimension: '服务' },
  ],
  dimension_groups: ['服务'],
  answer_rules: [],
}

describe('strategyEditor', () => {
  it('filters eligible questions and creates a default rule', () => {
    const questions = getEligibleQuestions(config)
    const rule = createDefaultRule(config)

    expect(questions.map((item) => item.num)).toEqual([1, 2])
    expect(rule.condition_question_num).toBe(1)
    expect(rule.target_question_num).toBe(2)
  })

  it('normalizes and edits rules', () => {
    const normalized = normalizeRule({
      condition_question_num: 1,
      condition_mode: 'selected',
      condition_option_indices: [1, 1, 0],
      target_question_num: 2,
      action_mode: 'must_not_select',
      target_option_indices: [2, 0],
      target_row_index: -1,
    })

    expect(normalized.condition_option_indices).toEqual([0, 1])
    expect(normalized.target_option_indices).toEqual([0, 2])
    expect(normalized.target_row_index).toBeUndefined()

    const next = updateRuleAtIndex(config, -1, normalized)
    expect(next.answer_rules).toHaveLength(1)
    expect(deleteRuleAtIndex(next, 0).answer_rules).toEqual([])
  })

  it('manages dimension groups and question dimensions', () => {
    const added = addDimensionGroup(config, '信任感')
    expect(added.dimension_groups).toEqual(['服务', '信任感'])

    const renamed = renameDimensionGroup(added, '服务', '满意度')
    expect(renamed.dimension_groups).toContain('满意度')
    expect(findQuestionEntry(renamed, 1)?.dimension).toBe('满意度')

    const assigned = setQuestionDimension(renamed, 2, '信任感')
    expect(findQuestionEntry(assigned, 2)?.dimension).toBe('信任感')
    expect(dimensionUsageCount(assigned, '信任感')).toBe(1)
    expect(sanitizeDimensionGroups(assigned)).toEqual(['信任感', '满意度'])

    const deleted = deleteDimensionGroup(assigned, '信任感')
    expect(findQuestionEntry(deleted, 2)?.dimension).toBe('')
    expect(sanitizeDimensionGroups(deleted)).toEqual(['满意度'])
  })

  it('moves questions to a dimension in bulk', () => {
    const next = moveQuestionsToDimension(config, [1, 2], '信任感')

    expect(findQuestionEntry(next, 1)?.dimension).toBe('信任感')
    expect(findQuestionEntry(next, 2)?.dimension).toBe('信任感')
  })

  it('updates question editor runtime fields', () => {
    const aiEnabled = setQuestionAiEnabled(config, 1, true)
    const psychoBias = setQuestionPsychoBias(aiEnabled, 1, 'left')
    const customWeights = setQuestionCustomWeights(psychoBias, 1, '1, 2, 3')
    const textMode = setQuestionTextRandomMode(aiEnabled, 1, 'integer')
    const range = setQuestionTextRandomIntRange(textMode, 1, '1 - 9')
    const location = setQuestionLocationParts(range, 2, ['浙江', '杭州', '西湖'])
    const fillTexts = setQuestionOptionFillTexts(location, 2, ['A', '', 'C'])
    const fillableOptions = setQuestionFillableOptions(fillTexts, 2, [1, 0, 0])
    const attachedSelects = setQuestionAttachedOptionSelects(fillableOptions, 1, [
      { option_index: 0, option_text: 'A', select_options: ['甲', '乙'] },
    ])
    const multiTextConfig: RuntimeConfig = {
      ...attachedSelects,
      questions_info: [
        ...(attachedSelects.questions_info ?? []),
        {
          num: 4,
          title: '多项填空',
          description: '',
          type_code: '1',
          options: 2,
          rows: 0,
          row_texts: [],
          option_texts: [],
          provider: 'wjx',
          provider_type: 'multi_text',
          is_description: false,
          is_text_like: true,
          is_multi_text: true,
          text_inputs: 2,
          text_input_labels: ['姓名', '手机号'],
        },
      ],
    }
    const multiText = setQuestionMultiTextBlankConfig(multiTextConfig, 4, ['name', 'mobile'], [true, false], ['1 - 2', '3 - 4'])

    expect(findQuestionEntry(aiEnabled, 1)?.ai_enabled).toBe(true)
    expect(findQuestionEntry(psychoBias, 1)?.psycho_bias).toBe('left')
    expect(findQuestionEntry(customWeights, 1)?.custom_weights).toEqual([1, 2, 3])
    expect(findQuestionEntry(textMode, 1)?.text_random_mode).toBe('integer')
    expect(findQuestionEntry(range, 1)?.text_random_int_range).toEqual([1, 9])
    expect(findQuestionEntry(location, 2)?.location_parts).toEqual(['浙江', '杭州', '西湖'])
    expect(findQuestionEntry(fillTexts, 2)?.option_fill_texts).toEqual(['A', null, 'C'])
    expect(findQuestionEntry(fillableOptions, 2)?.fillable_option_indices).toEqual([0, 1])
    expect(findQuestionEntry(attachedSelects, 1)?.attached_option_selects).toEqual([
      {
        option_index: 0,
        option_text: 'A',
        select_options: ['甲', '乙'],
      },
    ])
    expect(findQuestionEntry(multiText, 4)?.multi_text_blank_modes).toEqual(['name', 'mobile'])
    expect(findQuestionEntry(multiText, 4)?.multi_text_blank_ai_flags).toEqual([true, false])
    expect(findQuestionEntry(multiText, 4)?.multi_text_blank_int_ranges).toEqual([[1, 2], [3, 4]])
  })

  it('includes strategy editor extras in search text', () => {
    const entry = {
      question_type: 'single',
      probabilities: [1, 1],
      question_num: 1,
      fillable_option_indices: [0],
      attached_option_selects: [{ option_index: 0, option_text: 'A', select_options: ['甲'] }],
      multi_text_blank_modes: ['name'],
      multi_text_blank_ai_flags: [true],
      multi_text_blank_int_ranges: [[1, 9]],
    }

    expect(questionSearchText(config.questions_info?.[0], entry as never)).toContain('甲')
    expect(questionSearchText(config.questions_info?.[0], entry as never)).toContain('name')
    expect(questionSearchText(config.questions_info?.[0], entry as never)).toContain('1')
  })

  it('summarizes logic and media states', () => {
    expect(questionLogicSummary(config.questions_info?.[0])).toBe('无逻辑')
    expect(questionMediaSummary(config.questions_info?.[0])).toBe('无媒体')
    expect(questionSearchText(config.questions_info?.[0], findQuestionEntry(config, 1))).toContain('单选')
    expect(questionMediaItems(config.questions_info?.[1])).toHaveLength(1)
    expect(questionLogicDetails(config.questions_info?.[1], config.questions_info)).toEqual(
      expect.arrayContaining([
        '显示：第 1 题 选中 “B”',
        '跳转：“X” -> 第 4 题',
        '联动：“X” -> 显示第 3 题',
        '媒体：title · 题干图',
      ]),
    )
    expect(questionSearchText(config.questions_info?.[1], findQuestionEntry(config, 2))).toContain('题干图')
  })

  it('builds a question tree preview model', () => {
    const pages = buildQuestionTreePages(config)

    expect(pages).toHaveLength(1)
    expect(pages[0]?.nodes).toHaveLength(3)
    expect(pages[0]?.nodes[1]?.relations.map((item) => item.kind)).toEqual(expect.arrayContaining(['display', 'jump', 'control']))
  })

  it('builds search hits for the question list', () => {
    const hits = buildQuestionSearchHits(config, '题干图')

    expect(hits).toHaveLength(1)
    expect(hits[0]?.title).toContain('矩阵')
    expect(hits[0]?.searchText).toContain('题干图')
  })

  it('builds dimension selection rows', () => {
    const rows = buildDimensionQuestionRows(config)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      question_num: 1,
      title: expect.stringContaining('单选'),
      group_name: '服务',
    })
  })

  it('returns the full list when search is empty', () => {
    const hits = buildQuestionSearchHits(config, '')

    expect(hits).toHaveLength(2)
    expect(hits.map((item) => item.index)).toEqual([0, 1])
  })
})
