import { QuestionKind } from '../../../bindings/surveycontroller/surveycore/internal/model/models'
import type {
  AttachedOptionSelect,
  ConfigDocument,
  QuestionEntry,
  QuestionMeta,
  WeightTable,
} from '../../types'
import {
  cloneStrategyDocument,
  normalizeDimensionName,
  sanitizeDimensionGroups,
  uniqueSortedIndices,
} from './document'
import {
  fillArray,
  normalizeAttachedOptionSelects,
  normalizeIntRange,
  normalizeWeight,
  parseIntRange,
  parseNumberList,
} from './questionDraftParsing'

export {
  fillBoolArray,
  fillRangeArray,
  fillTextArray,
  formatAttachedOptionSelects,
  formatWeightTable,
  parseAttachedOptionSelects,
} from './questionDraftParsing'

export function setQuestionAiEnabled(config: ConfigDocument, questionNum: number, enabled: boolean): ConfigDocument {
  return updateQuestionEntry(config, questionNum, { ai_enabled: enabled })
}

export function setQuestionPsychoBias(config: ConfigDocument, questionNum: number, bias: string): ConfigDocument {
  return updateQuestionEntry(config, questionNum, { psycho_bias: normalizePsychoBias(bias) })
}

export function setQuestionCustomWeights(config: ConfigDocument, questionNum: number, value: string): ConfigDocument {
  const weights = parseNumberList(value)
  return updateQuestionEntry(config, questionNum, {
    custom_weights: weights.length ? { options: weights } : undefined,
  })
}

export function setQuestionTextRandomMode(config: ConfigDocument, questionNum: number, mode: string): ConfigDocument {
  return updateQuestionEntry(config, questionNum, { text_random_mode: normalizeTextRandomMode(mode) })
}

export function setQuestionTextRandomIntRange(config: ConfigDocument, questionNum: number, value: string): ConfigDocument {
  return updateQuestionEntry(config, questionNum, { text_random_int_range: parseIntRange(value) })
}

export function setQuestionLocationParts(config: ConfigDocument, questionNum: number, parts: string[]): ConfigDocument {
  return updateQuestionEntry(config, questionNum, { location_parts: normalizeTextList(parts, 3) })
}

export function setQuestionOptionFillTexts(config: ConfigDocument, questionNum: number, texts: string[]): ConfigDocument {
  const values = texts.map((item) => item.trim() || null)
  return updateQuestionEntry(config, questionNum, { option_fill_texts: values.length ? values : null })
}

export function setQuestionFillableOptions(config: ConfigDocument, questionNum: number, indices: number[]): ConfigDocument {
  return updateQuestionEntry(config, questionNum, { fillable_option_indices: uniqueSortedIndices(indices) })
}

export function setQuestionAttachedOptionSelects(
  config: ConfigDocument,
  questionNum: number,
  items: AttachedOptionSelect[],
): ConfigDocument {
  return updateQuestionEntry(config, questionNum, { attached_option_selects: normalizeAttachedOptionSelects(items) })
}

export function setQuestionMultiTextBlankConfig(
  config: ConfigDocument,
  questionNum: number,
  modes: string[],
  aiFlags: boolean[],
  intRanges: string[],
): ConfigDocument {
  const count = Math.max(modes.length, aiFlags.length, intRanges.length)
  return updateQuestionEntry(config, questionNum, {
    multi_text_blank_modes: normalizeMultiTextBlankModes(modes, count),
    multi_text_blank_ai_flags: normalizeMultiTextBlankAIFlags(aiFlags, count),
    multi_text_blank_int_ranges: normalizeMultiTextBlankIntRanges(intRanges.map(parseIntRange), count),
  })
}

export function updateQuestionEntry(
  config: ConfigDocument,
  questionNum: number,
  patch: Partial<QuestionEntry>,
): ConfigDocument {
  const next = cloneStrategyDocument(config)
  const question = (next.survey.definition.questions ?? []).find((item) => item.num === questionNum)
  if (!question) return next

  const entries = [...(next.answers.questions ?? [])]
  const index = entries.findIndex((entry) => entry.question_num === questionNum)
  const base = index >= 0 ? entries[index] : createEntryFromQuestion(question, '')
  const merged = normalizeQuestionEntry({
    ...base,
    ...patch,
    question_num: questionNum,
    question_title: base.question_title || question.title,
    survey_provider: base.survey_provider || question.provider,
  }, question)
  if (index >= 0) entries[index] = merged
  else entries.push(merged)
  next.answers.questions = entries
  next.answers.dimensions = sanitizeDimensionGroups(next)
  return next
}

function createEntryFromQuestion(question: QuestionMeta, dimension: string): QuestionEntry {
  const optionCount = Math.max(1, question.options || 1)
  const blankCount = Math.max(1, question.text_inputs || 0)
  const isMultiText = question.is_multi_text || blankCount > 1
  return {
    question_type: questionKind(question),
    probabilities: { options: Array.from({ length: optionCount }, () => 1) },
    rows: question.rows,
    option_count: optionCount,
    distribution_mode: 'random',
    question_num: question.num,
    question_title: question.title,
    survey_provider: question.provider,
    provider_question_id: question.provider_question_id,
    provider_page_id: question.provider_page_id,
    dimension,
    psycho_bias: 'custom',
    fillable_option_indices: uniqueSortedIndices(question.fillable_options, optionCount),
    attached_option_selects: normalizeAttachedOptionSelects(question.attached_option_selects ?? []),
    multi_text_blank_modes: isMultiText ? inferMultiTextBlankModes(question, blankCount) : [],
    multi_text_blank_ai_flags: isMultiText ? Array.from({ length: blankCount }, () => false) : [],
    multi_text_blank_int_ranges: isMultiText ? Array.from({ length: blankCount }, () => []) : [],
  }
}

