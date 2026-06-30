import type { QuestionEntry, QuestionMediaItem, QuestionMeta, RuntimeConfig } from '../types'

export type StrategyRuleRecord = Record<string, unknown>
export type StrategyRuleInput = Partial<RuleDraft> & StrategyRuleRecord

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

export interface DimensionQuestionRow {
  index: number
  question_num: number
  title: string
  type_label: string
  group_name: string
  bias_text: string
}

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

const ruleQuestionTypes = new Set(['3', '4', '5', '6', 'single', 'multiple', 'scale', 'matrix', 'matrix_radio', 'radio', 'checkbox'])

export function getEligibleQuestions(config: RuntimeConfig): QuestionMeta[] {
  return (config.questions_info ?? []).filter((question) => isEligibleQuestion(question))
}

export function getDimensionEligibleQuestions(config: RuntimeConfig): QuestionMeta[] {
  return (config.questions_info ?? []).filter((question) => questionSupportsDimensionGrouping(question))
}

export function isEligibleQuestion(question: QuestionMeta): boolean {
  if (!question || question.is_description) {
    return false
  }
  return ruleQuestionTypes.has(String(question.provider_type || '').trim()) || ruleQuestionTypes.has(String(question.type_code || '').trim())
}

export function isMatrixQuestion(question: QuestionMeta | undefined): question is QuestionMeta {
  if (!question) {
    return false
  }
  return question.provider_type === 'matrix' || question.provider_type === 'matrix_radio' || question.type_code === '6'
}

export function questionSupportsDimensionGrouping(question: QuestionMeta | undefined): boolean {
  if (!question || question.is_description) {
    return false
  }
  const type = String(question.provider_type || question.type_code || '').trim().toLowerCase()
  return type === 'scale' || type === 'score' || type === 'matrix' || type === 'matrix_radio' || type === 'single'
}

export function questionTitle(question: QuestionMeta | undefined): string {
  if (!question) {
    return '未命名题目'
  }
  const text = String(question.title || '').trim()
  return text || `第 ${question.num} 题`
}

export function questionTypeLabel(question: QuestionMeta | undefined): string {
  if (!question) {
    return '题目'
  }
  switch (question.provider_type || question.type_code) {
    case 'single':
    case 'radio':
    case '3':
      return '单选题'
    case 'multiple':
    case 'checkbox':
    case '4':
      return '多选题'
    case 'scale':
    case '5':
      return '量表题'
    case 'matrix':
    case 'matrix_radio':
    case '6':
      return '矩阵题'
    default:
      return '题目'
  }
}

export function questionLabel(question: QuestionMeta | undefined): string {
  return `${questionTitle(question)} · ${questionTypeLabel(question)}`
}

export function questionLogicSummary(question: QuestionMeta | undefined): string {
  if (!question) {
    return '无逻辑'
  }
  const displayCount = countLogicItems(question.display_conditions)
  const jumpCount = countLogicItems(question.jump_rules)
  const controlCount = countLogicItems(question.controls_display_targets)
  const segments: string[] = []
  if (displayCount > 0) {
    segments.push(`显示 ${displayCount}`)
  }
  if (jumpCount > 0) {
    segments.push(`跳转 ${jumpCount}`)
  }
  if (controlCount > 0) {
    segments.push(`联动 ${controlCount}`)
  }
  return segments.length ? segments.join(' / ') : '无逻辑'
}

export function questionMediaSummary(question: QuestionMeta | undefined): string {
  const count = Array.isArray(question?.question_media) ? question?.question_media?.length ?? 0 : 0
  return count > 0 ? `媒体 ${count}` : '无媒体'
}

export function buildQuestionTreePages(config: RuntimeConfig): QuestionTreePage[] {
  const questions = (config.questions_info ?? []).slice().sort((left, right) => positiveInt(left.num) - positiveInt(right.num))
  const lookup = createQuestionLookup(questions)
  const pages = new Map<number, QuestionTreePage>()
  questions.forEach((question, index) => {
    const page = positiveInt(question.page, 1)
    const entry = findQuestionEntry(config, question.num)
    const node: QuestionTreeNode = {
      index,
      page,
      question,
      entry,
      label: questionLabel(question),
      summary: `${questionMediaSummary(question)} · ${questionLogicSummary(question)}`,
      relations: questionRelationItems(question, lookup),
    }
    if (!pages.has(page)) {
      pages.set(page, { page, nodes: [] })
    }
    pages.get(page)!.nodes.push(node)
  })
  return [...pages.values()].sort((left, right) => left.page - right.page)
}

