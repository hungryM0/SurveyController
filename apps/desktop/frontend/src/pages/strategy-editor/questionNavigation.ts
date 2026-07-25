import type { ConfigDocument, QuestionEntry, QuestionMeta } from '../../types'
import { findQuestionEntry, positiveInt } from './document'
import {
  getEligibleQuestions,
  questionLabel,
  questionLogicDetails,
  questionLogicSummary,
  questionMediaItems,
  questionMediaSummary,
  questionOptionLabels,
  questionRelationItems,
  questionRowLabels,
  questionTitle,
  questionTypeLabel,
} from './questions'

export interface QuestionTreeRelation {
  kind: 'display' | 'jump' | 'control'
  label: string
  target_question_num: number
  target_index: number | null
  selectable: boolean
  ends_flow: boolean
}

export interface QuestionTreeNode {
  index: number
  page: number
  question: QuestionMeta
  entry?: QuestionEntry
  label: string
  summary: string
  relations: QuestionTreeRelation[]
}

export interface QuestionTreePage {
  page: number
  nodes: QuestionTreeNode[]
}

export interface QuestionSearchHit {
  index: number
  title: string
  detail: string
  searchText: string
}

export function buildQuestionTreePages(config: ConfigDocument): QuestionTreePage[] {
  const questions = [...(config.survey.definition.questions ?? [])].sort((left, right) => left.num - right.num)
  const lookup = createQuestionLookup(questions)
  const pages = new Map<number, QuestionTreePage>()
  questions.forEach((question, index) => {
    const page = positiveInt(question.page, 1)
    const node: QuestionTreeNode = {
      index,
      page,
      question,
      entry: findQuestionEntry(config, question.num),
      label: questionLabel(question),
      summary: `${questionMediaSummary(question)} · ${questionLogicSummary(question)}`,
      relations: questionRelationItems(question, lookup),
    }
    const group = pages.get(page) ?? { page, nodes: [] }
    group.nodes.push(node)
    pages.set(page, group)
  })
  return [...pages.values()].sort((left, right) => left.page - right.page)
}

export function buildQuestionSearchHits(config: ConfigDocument, keyword: string): QuestionSearchHit[] {
  const questions = getEligibleQuestions(config)
  const normalized = normalizeSearchText(keyword)
  return questions
    .map((question, index) => ({
      index,
      title: questionLabel(question),
      detail: questionLogicSummary(question),
      searchText: questionSearchText(question, findQuestionEntry(config, question.num), questions),
    }))
    .filter((item) => !normalized || item.searchText.includes(normalized))
}

export function questionSearchText(question: QuestionMeta | undefined, entry?: QuestionEntry, allQuestions?: QuestionMeta[]): string {
  const chunks: string[] = []
  if (question) {
    chunks.push(questionTitle(question), questionTypeLabel(question))
    chunks.push(...questionOptionLabels(question), ...questionRowLabels(question))
    chunks.push(questionLogicSummary(question), questionMediaSummary(question))
    chunks.push(...questionLogicDetails(question, allQuestions))
    chunks.push(...questionMediaItems(question).flatMap((item) => [item.label, item.source_url]))
  }
  if (entry) {
    chunks.push(entry.dimension ?? '', entry.psycho_bias ?? '', entry.text_random_mode ?? '')
    chunks.push(...(entry.fillable_option_indices ?? []).map((value) => String(value + 1)))
    chunks.push(...(entry.option_fill_texts ?? []).filter((value): value is string => Boolean(value)))
    for (const item of entry.attached_option_selects ?? []) {
      chunks.push(item.option_text, ...(item.select_texts ?? []))
    }
    chunks.push(...(entry.multi_text_blank_modes ?? []))
    chunks.push(...(entry.multi_text_blank_ai_flags ?? []).map((value, index) => `${index + 1}${value ? '启用' : '关闭'}`))
    for (const range of entry.multi_text_blank_int_ranges ?? []) {
      if (range?.length) chunks.push(range.join('-'))
    }
    chunks.push(...(entry.location_parts ?? []))
  }
  return normalizeSearchText(chunks.join(' '))
}

function createQuestionLookup(questions?: QuestionMeta[]): Map<number, QuestionMeta> {
  return new Map((questions ?? []).filter((item) => item.num > 0).map((item) => [item.num, item]))
}

function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '')
}
