import type { AttachedOptionSelect, WeightTable } from '../../types'

interface AttachedSelectDraft {
  option_index?: number
  option_text?: string
  select_texts?: string[]
}

export function formatWeightTable(value?: WeightTable): string {
  if (value?.options?.length) return value.options.join(', ')
  if (value?.rows?.length) return value.rows.flatMap((row) => row ?? []).join(', ')
  return ''
}

export function formatAttachedOptionSelects(value?: AttachedOptionSelect[] | null): string {
  return value?.length ? JSON.stringify(value, null, 2) : ''
}

export function parseAttachedOptionSelects(value: string): AttachedOptionSelect[] {
  const text = value.trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as AttachedSelectDraft[]
    if (!Array.isArray(parsed)) return []
    return normalizeAttachedOptionSelects(parsed.map((item) => ({
      option_index: Number(item.option_index),
      option_text: String(item.option_text ?? ''),
      select_texts: Array.isArray(item.select_texts) ? item.select_texts.map(String) : [],
    })))
  } catch {
    return []
  }
}

export function fillTextArray(value: string[] | null | undefined, count: number): string[] {
  return fillArray((value ?? []).map((item) => item.trim()), count, '')
}

export function fillBoolArray(value: boolean[] | null | undefined, count: number): boolean[] {
  return fillArray([...(value ?? [])], count, false)
}

export function fillRangeArray(value: (number[] | null)[] | null | undefined, count: number): string[] {
  return fillArray((value ?? []).map((range) => range && range.length >= 2 ? `${range[0]} - ${range[1]}` : ''), count, '')
}

export function parseNumberList(value: string): number[] {
  return value.split(/[,\s|、/]+/).map(Number).filter(Number.isFinite).map(normalizeWeight)
}

export function parseIntRange(value: string): number[] | null {
  return normalizeIntRange(value.split(/[-~|,，\s]+/).filter(Boolean).map(Number).filter(Number.isFinite))
}

export function normalizeIntRange(value?: number[] | null): number[] | null {
  if (!value?.length) return null
  const parsed = value.filter(Number.isFinite).map(Math.trunc)
  return parsed.length >= 2 ? parsed.slice(0, 2) : parsed
}

export function normalizeWeight(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0)
}

export function normalizeAttachedOptionSelects(items: AttachedOptionSelect[]): AttachedOptionSelect[] {
  return items
    .filter((item) => Number.isFinite(item.option_index) && item.option_index >= 0)
    .map((item) => ({
      option_index: Math.trunc(item.option_index),
      option_text: item.option_text.trim(),
      select_texts: (item.select_texts ?? []).map((value) => value.trim()).filter(Boolean),
    }))
    .filter((item) => item.select_texts.length > 0)
}

export function fillArray<T>(source: T[], count: number, fallback: T): T[] {
  const result = [...source]
  while (result.length < count) result.push(fallback)
  return result.slice(0, count)
}