function normalizeQuestionEntry(entry: QuestionEntry, question: QuestionMeta): QuestionEntry {
  const optionCount = Math.max(0, entry.option_count ?? 0, question.options)
  const blankCount = Math.max(
    0,
    question.text_inputs,
    entry.multi_text_blank_modes?.length ?? 0,
    entry.multi_text_blank_ai_flags?.length ?? 0,
    entry.multi_text_blank_int_ranges?.length ?? 0,
  )
  const isMultiText = question.is_multi_text || entry.question_type === QuestionKind.QuestionKindMultiText || blankCount > 1
  return {
    ...entry,
    question_type: entry.question_type || questionKind(question),
    probabilities: normalizeWeightTable(entry.probabilities, optionCount),
    custom_weights: entry.custom_weights ? normalizeWeightTable(entry.custom_weights, optionCount) : undefined,
    dimension: normalizeDimensionName(entry.dimension),
    text_random_mode: normalizeTextRandomMode(entry.text_random_mode),
    text_random_int_range: normalizeIntRange(entry.text_random_int_range),
    location_parts: normalizeTextList(entry.location_parts ?? [], 3),
    option_fill_texts: normalizeNullableTextList(entry.option_fill_texts),
    fillable_option_indices: uniqueSortedIndices(entry.fillable_option_indices, optionCount),
    attached_option_selects: normalizeAttachedOptionSelects(entry.attached_option_selects ?? []),
    multi_text_blank_modes: isMultiText ? normalizeMultiTextBlankModes(entry.multi_text_blank_modes ?? [], blankCount, question) : [],
    multi_text_blank_ai_flags: isMultiText ? normalizeMultiTextBlankAIFlags(entry.multi_text_blank_ai_flags ?? [], blankCount) : [],
    multi_text_blank_int_ranges: isMultiText ? normalizeMultiTextBlankIntRanges(entry.multi_text_blank_int_ranges ?? [], blankCount) : [],
  }
}

function questionKind(question: QuestionMeta): QuestionKind {
  const type = (question.provider_type || question.type_code).toLowerCase()
  if (['single', 'radio', '3'].includes(type)) return QuestionKind.QuestionKindSingle
  if (['multiple', 'checkbox', '4'].includes(type)) return QuestionKind.QuestionKindMultiple
  if (['dropdown', 'select', '7'].includes(type)) return QuestionKind.QuestionKindDropdown
  if (['scale', '5'].includes(type)) return QuestionKind.QuestionKindScale
  if (['matrix', 'matrix_radio', '6'].includes(type)) return QuestionKind.QuestionKindMatrix
  if (type === 'order') return QuestionKind.QuestionKindOrder
  if (type === 'slider') return QuestionKind.QuestionKindSlider
  if (type === 'multi_text' || question.is_multi_text) return QuestionKind.QuestionKindMultiText
  return QuestionKind.QuestionKindText
}

function normalizeWeightTable(value: WeightTable, optionCount: number): WeightTable {
  if (value.rows?.length) {
    return { rows: value.rows.map((row) => (row ?? []).map(normalizeWeight)) }
  }
  const options = value.options?.map(normalizeWeight) ?? []
  return { options: options.length ? options : Array.from({ length: Math.max(1, optionCount) }, () => 1) }
}

function normalizeMultiTextBlankModes(value: string[], count: number, question?: QuestionMeta): string[] {
  const inferred = question ? inferMultiTextBlankModes(question, count) : []
  const normalized = value.map((item, index) => normalizeTextRandomMode(item) || inferred[index] || '')
  return fillArray(normalized, count, '').slice(0, count)
}

function normalizeMultiTextBlankAIFlags(value: boolean[], count: number): boolean[] {
  return fillArray(value.map(Boolean), count, false).slice(0, count)
}

function normalizeMultiTextBlankIntRanges(value: (number[] | null)[], count: number): (number[] | null)[] {
  return fillArray(value.map(normalizeIntRange), count, null).slice(0, count)
}

function inferMultiTextBlankModes(question: QuestionMeta, count: number): string[] {
  const labels = question.text_input_labels ?? []
  return Array.from({ length: count }, (_, index) => {
    const text = (labels[index] || (count <= 1 ? question.title : '')).replace(/\s+/g, '').toLowerCase()
    if (['手机号', '手机号码', '手机', '电话', '联系电话', '联系方式'].some((marker) => text.includes(marker))) return 'mobile'
    if (['身份证', '证件号', '证件号码'].some((marker) => text.includes(marker))) return 'id_card'
    if (['姓名', '名字', '联系人'].some((marker) => text.includes(marker))) return 'name'
    return ''
  })
}

function normalizePsychoBias(value: string): string {
  return ['left', 'center', 'right', 'custom'].includes(value.trim().toLowerCase()) ? value.trim().toLowerCase() : 'custom'
}

function normalizeTextRandomMode(value?: string): string {
  const mode = value?.trim().toLowerCase() ?? ''
  return ['name', 'mobile', 'id_card', 'integer'].includes(mode) ? mode : ''
}

function normalizeTextList(values: string[], limit: number): string[] {
  return values.map((item) => item.trim()).filter(Boolean).slice(0, limit)
}

function normalizeNullableTextList(values?: (string | null)[] | null): (string | null)[] | null {
  if (!values) return values ?? null
  const normalized = values.map((item) => item?.trim() || null)
  return normalized.length ? normalized : null
}
