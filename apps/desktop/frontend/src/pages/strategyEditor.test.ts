import { describe, expect, it } from 'vitest'
import { createTestConfig, createTestQuestion, createTestQuestionEntry } from '../test/configFactory'
import {
  addDimensionGroup,
  buildDimensionQuestionRows,
  buildQuestionSearchHits,
  buildQuestionTreePages,
  createDefaultRule,
  deleteDimensionGroup,
  deleteRuleAtIndex,
  dimensionUsageCount,
  findQuestionEntry,
  getEligibleQuestions,
  moveQuestionsToDimension,
  normalizeRule,
  questionLogicDetails,
  questionLogicSummary,
  questionMediaItems,
  questionMediaSummary,
  questionSearchText,
  renameDimensionGroup,
  sanitizeDimensionGroups,
  setQuestionAiEnabled,
  setQuestionAttachedOptionSelects,
  setQuestionCustomWeights,
  setQuestionDimension,
  setQuestionFillableOptions,
  setQuestionLocationParts,
  setQuestionMultiTextBlankConfig,
  setQuestionOptionFillTexts,
  setQuestionPsychoBias,
  setQuestionTextRandomIntRange,
  setQuestionTextRandomMode,
  updateRuleAtIndex,
} from './strategy-editor'

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
      question.logic_parse_status = 'complete'
      question.has_jump = true
      question.jump_rules = [{ option_index: 0, jumpto: 4 }]
      question.has_display_condition = true
      question.display_conditions = [{
        condition_question_num: 1,
        condition_mode: 'selected',
        condition_option_indices: [1],
      }]
      question.has_dependent_display_logic = true
      question.controls_display_targets = [{
        target_question_num: 3,
        condition_mode: 'selected',
        condition_option_indices: [0],
      }]
      question.question_media = [{
        kind: 'image',
        scope: 'title',
        index: null,
        source_url: 'https://example.com/a.png',
        label: '题干图',
      }]
    }),
    createTestQuestion((question) => {
      question.num = 3
      question.title = '说明'
      question.type_code = '1'
      question.provider_type = 'text'
      question.options = 0
      question.option_texts = []
      question.is_description = true
      question.is_text_like = true
    }),
  ]
  value.answers.questions = [createTestQuestionEntry((entry) => {
    entry.dimension = '服务'
  })]
  value.answers.dimensions = ['服务']
  value.answers.rules = []
})

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
    expect(next.answers.rules).toHaveLength(1)
    expect(deleteRuleAtIndex(next, 0).answers.rules).toEqual([])
  })

  it('manages dimension groups and question dimensions', () => {
    const added = addDimensionGroup(config, '信任感')
    expect(added.answers.dimensions).toEqual(['服务', '信任感'])

    const renamed = renameDimensionGroup(added, '服务', '满意度')
    expect(renamed.answers.dimensions).toContain('满意度')
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
      { option_index: 0, option_text: 'A', select_texts: ['甲', '乙'] },
    ])
    const multiTextConfig = structuredClone(attachedSelects)
    multiTextConfig.survey.definition.questions = [
      ...(multiTextConfig.survey.definition.questions ?? []),
      createTestQuestion((question) => {
        question.num = 4
        question.title = '多项填空'
        question.type_code = '1'
        question.provider_type = 'multi_text'
        question.is_text_like = true
        question.is_multi_text = true
        question.options = 2
        question.text_inputs = 2
        question.text_input_labels = ['姓名', '手机号']
      }),
    ]
    const multiText = setQuestionMultiTextBlankConfig(
      multiTextConfig,
      4,
      ['name', 'mobile'],
      [true, false],
      ['1 - 2', '3 - 4'],
    )

    expect(findQuestionEntry(aiEnabled, 1)?.ai_enabled).toBe(true)
    expect(findQuestionEntry(psychoBias, 1)?.psycho_bias).toBe('left')
    expect(findQuestionEntry(customWeights, 1)?.custom_weights).toEqual({ options: [1, 2, 3] })
    expect(findQuestionEntry(textMode, 1)?.text_random_mode).toBe('integer')
    expect(findQuestionEntry(range, 1)?.text_random_int_range).toEqual([1, 9])
    expect(findQuestionEntry(location, 2)?.location_parts).toEqual(['浙江', '杭州', '西湖'])
    expect(findQuestionEntry(fillTexts, 2)?.option_fill_texts).toEqual(['A', null, 'C'])
    expect(findQuestionEntry(fillableOptions, 2)?.fillable_option_indices).toEqual([0, 1])
    expect(findQuestionEntry(attachedSelects, 1)?.attached_option_selects).toEqual([
      { option_index: 0, option_text: 'A', select_texts: ['甲', '乙'] },
    ])
    expect(findQuestionEntry(multiText, 4)?.multi_text_blank_modes).toEqual(['name', 'mobile'])
    expect(findQuestionEntry(multiText, 4)?.multi_text_blank_ai_flags).toEqual([true, false])
    expect(findQuestionEntry(multiText, 4)?.multi_text_blank_int_ranges).toEqual([[1, 2], [3, 4]])
  })

  it('includes strategy editor extras in search text', () => {
    const entry = createTestQuestionEntry((value) => {
      value.fillable_option_indices = [0]
      value.attached_option_selects = [{ option_index: 0, option_text: 'A', select_texts: ['甲'] }]
      value.multi_text_blank_modes = ['name']
      value.multi_text_blank_ai_flags = [true]
      value.multi_text_blank_int_ranges = [[1, 9]]
    })
    const question = config.survey.definition.questions?.[0]

    expect(questionSearchText(question, entry)).toContain('甲')
    expect(questionSearchText(question, entry)).toContain('name')
    expect(questionSearchText(question, entry)).toContain('1')
  })

  it('summarizes logic and media states', () => {
    const questions = config.survey.definition.questions ?? []
    expect(questionLogicSummary(questions[0])).toBe('无逻辑')
    expect(questionMediaSummary(questions[0])).toBe('无媒体')
    expect(questionSearchText(questions[0], findQuestionEntry(config, 1))).toContain('单选')
    expect(questionMediaItems(questions[1])).toHaveLength(1)
    expect(questionLogicDetails(questions[1], questions)).toEqual(expect.arrayContaining([
      '显示：第 1 题 选中 “B”',
      '跳转：“X” -> 第 4 题',
      '联动：“X” -> 显示第 3 题',
      '媒体：title · 题干图',
    ]))
    expect(questionSearchText(questions[1], findQuestionEntry(config, 2))).toContain('题干图')
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