export function buildQuestionSearchHits(config: RuntimeConfig, keyword: string): QuestionSearchHit[] {
  const questions = getEligibleQuestions(config)
  const normalized = normalizeSearchText(keyword)
  if (!normalized) {
    return questions.map((question, index) => {
      const entry = findQuestionEntry(config, question.num)
      return {
        index,
        title: questionLabel(question),
        detail: questionLogicSummary(question),
        searchText: questionSearchText(question, entry, questions),
      }
    })
  }
  return questions
    .map((question, index) => {
      const entry = findQuestionEntry(config, question.num)
      return {
        index,
        title: questionLabel(question),
        detail: questionLogicSummary(question),
        searchText: questionSearchText(question, entry, questions),
      }
    })
    .filter((item) => item.searchText.includes(normalized))
}

export function questionMediaItems(question: QuestionMeta | undefined): QuestionMediaItem[] {
  if (!question || !Array.isArray(question.question_media)) {
    return []
  }
  return question.question_media
    .filter((item): item is QuestionMediaItem => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      ...item,
      kind: String(item.kind || '').trim(),
      scope: String(item.scope || '').trim(),
      index: optionalIndex(item.index),
      source_url: String(item.source_url || '').trim(),
      label: String(item.label || '').trim(),
    }))
    .filter((item) => Boolean(item.source_url || item.label))
}

export function questionLogicDetails(question: QuestionMeta | undefined, allQuestions?: QuestionMeta[]): string[] {
  if (!question) {
    return []
  }
  const sourceLookup = createQuestionLookup(allQuestions)
  const details: string[] = []
  for (const item of normalizeLogicItems(question.display_conditions)) {
    const source = positiveInt(item.condition_question_num)
    if (source <= 0) {
      continue
    }
    const mode = String(item.condition_mode || 'selected') === 'not_selected' ? '未选中' : '选中'
    const sourceQuestion = sourceLookup.get(source)
    const optionText = formatOptionIndices(item.condition_option_indices, questionOptionLabels(sourceQuestion))
    details.push(`显示：第 ${source} 题 ${mode} ${optionText}`)
  }
  for (const item of normalizeLogicItems(question.jump_rules)) {
    const target = positiveInt(item.jumpto)
    if (target <= 0) {
      continue
    }
    const optionText = formatOptionIndices([item.option_index], questionOptionLabels(question))
    details.push(`跳转：${optionText} -> ${target > 0 ? `第 ${target} 题` : '结束'}`)
  }
  for (const item of normalizeLogicItems(question.controls_display_targets)) {
    const target = positiveInt(item.target_question_num)
    if (target <= 0) {
      continue
    }
    const optionText = formatOptionIndices(item.condition_option_indices, questionOptionLabels(question))
    details.push(`联动：${optionText} -> 显示第 ${target} 题`)
  }
  for (const item of questionMediaItems(question)) {
    const parts = [item.scope ? `${item.scope}` : '媒体']
    if (item.label) {
      parts.push(item.label)
    }
    details.push(`媒体：${parts.join(' · ')}`)
  }
  return details
}

export function questionRelationItems(
  question: QuestionMeta | undefined,
  allQuestions?: Map<number, QuestionMeta> | QuestionMeta[],
): QuestionTreeRelation[] {
  if (!question) {
    return []
  }
  const lookup = allQuestions instanceof Map ? allQuestions : createQuestionLookup(allQuestions)
  const items: QuestionTreeRelation[] = []
  const maxQuestionNum = Math.max(0, ...lookup.keys())
  for (const item of normalizeLogicItems(question.display_conditions)) {
    const source = positiveInt(item.condition_question_num)
    if (source <= 0) {
      continue
    }
    const sourceQuestion = lookup.get(source)
    const optionText = formatOptionIndices(item.condition_option_indices, questionOptionLabels(sourceQuestion))
    items.push({
      kind: 'display',
      label: `显示 ${source} 题：${optionText}`,
      target_question_num: source,
      target_index: lookup.has(source) ? source - 1 : null,
      selectable: lookup.has(source),
      ends_flow: false,
    })
  }
  for (const item of normalizeLogicItems(question.jump_rules)) {
    const target = positiveInt(item.jumpto)
    if (target <= 0) {
      continue
    }
    const optionText = formatOptionIndices([item.option_index], questionOptionLabels(question))
    items.push({
      kind: 'jump',
      label: `跳转 ${optionText} -> ${target > maxQuestionNum ? '结束' : `第 ${target} 题`}`,
      target_question_num: target,
      target_index: lookup.has(target) ? target - 1 : null,
      selectable: lookup.has(target) && target <= maxQuestionNum,
      ends_flow: target > maxQuestionNum,
    })
  }
  for (const item of normalizeLogicItems(question.controls_display_targets)) {
    const target = positiveInt(item.target_question_num)
    if (target <= 0) {
      continue
    }
    const optionText = formatOptionIndices(item.condition_option_indices, questionOptionLabels(question))
    items.push({
      kind: 'control',
      label: `联动 ${optionText} -> 第 ${target} 题`,
      target_question_num: target,
      target_index: lookup.has(target) ? target - 1 : null,
      selectable: lookup.has(target),
      ends_flow: false,
    })
  }
  return items
}

