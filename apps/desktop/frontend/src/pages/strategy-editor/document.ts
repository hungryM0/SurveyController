import type { ConfigDocument, QuestionEntry } from '../../types'

export function cloneStrategyDocument(config: ConfigDocument): ConfigDocument {
  return structuredClone(config)
}

export function findQuestionEntry(config: ConfigDocument, questionNum: number): QuestionEntry | undefined {
  return (config.answers.questions ?? []).find((entry) => entry.question_num === questionNum)
}

export function normalizeDimensionName(value?: string): string {
  const text = value?.trim() ?? ''
  return !text || text === '未分组' ? '' : text
}

export function sanitizeDimensionGroups(config: ConfigDocument): string[] {
  const groups = new Set<string>()
  for (const item of config.answers.dimensions ?? []) {
    const text = normalizeDimensionName(item)
    if (text) groups.add(text)
  }
  for (const entry of config.answers.questions ?? []) {
    const text = normalizeDimensionName(entry.dimension)
    if (text) groups.add(text)
  }
  return [...groups]
}

export function positiveInt(value?: number | null, fallback = 0): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.trunc(value as number) : fallback
}

export function optionalIndex(value?: number | null): number | undefined {
  return Number.isFinite(value) && (value ?? -1) >= 0 ? Math.trunc(value as number) : undefined
}

export function uniqueSortedIndices(values?: number[] | null, limit = 0): number[] {
  const seen = new Set<number>()
  for (const value of values ?? []) {
    if (!Number.isFinite(value)) continue
    const index = Math.trunc(value)
    if (index < 0 || (limit > 0 && index >= limit)) continue
    seen.add(index)
  }
  return [...seen].sort((left, right) => left - right)
}
