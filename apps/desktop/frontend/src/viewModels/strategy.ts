import type { ConfigDocument, ConsistencyRule, StrategyRule } from '../types'

export function mapStrategyRules(config: ConfigDocument): StrategyRule[] {
  return (config.answers.rules ?? []).map((rule, index) => ({
    condition: conditionLabel(rule, index),
    action: rule.action_mode === 'must_not_select' ? '不得选择' : '必须选择',
    target: targetLabel(rule),
  }))
}

export function mapDimensionGroups(config: ConfigDocument): string[] {
  const groups = new Set<string>()
  for (const item of config.answers.dimensions ?? []) {
    const text = item.trim()
    if (text) groups.add(text)
  }
  for (const entry of config.answers.questions ?? []) {
    const text = entry.dimension?.trim() ?? ''
    if (text) groups.add(text)
  }
  return [...groups]
}

function conditionLabel(rule: ConsistencyRule, index: number): string {
  if (!Number.isFinite(rule.condition_question_num) || rule.condition_question_num <= 0) {
    return `规则 ${index + 1}`
  }
  return `第 ${rule.condition_question_num} 题${rowLabel(rule.condition_row_index)} ${rule.condition_mode === 'not_selected' ? '未选中' : '选中'} ${optionIndicesLabel(rule.condition_option_indices)}`
}

function targetLabel(rule: ConsistencyRule): string {
  const options = optionIndicesLabel(rule.target_option_indices)
  if (!Number.isFinite(rule.target_question_num) || rule.target_question_num <= 0) {
    return options
  }
  return `第 ${rule.target_question_num} 题${rowLabel(rule.target_row_index)} ${options}`
}

function optionIndicesLabel(values: number[] | null): string {
  if (!values?.length) return '-'
  return values.filter((item) => item >= 0).map((item) => String(item + 1)).join('、') || '-'
}

function rowLabel(value?: number | null): string {
  return value === undefined || value === null || value < 0 ? '' : `第 ${value + 1} 行`
}