export function questionSearchText(
  question: QuestionMeta | undefined,
  entry?: QuestionEntry | undefined,
  allQuestions?: QuestionMeta[],
): string {
  const chunks: string[] = []
  if (question) {
    chunks.push(questionTitle(question))
    chunks.push(questionTypeLabel(question))
    chunks.push(...questionOptionLabels(question))
    chunks.push(...questionRowLabels(question))
    chunks.push(questionLogicSummary(question))
    chunks.push(questionMediaSummary(question))
    chunks.push(...questionLogicDetails(question, allQuestions))
    chunks.push(...questionMediaItems(question).flatMap((item) => [item.label || '', item.source_url || '']))
  }
  if (entry) {
    chunks.push(String(entry.dimension || ''))
    chunks.push(String(entry.psycho_bias || ''))
    chunks.push(String(entry.text_random_mode || ''))
    chunks.push(...normalizeIndexListText(entry.fillable_option_indices))
    const optionFillTexts = normalizeNullableTextList(entry.option_fill_texts ?? [])
    if (Array.isArray(optionFillTexts)) {
      chunks.push(...optionFillTexts.filter((item): item is string => Boolean(item)))
    }
    chunks.push(...normalizeAttachedOptionSelectSearchText(entry.attached_option_selects))
    chunks.push(...normalizeTextList(entry.multi_text_blank_modes, 16))
    chunks.push(...normalizeBoolListText(entry.multi_text_blank_ai_flags))
    chunks.push(...normalizeNestedIntRangeText(entry.multi_text_blank_int_ranges))
    chunks.push(...normalizeTextList(entry.location_parts, 3))
  }
  return normalizeSearchText(chunks.join(' '))
}

export function buildDimensionQuestionRows(config: RuntimeConfig): DimensionQuestionRow[] {
  const questions = (config.questions_info ?? []).filter((question) => questionSupportsDimensionGrouping(question))
  const entries = config.question_entries ?? []
  return questions.map((question, index) => {
    const entry = entries.find((item) => positiveInt(item.question_num) === question.num)
    return {
      index,
      question_num: question.num,
      title: questionLabel(question),
      type_label: questionTypeLabel(question),
      group_name: entry?.dimension || '',
      bias_text: String(entry?.psycho_bias || 'custom'),
    }
  })
}

export function questionOptionLabels(question: QuestionMeta | undefined): string[] {
  if (!question) {
    return []
  }
  const labels = (question.option_texts ?? []).map((item, index) => {
    const text = String(item || '').trim()
    return text || `选项 ${index + 1}`
  })
  if (labels.length) {
    return labels
  }
  const total = Math.max(0, Number(question.options) || 0)
  return Array.from({ length: total }, (_, index) => `选项 ${index + 1}`)
}

export function questionRowLabels(question: QuestionMeta | undefined): string[] {
  if (!question || !isMatrixQuestion(question)) {
    return []
  }
  const rowTexts = question.row_texts ?? []
  const labels = rowTexts.map((item, index) => {
    const text = String(item || '').trim()
    return text || `第 ${index + 1} 行`
  })
  if (labels.length) {
    return labels
  }
  const total = Math.max(0, Number(question.rows) || 0)
  return Array.from({ length: total }, (_, index) => `第 ${index + 1} 行`)
}

export function createDefaultRule(config: RuntimeConfig): StrategyRuleRecord {
  const questions = getEligibleQuestions(config)
  const source = questions[0]
  const target = questions[1] ?? questions[0]
  const sourceOptionCount = questionOptionLabels(source).length || 1
  const targetOptionCount = questionOptionLabels(target).length || 1
  const rule: StrategyRuleRecord = {
    condition_question_num: source?.num ?? 1,
    condition_mode: 'selected',
    condition_option_indices: [0],
    target_question_num: target?.num ?? 1,
    action_mode: 'must_select',
    target_option_indices: [0],
  }
  if (source && isMatrixQuestion(source)) {
    rule.condition_row_index = 0
  }
  if (target && isMatrixQuestion(target)) {
    rule.target_row_index = 0
  }
  if (!sourceOptionCount) {
    rule.condition_option_indices = []
  }
  if (!targetOptionCount) {
    rule.target_option_indices = []
  }
  return rule
}

