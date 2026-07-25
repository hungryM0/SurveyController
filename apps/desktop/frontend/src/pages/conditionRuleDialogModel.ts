import type { ConfigDocument, QuestionMeta } from '../types'
import {
  createDefaultRule,
  getEligibleQuestions,
  isMatrixQuestion,
  normalizeRule,
  questionLabel,
  questionOptionLabels,
  questionRowLabels,
  type RuleDraft,
  type StrategyRuleRecord,
} from './strategy-editor'

export function createConditionRuleDraft(config: ConfigDocument, rule?: StrategyRuleRecord | null): RuleDraft {
  return toDraft(rule ? normalizeRule(rule) : createDefaultRule(config))
}

export function validateConditionRuleDraft(draft: RuleDraft, questions: QuestionMeta[]): string | null {
  const conditionQuestion = questions.find((question) => question.num === draft.condition_question_num)
  const targetQuestion = questions.find((question) => question.num === draft.target_question_num)
  if (!conditionQuestion) {
    return '请先选择条件题目'
  }
  if (!targetQuestion) {
    return '请先选择目标题目'
  }
  if (draft.condition_question_num === draft.target_question_num) {
    return '条件题目和目标题目不能是同一题'
  }
  if (draft.condition_question_num >= draft.target_question_num) {
    return '仅支持前置条件：条件题号必须小于目标题号'
  }
  if (isMatrixQuestion(conditionQuestion) && draft.condition_row_index === undefined) {
    return '请先选择条件行'
  }
  if (isMatrixQuestion(targetQuestion) && draft.target_row_index === undefined) {
    return '请先选择目标行'
  }
  if (!draft.condition_option_indices.length) {
    return '请至少勾选一个条件选项'
  }
  if (!draft.target_option_indices.length) {
    return '请至少勾选一个目标选项'
  }
  return null
}

export function buildRuleQuestionOptions(config: ConfigDocument): Array<{ label: string, value: string }> {
  return getEligibleQuestions(config).map((question) => ({
    label: questionLabel(question),
    value: String(question.num),
  }))
}

export function buildRuleRowOptions(question: QuestionMeta | undefined): Array<{ label: string, value: string }> {
  if (!question || !isMatrixQuestion(question)) {
    return []
  }
  return questionRowLabels(question).map((label, index) => ({
    label,
    value: String(index),
  }))
}

export function buildRuleOptionLabels(question: QuestionMeta | undefined): string[] {
  return questionOptionLabels(question)
}

function toDraft(rule: StrategyRuleRecord): RuleDraft {
  return {
    condition_question_num: Number(rule.condition_question_num || 0),
    condition_mode: String(rule.condition_mode || 'selected') === 'not_selected' ? 'not_selected' : 'selected',
    condition_option_indices: Array.isArray(rule.condition_option_indices)
      ? rule.condition_option_indices.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item >= 0)
      : [],
    condition_row_index: rule.condition_row_index === undefined ? undefined : Number(rule.condition_row_index),
    target_question_num: Number(rule.target_question_num || 0),
    action_mode: String(rule.action_mode || 'must_select') === 'must_not_select' ? 'must_not_select' : 'must_select',
    target_option_indices: Array.isArray(rule.target_option_indices)
      ? rule.target_option_indices.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item >= 0)
      : [],
    target_row_index: rule.target_row_index === undefined ? undefined : Number(rule.target_row_index),
  }
}
