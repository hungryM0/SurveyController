import type { ConfigDocument } from '../../types'
import { cloneStrategyDocument, normalizeDimensionName, sanitizeDimensionGroups } from './document'
import { updateQuestionEntry } from './questionDraft'
import { getDimensionEligibleQuestions, questionLabel, questionSupportsDimensionGrouping, questionTypeLabel } from './questions'

export interface DimensionQuestionRow {
  index: number
  question_num: number
  title: string
  type_label: string
  group_name: string
  bias_text: string
}

export function buildDimensionQuestionRows(config: ConfigDocument): DimensionQuestionRow[] {
  const questions = getDimensionEligibleQuestions(config)
  const entries = config.answers.questions ?? []
  return questions.map((question, index) => {
    const entry = entries.find((item) => item.question_num === question.num)
    return {
      index,
      question_num: question.num,
      title: questionLabel(question),
      type_label: questionTypeLabel(question),
      group_name: entry?.dimension ?? '',
      bias_text: entry?.psycho_bias ?? 'custom',
    }
  })
}

export function addDimensionGroup(config: ConfigDocument, name: string): ConfigDocument {
  const next = cloneStrategyDocument(config)
  const groups = sanitizeDimensionGroups(next)
  const normalized = normalizeDimensionName(name)
  if (normalized && !groups.includes(normalized)) groups.push(normalized)
  next.answers.dimensions = groups
  return next
}

export function renameDimensionGroup(config: ConfigDocument, oldName: string, nextName: string): ConfigDocument {
  const current = normalizeDimensionName(oldName)
  const normalized = normalizeDimensionName(nextName)
  const next = cloneStrategyDocument(config)
  if (!current || !normalized || current === normalized) return next
  next.answers.questions = (next.answers.questions ?? []).map((entry) =>
    normalizeDimensionName(entry.dimension) === current ? { ...entry, dimension: normalized } : entry,
  )
  next.answers.dimensions = sanitizeDimensionGroups({
    ...next,
    answers: {
      ...next.answers,
      dimensions: (next.answers.dimensions ?? []).filter((item) => normalizeDimensionName(item) !== current),
    },
  })
  return next
}

export function deleteDimensionGroup(config: ConfigDocument, name: string): ConfigDocument {
  const current = normalizeDimensionName(name)
  const next = cloneStrategyDocument(config)
  if (!current) return next
  next.answers.questions = (next.answers.questions ?? []).map((entry) =>
    normalizeDimensionName(entry.dimension) === current ? { ...entry, dimension: '' } : entry,
  )
  next.answers.dimensions = sanitizeDimensionGroups({
    ...next,
    answers: {
      ...next.answers,
      dimensions: (next.answers.dimensions ?? []).filter((item) => normalizeDimensionName(item) !== current),
    },
  })
  return next
}

export function setQuestionDimension(config: ConfigDocument, questionNum: number, dimension: string): ConfigDocument {
  return updateQuestionEntry(config, questionNum, { dimension: normalizeDimensionName(dimension) })
}

export function moveQuestionsToDimension(config: ConfigDocument, questionNums: number[], dimension: string): ConfigDocument {
  return questionNums.reduce(
    (current, questionNum) => setQuestionDimension(current, questionNum, dimension),
    cloneStrategyDocument(config),
  )
}

export function questionDimensionMap(config: ConfigDocument): Map<number, string> {
  return new Map((config.answers.questions ?? [])
    .filter((entry) => Boolean(entry.question_num))
    .map((entry) => [entry.question_num as number, normalizeDimensionName(entry.dimension)]))
}

export function dimensionUsageCount(config: ConfigDocument, name: string): number {
  const target = normalizeDimensionName(name)
  return target
    ? (config.answers.questions ?? []).filter((entry) => normalizeDimensionName(entry.dimension) === target).length
    : 0
}

export { sanitizeDimensionGroups, questionSupportsDimensionGrouping }