export function normalizeRule(rule: StrategyRuleInput): StrategyRuleRecord {
  const next: StrategyRuleRecord = { ...rule }
  next.condition_question_num = positiveInt(next.condition_question_num)
  next.target_question_num = positiveInt(next.target_question_num)
  next.condition_mode = String(next.condition_mode || 'selected') === 'not_selected' ? 'not_selected' : 'selected'
  next.action_mode = String(next.action_mode || 'must_select') === 'must_not_select' ? 'must_not_select' : 'must_select'
  next.condition_option_indices = uniqueSortedIndices(next.condition_option_indices)
  next.target_option_indices = uniqueSortedIndices(next.target_option_indices)
  const conditionRow = optionalIndex(next.condition_row_index)
  const targetRow = optionalIndex(next.target_row_index)
  if (conditionRow === undefined) {
    delete next.condition_row_index
  } else {
    next.condition_row_index = conditionRow
  }
  if (targetRow === undefined) {
    delete next.target_row_index
  } else {
    next.target_row_index = targetRow
  }
  return next
}

export function formatRuleLabel(rule: StrategyRuleRecord, index: number): string {
  const questionNum = positiveInt(rule.condition_question_num)
  const conditionMode = String(rule.condition_mode || 'selected') === 'not_selected' ? '未选中' : '选中'
  const actionMode = String(rule.action_mode || 'must_select') === 'must_not_select' ? '不得选择' : '必须选择'
  const source = questionNum > 0 ? `第 ${questionNum} 题` : `规则 ${index + 1}`
  return `${source} · ${conditionMode} → ${actionMode}`
}

export function formatRuleTargets(rule: StrategyRuleRecord): string {
  const items = uniqueSortedIndices(rule.target_option_indices).map((item) => String(item + 1))
  return items.length ? items.join('、') : '-'
}

export function formatRuleConditions(rule: StrategyRuleRecord): string {
  const items = uniqueSortedIndices(rule.condition_option_indices).map((item) => String(item + 1))
  return items.length ? items.join('、') : '-'
}

export function updateRuleAtIndex(config: RuntimeConfig, index: number, rule: StrategyRuleInput): RuntimeConfig {
  const next = cloneConfig(config)
  const rules = [...(next.answer_rules ?? [])]
  const normalized = normalizeRule(rule)
  if (index >= 0 && index < rules.length) {
    rules[index] = normalized
  } else {
    rules.push(normalized)
  }
  next.answer_rules = rules
  return next
}

export function deleteRuleAtIndex(config: RuntimeConfig, index: number): RuntimeConfig {
  const next = cloneConfig(config)
  const rules = [...(next.answer_rules ?? [])]
  if (index >= 0 && index < rules.length) {
    rules.splice(index, 1)
  }
  next.answer_rules = rules
  return next
}

export function addDimensionGroup(config: RuntimeConfig, name: string): RuntimeConfig {
  const next = cloneConfig(config)
  const groups = sanitizeDimensionGroups(next)
  const normalized = normalizeDimensionName(name)
  if (normalized && !groups.includes(normalized)) {
    groups.push(normalized)
  }
  next.dimension_groups = groups
  return next
}

export function renameDimensionGroup(config: RuntimeConfig, oldName: string, nextName: string): RuntimeConfig {
  const current = normalizeDimensionName(oldName)
  const normalized = normalizeDimensionName(nextName)
  const next = cloneConfig(config)
  if (!current || !normalized || current === normalized) {
    return next
  }
  const entries = (next.question_entries ?? []).map((entry) =>
    normalizeDimensionName(entry.dimension) === current ? { ...entry, dimension: normalized } : entry,
  )
  next.question_entries = entries
  next.dimension_groups = sanitizeDimensionGroups({
    ...next,
    question_entries: entries,
    dimension_groups: (next.dimension_groups ?? []).filter((item) => normalizeDimensionName(item) !== current),
  })
  return next
}

export function deleteDimensionGroup(config: RuntimeConfig, name: string): RuntimeConfig {
  const current = normalizeDimensionName(name)
  const next = cloneConfig(config)
  if (!current) {
    return next
  }
  const entries = (next.question_entries ?? []).map((entry) =>
    normalizeDimensionName(entry.dimension) === current ? { ...entry, dimension: '' } : entry,
  )
  next.question_entries = entries
  next.dimension_groups = sanitizeDimensionGroups({
    ...next,
    question_entries: entries,
    dimension_groups: (next.dimension_groups ?? []).filter((item) => normalizeDimensionName(item) !== current),
  })
  return next
}

export function setQuestionDimension(config: RuntimeConfig, questionNum: number, dimension: string): RuntimeConfig {
  const target = positiveInt(questionNum)
  const normalized = normalizeDimensionName(dimension)
  return updateQuestionEntry(config, target, { dimension: normalized })
}

