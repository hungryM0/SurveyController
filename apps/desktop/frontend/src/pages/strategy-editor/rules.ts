import type { ConfigDocument, ConsistencyRule } from '../../types'
import { cloneStrategyDocument, optionalIndex, uniqueSortedIndices } from './document'
import { getEligibleQuestions, isMatrixQuestion, questionOptionLabels } from './questions'

export type StrategyRuleRecord = ConsistencyRule
export type StrategyRuleInput = Partial<ConsistencyRule>

export interface RuleDraft {
  condition_question_num: number
  condition_mode: 'selected' | 'not_selected'
  condition_option_indices: number[]
  condition_row_index?: number
  target_question_num: number
  action_mode: 'must_select' | 'must_not_select'
  target_option_indices: number[]
  target_row_index?: number
}

export function createDefaultRule(config: ConfigDocument): StrategyRuleRecord {
  const questions = getEligibleQuestions(config)
  const source = questions[0]
  const target = questions[1] ?? source
  const rule: StrategyRuleRecord = {
    condition_question_num: source?.num ?? 1,
    condition_mode: 'selected',
    condition_option_indices: questionOptionLabels(source).length ? [0] : [],
    target_question_num: target?.num ?? 1,
    action_mode: 'must_select',
    target_option_indices: questionOptionLabels(target).length ? [0] : [],
  }
  if (isMatrixQuestion(source)) rule.condition_row_index = 0
  if (isMatrixQuestion(target)) rule.target_row_index = 0
  return rule
}

export function normalizeRule(rule: StrategyRuleInput): StrategyRuleRecord {
  const conditionRow = optionalIndex(rule.condition_row_index)
  const targetRow = optionalIndex(rule.target_row_index)
  return {
    id: rule.id,
    condition_question_num: positive(rule.condition_question_num),
    condition_mode: rule.condition_mode === 'not_selected' ? 'not_selected' : 'selected',
    condition_option_indices: uniqueSortedIndices(rule.condition_option_indices),
    condition_row_index: conditionRow,
    target_question_num: positive(rule.target_question_num),
    action_mode: rule.action_mode === 'must_not_select' ? 'must_not_select' : 'must_select',
    target_option_indices: uniqueSortedIndices(rule.target_option_indices),
    target_row_index: targetRow,
  }
}

export function formatRuleLabel(rule: StrategyRuleRecord, index: number): string {
  const source = rule.condition_question_num > 0 ? `第 ${rule.condition_question_num} 题` : `规则 ${index + 1}`
  const condition = rule.condition_mode === 'not_selected' ? '未选中' : '选中'
  const action = rule.action_mode === 'must_not_select' ? '不得选择' : '必须选择'
  return `${source} · ${condition} → ${action}`
}

export function formatRuleTargets(rule: StrategyRuleRecord): string {
  return formatIndices(rule.target_option_indices)
}

export function formatRuleConditions(rule: StrategyRuleRecord): string {
  return formatIndices(rule.condition_option_indices)
}

export function updateRuleAtIndex(
  config: ConfigDocument,
  index: number,
  rule: StrategyRuleInput,
): ConfigDocument {
  const next = cloneStrategyDocument(config)
  const rules = [...(next.answers.rules ?? [])]
  if (index >= 0 && index < rules.length) rules[index] = normalizeRule(rule)
  else rules.push(normalizeRule(rule))
  next.answers.rules = rules
  return next
}

export function deleteRuleAtIndex(config: ConfigDocument, index: number): ConfigDocument {
  const next = cloneStrategyDocument(config)
  const rules = [...(next.answers.rules ?? [])]
  if (index >= 0 && index < rules.length) rules.splice(index, 1)
  next.answers.rules = rules
  return next
}

function positive(value?: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.trunc(value as number) : 0
}

function formatIndices(values: number[] | null): string {
  const items = uniqueSortedIndices(values).map((item) => String(item + 1))
  return items.length ? items.join('、') : '-'
}
