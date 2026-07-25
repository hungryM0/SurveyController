import type { ConfigDocument, QuestionMediaItem, QuestionMeta } from '../../types'
import { optionalIndex, positiveInt } from './document'
import type { QuestionTreeRelation } from './questionNavigation'

const ruleQuestionTypes = new Set(['3', '4', '5', '6', 'single', 'multiple', 'scale', 'matrix', 'matrix_radio', 'radio', 'checkbox'])

export function getEligibleQuestions(config: ConfigDocument): QuestionMeta[] {
  return (config.survey.definition.questions ?? []).filter(isEligibleQuestion)
}

export function getDimensionEligibleQuestions(config: ConfigDocument): QuestionMeta[] {
  return (config.survey.definition.questions ?? []).filter(questionSupportsDimensionGrouping)
}

export function isEligibleQuestion(question: QuestionMeta): boolean {
  if (question.is_description) return false
  return ruleQuestionTypes.has(question.provider_type.trim()) || ruleQuestionTypes.has(question.type_code.trim())
}

export function isMatrixQuestion(question: QuestionMeta | undefined): question is QuestionMeta {
  return Boolean(question && (question.provider_type === 'matrix' || question.provider_type === 'matrix_radio' || question.type_code === '6'))
}

export function questionSupportsDimensionGrouping(question: QuestionMeta | undefined): boolean {
  if (!question || question.is_description) return false
  const type = (question.provider_type || question.type_code).trim().toLowerCase()
  return ['scale', 'score', 'matrix', 'matrix_radio', 'single'].includes(type)
}

export function questionTitle(question: QuestionMeta | undefined): string {
  if (!question) return '未命名题目'
  return question.title.trim() || `第 ${question.num} 题`
}

export function questionTypeLabel(question: QuestionMeta | undefined): string {
  if (!question) return '题目'
  switch (question.provider_type || question.type_code) {
    case 'single': case 'radio': case '3': return '单选题'
    case 'multiple': case 'checkbox': case '4': return '多选题'
    case 'scale': case '5': return '量表题'
    case 'matrix': case 'matrix_radio': case '6': return '矩阵题'
    default: return '题目'
  }
}

export function questionLabel(question: QuestionMeta | undefined): string {
  return `${questionTitle(question)} · ${questionTypeLabel(question)}`
}

export function questionLogicSummary(question: QuestionMeta | undefined): string {
  if (!question) return '无逻辑'
  const segments: string[] = []
  if (question.display_conditions?.length) segments.push(`显示 ${question.display_conditions.length}`)
  if (question.jump_rules?.length) segments.push(`跳转 ${question.jump_rules.length}`)
  if (question.controls_display_targets?.length) segments.push(`联动 ${question.controls_display_targets.length}`)
  return segments.length ? segments.join(' / ') : '无逻辑'
}

export function questionMediaSummary(question: QuestionMeta | undefined): string {
  const count = question?.question_media?.length ?? 0
  return count ? `媒体 ${count}` : '无媒体'
}

export function questionMediaItems(question: QuestionMeta | undefined): QuestionMediaItem[] {
  return (question?.question_media ?? [])
    .map((item) => ({
      ...item,
      kind: item.kind.trim(),
      scope: item.scope.trim(),
      index: optionalIndex(item.index),
      source_url: item.source_url.trim(),
      label: item.label.trim(),
    }))
    .filter((item) => Boolean(item.source_url || item.label))
}