export function setQuestionAiEnabled(config: RuntimeConfig, questionNum: number, enabled: boolean): RuntimeConfig {
  return updateQuestionEntry(config, questionNum, { ai_enabled: Boolean(enabled) })
}

export function setQuestionPsychoBias(config: RuntimeConfig, questionNum: number, bias: string): RuntimeConfig {
  return updateQuestionEntry(config, questionNum, { psycho_bias: normalizePsychoBias(bias) })
}

export function setQuestionCustomWeights(config: RuntimeConfig, questionNum: number, value: string): RuntimeConfig {
  return updateQuestionEntry(config, questionNum, { custom_weights: parseCustomWeights(value) ?? undefined })
}

export function setQuestionTextRandomMode(config: RuntimeConfig, questionNum: number, mode: string): RuntimeConfig {
  return updateQuestionEntry(config, questionNum, { text_random_mode: normalizeTextRandomMode(mode) })
}

export function setQuestionTextRandomIntRange(config: RuntimeConfig, questionNum: number, value: string): RuntimeConfig {
  return updateQuestionEntry(config, questionNum, { text_random_int_range: parseIntRange(value) })
}

export function setQuestionLocationParts(config: RuntimeConfig, questionNum: number, parts: string[]): RuntimeConfig {
  return updateQuestionEntry(config, questionNum, { location_parts: normalizeTextList(parts, 3) })
}

export function setQuestionOptionFillTexts(config: RuntimeConfig, questionNum: number, texts: string[]): RuntimeConfig {
  return updateQuestionEntry(config, questionNum, { option_fill_texts: normalizeNullableTextList(texts) })
}

export function setQuestionFillableOptions(config: RuntimeConfig, questionNum: number, indices: number[]): RuntimeConfig {
  return updateQuestionEntry(config, questionNum, { fillable_option_indices: normalizeIndexList(indices) })
}

export function setQuestionAttachedOptionSelects(
  config: RuntimeConfig,
  questionNum: number,
  items: Array<Record<string, unknown>>,
): RuntimeConfig {
  return updateQuestionEntry(config, questionNum, { attached_option_selects: normalizeAttachedOptionSelects(items) })
}

export function setQuestionMultiTextBlankConfig(
  config: RuntimeConfig,
  questionNum: number,
  modes: string[],
  aiFlags: boolean[],
  intRanges: string[],
): RuntimeConfig {
  return updateQuestionEntry(config, questionNum, {
    multi_text_blank_modes: normalizeMultiTextBlankModes(modes, Math.max(modes.length, aiFlags.length, intRanges.length)),
    multi_text_blank_ai_flags: normalizeMultiTextBlankAIFlags(aiFlags, Math.max(modes.length, aiFlags.length, intRanges.length)),
    multi_text_blank_int_ranges: normalizeMultiTextBlankIntRanges(intRanges, Math.max(modes.length, aiFlags.length, intRanges.length)),
  })
}

export function moveQuestionsToDimension(config: RuntimeConfig, questionNums: number[], dimension: string): RuntimeConfig {
  let next = cloneConfig(config)
  const normalized = normalizeDimensionName(dimension)
  for (const questionNum of questionNums) {
    next = setQuestionDimension(next, questionNum, normalized)
  }
  return next
}

export function updateQuestionEntry(
  config: RuntimeConfig,
  questionNum: number,
  patch: Partial<QuestionEntry>,
): RuntimeConfig {
  const target = positiveInt(questionNum)
  const next = cloneConfig(config)
  const questions = next.questions_info ?? []
  const question = questions.find((item) => positiveInt(item.num) === target)
  if (!question) {
    return next
  }
  const entries = [...(next.question_entries ?? [])]
  const entryIndex = entries.findIndex((entry) => positiveInt(entry.question_num) === target)
  const base = entryIndex >= 0 ? entries[entryIndex] : createEntryFromQuestion(question, '')
  const merged = normalizeQuestionEntry({
    ...base,
    ...patch,
    question_num: target,
    question_title: String(base.question_title || question.title || '').trim(),
    survey_provider: String(base.survey_provider || question.provider || '').trim(),
    question_type: String(base.question_type || question.provider_type || question.type_code || 'text').trim(),
  }, question)
  if (entryIndex >= 0) {
    entries[entryIndex] = merged
  } else {
    entries.push(merged)
  }
  next.question_entries = entries
  next.dimension_groups = sanitizeDimensionGroups({
    ...next,
    question_entries: entries,
  })
  return next
}