export function questionLogicDetails(question: QuestionMeta | undefined, allQuestions?: QuestionMeta[]): string[] {
  if (!question) return []
  const lookup = createQuestionLookup(allQuestions)
  const details: string[] = []
  for (const item of question.display_conditions ?? []) {
    const source = positiveInt(item.condition_question_num)
    if (!source) continue
    const mode = item.condition_mode === 'not_selected' ? '未选中' : '选中'
    details.push(`显示：第 ${source} 题 ${mode} ${formatOptionIndices(item.condition_option_indices, questionOptionLabels(lookup.get(source)))}`)
  }
  for (const item of question.jump_rules ?? []) {
    const target = positiveInt(item.jumpto)
    if (!target) continue
    details.push(`跳转：${formatOptionIndices([item.option_index], questionOptionLabels(question))} -> 第 ${target} 题`)
  }
  for (const item of question.controls_display_targets ?? []) {
    const target = positiveInt(item.target_question_num)
    if (!target) continue
    details.push(`联动：${formatOptionIndices(item.condition_option_indices, questionOptionLabels(question))} -> 显示第 ${target} 题`)
  }
  for (const item of questionMediaItems(question)) {
    details.push(`媒体：${[item.scope || '媒体', item.label].filter(Boolean).join(' · ')}`)
  }
  return details
}

export function questionRelationItems(
  question: QuestionMeta | undefined,
  allQuestions?: Map<number, QuestionMeta> | QuestionMeta[],
): QuestionTreeRelation[] {
  if (!question) return []
  const lookup = allQuestions instanceof Map ? allQuestions : createQuestionLookup(allQuestions)
  const items: QuestionTreeRelation[] = []
  const maxQuestionNum = Math.max(0, ...lookup.keys())
  for (const item of question.display_conditions ?? []) {
    const source = positiveInt(item.condition_question_num)
    if (!source) continue
    items.push({
      kind: 'display',
      label: `显示 ${source} 题：${formatOptionIndices(item.condition_option_indices, questionOptionLabels(lookup.get(source)))}`,
      target_question_num: source,
      target_index: lookup.has(source) ? source - 1 : null,
      selectable: lookup.has(source),
      ends_flow: false,
    })
  }
  for (const item of question.jump_rules ?? []) {
    const target = positiveInt(item.jumpto)
    if (!target) continue
    items.push({
      kind: 'jump',
      label: `跳转 ${formatOptionIndices([item.option_index], questionOptionLabels(question))} -> ${target > maxQuestionNum ? '结束' : `第 ${target} 题`}`,
      target_question_num: target,
      target_index: lookup.has(target) ? target - 1 : null,
      selectable: lookup.has(target) && target <= maxQuestionNum,
      ends_flow: target > maxQuestionNum,
    })
  }
  for (const item of question.controls_display_targets ?? []) {
    const target = positiveInt(item.target_question_num)
    if (!target) continue
    items.push({
      kind: 'control',
      label: `联动 ${formatOptionIndices(item.condition_option_indices, questionOptionLabels(question))} -> 第 ${target} 题`,
      target_question_num: target,
      target_index: lookup.has(target) ? target - 1 : null,
      selectable: lookup.has(target),
      ends_flow: false,
    })
  }
  return items
}

export function questionOptionLabels(question: QuestionMeta | undefined): string[] {
  if (!question) return []
  const labels = (question.option_texts ?? []).map((item, index) => item.trim() || `选项 ${index + 1}`)
  return labels.length ? labels : Array.from({ length: Math.max(0, question.options) }, (_, index) => `选项 ${index + 1}`)
}

export function questionRowLabels(question: QuestionMeta | undefined): string[] {
  if (!isMatrixQuestion(question)) return []
  const labels = (question.row_texts ?? []).map((item, index) => item.trim() || `第 ${index + 1} 行`)
  return labels.length ? labels : Array.from({ length: Math.max(0, question.rows) }, (_, index) => `第 ${index + 1} 行`)
}

function createQuestionLookup(questions?: QuestionMeta[]): Map<number, QuestionMeta> {
  return new Map((questions ?? []).filter((item) => item.num > 0).map((item) => [item.num, item]))
}

function formatOptionIndices(values: number[] | null, optionTexts?: string[]): string {
  const indices = (values ?? []).filter((item) => Number.isFinite(item) && item >= 0).slice(0, 4)
  if (!indices.length) return '指定选项'
  return indices.map((index) => formatOptionIndex(Math.trunc(index), optionTexts)).join('、')
}

function formatOptionIndex(index: number, optionTexts?: string[]): string {
  const text = optionTexts?.[index]?.trim()
  return text ? `“${text}”` : `第 ${index + 1} 项`
}