export function questionDimensionMap(config: RuntimeConfig): Map<number, string> {
  const map = new Map<number, string>()
  for (const entry of config.question_entries ?? []) {
    const num = positiveInt(entry.question_num)
    if (num <= 0) {
      continue
    }
    map.set(num, normalizeDimensionName(entry.dimension))
  }
  return map
}

export function dimensionUsageCount(config: RuntimeConfig, name: string): number {
  const target = normalizeDimensionName(name)
  if (!target) {
    return 0
  }
  return (config.question_entries ?? []).reduce((count, entry) => {
    return count + (normalizeDimensionName(entry.dimension) === target ? 1 : 0)
  }, 0)
}

export function sanitizeDimensionGroups(config: RuntimeConfig): string[] {
  const groups = new Set<string>()
  for (const item of config.dimension_groups ?? []) {
    const text = normalizeDimensionName(item)
    if (text) {
      groups.add(text)
    }
  }
  for (const entry of config.question_entries ?? []) {
    const text = normalizeDimensionName(entry.dimension)
    if (text) {
      groups.add(text)
    }
  }
  return [...groups]
}

export function findQuestionEntry(config: RuntimeConfig, questionNum: number): QuestionEntry | undefined {
  const target = positiveInt(questionNum)
  return (config.question_entries ?? []).find((entry) => positiveInt(entry.question_num) === target)
}

function createEntryFromQuestion(question: QuestionMeta, dimension: string): QuestionEntry {
  const optionCount = Math.max(1, Number(question.options) || 1)
  const blankCount = Math.max(1, Number(question.text_inputs) || 0)
  return {
    question_type: question.provider_type || question.type_code || 'text',
    probabilities: Array.from({ length: optionCount }, () => 1),
    rows: Number(question.rows) || 0,
    option_count: optionCount,
    distribution_mode: 'random',
    question_num: positiveInt(question.num),
    question_title: question.title || '',
    survey_provider: question.provider || '',
    dimension,
    psycho_bias: 'custom',
    fillable_option_indices: normalizeIndexList(question.fillable_options),
    attached_option_selects: normalizeAttachedOptionSelects(question.attached_option_selects),
    has_attached_option_select: Boolean(question.has_attached_option_select),
    multi_text_blank_modes: question.is_multi_text || blankCount > 1 ? inferMultiTextBlankModes(question, blankCount) : [],
    multi_text_blank_ai_flags: question.is_multi_text || blankCount > 1 ? Array.from({ length: blankCount }, () => false) : [],
    multi_text_blank_int_ranges: question.is_multi_text || blankCount > 1 ? Array.from({ length: blankCount }, () => []) : [],
  }
}

function normalizeQuestionEntry(entry: QuestionEntry, question?: QuestionMeta): QuestionEntry {
  const optionCount = Math.max(
    0,
    Number(entry.option_count) || 0,
    Number(question?.options) || 0,
  )
  const blankCount = Math.max(
    0,
    Number(question?.text_inputs) || 0,
    Array.isArray(entry.multi_text_blank_modes) ? entry.multi_text_blank_modes.length : 0,
    Array.isArray(entry.multi_text_blank_ai_flags) ? entry.multi_text_blank_ai_flags.length : 0,
    Array.isArray(entry.multi_text_blank_int_ranges) ? entry.multi_text_blank_int_ranges.length : 0,
  )
  const isMultiText = Boolean(question?.is_multi_text) || String(entry.question_type || '').trim() === 'multi_text' || blankCount > 1
  return {
    ...entry,
    dimension: normalizeDimensionName(entry.dimension),
    text_random_mode: normalizeTextRandomMode(entry.text_random_mode),
    text_random_int_range: parseIntRange(entry.text_random_int_range),
    location_parts: normalizeTextList(entry.location_parts, 3),
    option_fill_texts: normalizeNullableTextList(entry.option_fill_texts ?? []),
    fillable_option_indices: normalizeIndexList(entry.fillable_option_indices, optionCount),
    attached_option_selects: normalizeAttachedOptionSelects(entry.attached_option_selects),
    multi_text_blank_modes: isMultiText ? normalizeMultiTextBlankModes(entry.multi_text_blank_modes, blankCount, question) : [],
    multi_text_blank_ai_flags: isMultiText ? normalizeMultiTextBlankAIFlags(entry.multi_text_blank_ai_flags, blankCount) : [],
    multi_text_blank_int_ranges: isMultiText ? normalizeMultiTextBlankIntRanges(entry.multi_text_blank_int_ranges, blankCount) : [],
  }
}

function cloneConfig(config: RuntimeConfig): RuntimeConfig {
  return {
    ...config,
    answer_rules: [...(config.answer_rules ?? [])],
    dimension_groups: [...(config.dimension_groups ?? [])],
    question_entries: [...(config.question_entries ?? [])],
  }
}

function normalizeDimensionName(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text || text === '未分组') {
    return ''
  }
  return text
}

function normalizeTextRandomMode(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'name' || text === 'mobile' || text === 'id_card' || text === 'integer') {
    return text
  }
  return ''
}

function normalizeMultiTextBlankModes(value: unknown, blankCount = 0, question?: QuestionMeta): string[] {
  const count = Math.max(0, blankCount)
  const source = Array.isArray(value) ? value : []
  const normalized = source.map((item, index) => {
    const text = String(item ?? '').trim().toLowerCase()
    if (text === 'name' || text === 'mobile' || text === 'id_card' || text === 'integer') {
      return text
    }
    if (text === 'none' || text === '') {
      if (question && count > 0 && index < count) {
        return inferMultiTextBlankModes(question, count)[index] ?? ''
      }
      return ''
    }
    return ''
  })
  while (normalized.length < count) {
    normalized.push(question ? inferMultiTextBlankModes(question, count)[normalized.length] ?? '' : '')
  }
  return normalized.slice(0, count)
}

function normalizeMultiTextBlankAIFlags(value: unknown, blankCount = 0): boolean[] {
  const count = Math.max(0, blankCount)
  const source = Array.isArray(value) ? value : []
  const normalized = source.map((item) => Boolean(item))
  while (normalized.length < count) {
    normalized.push(false)
  }
  return normalized.slice(0, count)
}

function normalizeMultiTextBlankIntRanges(value: unknown, blankCount = 0): number[][] {
  const count = Math.max(0, blankCount)
  const source = Array.isArray(value) ? value : []
  const normalized = source.map((item) => parseIntRange(item) ?? [])
  while (normalized.length < count) {
    normalized.push([])
  }
  return normalized.slice(0, count)
}

function normalizePsychoBias(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'left' || text === 'center' || text === 'right' || text === 'custom') {
    return text
  }
  return 'custom'
}

function inferMultiTextBlankModes(question: QuestionMeta, blankCount: number): string[] {
  const labels = (question.text_input_labels ?? []).map((item) => String(item ?? '').trim())
  const title = String(question.title || '').trim()
  const total = Math.max(0, blankCount)
  const modes: string[] = []
  for (let index = 0; index < total; index += 1) {
    const text = labels[index] || (total <= 1 ? title : '')
    const normalized = String(text || '').replace(/\s+/g, '').toLowerCase()
    if (['手机号', '手机号码', '手机', '电话', '联系电话', '联系方式'].some((marker) => normalized.includes(marker))) {
      modes.push('mobile')
    } else if (['身份证', '证件号', '证件号码'].some((marker) => normalized.includes(marker))) {
      modes.push('id_card')
    } else if (['姓名', '名字', '联系人'].some((marker) => normalized.includes(marker))) {
      modes.push('name')
    } else {
      modes.push('')
    }
  }
  return modes
}

function parseCustomWeights(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    const parsed = value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item))
      .map((item) => Math.max(0, Math.trunc(item)))
    return parsed.length ? parsed : null
  }
  const text = String(value ?? '').trim()
  if (!text) {
    return null
  }
  const parsed = text
    .split(/[,\s|、/]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.max(0, Math.trunc(item)))
  return parsed.length ? parsed : null
}

function normalizeIndexList(raw: unknown, optionCount = 0): number[] {
  const list = Array.isArray(raw) ? raw : []
  const total = Math.max(0, optionCount)
  const seen = new Set<number>()
  const normalized: number[] = []
  for (const item of list) {
    const parsed = Number(item)
    if (!Number.isFinite(parsed)) {
      continue
    }
    const index = Math.trunc(parsed)
    if (index < 0 || (total > 0 && index >= total) || seen.has(index)) {
      continue
    }
    seen.add(index)
    normalized.push(index)
  }
  return normalized.sort((left, right) => left - right)
}

function normalizeAttachedOptionSelects(raw: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(raw)) {
    return undefined
  }
  const normalized: Array<Record<string, unknown>> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const candidate = item as Record<string, unknown>
    const rawIndex = Number(candidate.option_index)
    if (!Number.isFinite(rawIndex) || rawIndex < 0) {
      continue
    }
    const selectOptions = Array.isArray(candidate.select_options)
      ? candidate.select_options.map((value) => String(value ?? '').trim()).filter((value) => Boolean(value))
      : []
    if (!selectOptions.length) {
      continue
    }
    const normalizedItem: Record<string, unknown> = {
      option_index: Math.trunc(rawIndex),
      option_text: String(candidate.option_text ?? '').trim(),
      select_options: selectOptions,
    }
    if (Array.isArray(candidate.weights)) {
      const weights = candidate.weights
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.max(0, value))
      if (weights.length) {
        normalizedItem.weights = weights
      }
    }
    normalized.push(normalizedItem)
  }
  return normalized
}

function normalizeAttachedOptionSelectSearchText(raw: unknown): string[] {
  const items = normalizeAttachedOptionSelects(raw) ?? []
  const chunks: string[] = []
  for (const item of items) {
    chunks.push(String(item.option_text ?? ''))
    const options = Array.isArray(item.select_options) ? item.select_options : []
    chunks.push(...options.map((value) => String(value ?? '')))
  }
  return chunks.filter((item) => Boolean(String(item ?? '').trim()))
}

function normalizeBoolListText(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.map((value, index) => `${index + 1}${Boolean(value) ? '启用' : '关闭'}`)
}

function normalizeNestedIntRangeText(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const chunks: string[] = []
  for (const item of raw) {
    const range = parseIntRange(item)
    if (range && range.length >= 2) {
      chunks.push(`${range[0]}-${range[1]}`)
    }
  }
  return chunks
}

function normalizeIndexListText(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((value) => String(Math.trunc(value) + 1))
}

function parseIntRange(value: unknown): number[] | null | undefined {
  if (Array.isArray(value)) {
    const parsed = value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item))
      .map((item) => Math.trunc(item))
    if (parsed.length >= 2) {
      return parsed.slice(0, 2)
    }
    return parsed.length ? parsed : null
  }
  const text = String(value ?? '').trim()
  if (!text) {
    return null
  }
  const parts = text.split(/[-~|,，\s]+/).filter(Boolean)
  const parsed = parts
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.trunc(item))
  if (parsed.length >= 2) {
    return parsed.slice(0, 2)
  }
  return parsed.length ? parsed : null
}

function countLogicItems(items: Array<Record<string, unknown> | null> | null | undefined): number {
  if (!Array.isArray(items)) {
    return 0
  }
  return items.reduce((count, item) => count + (item && typeof item === 'object' ? 1 : 0), 0)
}

function normalizeLogicItems(items: Array<Record<string, unknown> | null> | null | undefined): Array<Record<string, unknown>> {
  if (!Array.isArray(items)) {
    return []
  }
  return items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

function createQuestionLookup(allQuestions?: QuestionMeta[]): Map<number, QuestionMeta> {
  const lookup = new Map<number, QuestionMeta>()
  for (const item of allQuestions ?? []) {
    const num = positiveInt(item.num)
    if (num > 0 && !lookup.has(num)) {
      lookup.set(num, item)
    }
  }
  return lookup
}

function formatOptionIndices(raw: unknown, optionTexts?: string[]): string {
  if (Array.isArray(raw)) {
    const items = raw
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item >= 0)
      .map((item) => Math.trunc(item))
    if (!items.length) {
      return '指定选项'
    }
    return items.slice(0, 4).map((index) => formatOptionIndex(index, optionTexts)).join('、')
  }
  const index = Number(raw)
  if (!Number.isFinite(index) || index < 0) {
    return '指定选项'
  }
  return formatOptionIndex(Math.trunc(index), optionTexts)
}

function formatOptionIndex(index: number, optionTexts?: string[]): string {
  if (Array.isArray(optionTexts) && index >= 0 && index < optionTexts.length) {
    const text = String(optionTexts[index] || '').trim()
    if (text) {
      return `“${text}”`
    }
  }
  return `第 ${index + 1} 项`
}

function normalizeSearchText(text: string): string {
  return String(text || '').toLowerCase().replace(/\s+/g, '')
}

function normalizeTextList(value: unknown, limit: number): string[] {
  const list = Array.isArray(value) ? value : []
  const items = list
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0)
  return items.slice(0, limit)
}

function normalizeNullableTextList(value: unknown): Array<string | null> | null | undefined {
  if (value === null || value === undefined) {
    return value as null | undefined
  }
  if (!Array.isArray(value)) {
    return null
  }
  const items = value.map((item) => {
    const text = String(item ?? '').trim()
    return text ? text : null
  })
  return items.length ? items : null
}

function positiveInt(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.trunc(parsed)
}

function optionalIndex(value: unknown): number | undefined {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }
  return Math.trunc(parsed)
}

function uniqueSortedIndices(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const seen = new Set<number>()
  const values: number[] = []
  for (const item of raw) {
    const parsed = Number(item)
    if (!Number.isFinite(parsed) || parsed < 0) {
      continue
    }
    const index = Math.trunc(parsed)
    if (seen.has(index)) {
      continue
    }
    seen.add(index)
    values.push(index)
  }
  return values.sort((left, right) => left - right)
}
