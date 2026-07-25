import type { NetworkSettings } from '../types'
import { defaultRandomUARatios, inferProvider } from './configDocumentDefaults'

const ratioKeys = ['wechat', 'mobile', 'pc'] as const

export function normalizePair(value: number[] | undefined, fallback: [number, number]): [number, number] {
  const left = clampInt(value?.[0], 0, 999999, fallback[0])
  const right = clampInt(value?.[1], left, 999999, fallback[1])
  return [left, right]
}

export function normalizeStringPair(value: string[] | undefined): [string, string] {
  return [String(value?.[0] ?? '').trim(), String(value?.[1] ?? '').trim()]
}

export function formatDateTimeWindow(value: string[] | undefined): string {
  const [start, end] = normalizeStringPair(value)
  return start || end ? `${start} | ${end}`.trim() : ''
}

export function parseRangePair(value: string, fallback: [number, number]): [number, number] {
  const parts = value.match(/\d+/g) ?? []
  if (!parts.length) return fallback
  const left = clampInt(Number(parts[0]), 0, 999999, fallback[0])
  return [left, clampInt(Number(parts[1] ?? parts[0]), left, 999999, fallback[1])]
}

export function parseDateTimeWindowPair(value: string): [string, string] {
  const parts = value.split(/\s*(?:\||~)\s*/).map((item) => item.trim()).filter(Boolean)
  return [parts[0] ?? '', parts[1] ?? '']
}

export function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value as number)))
}

export function clampFloat(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value as number))
}

export function normalizeProvider(provider: string, url: string): string {
  return ['wjx', 'qq', 'credamo'].includes(provider) ? provider : inferProvider(url)
}

export function normalizeProxySource(source: string): string {
  return ['default', 'benefit', 'custom'].includes(source) ? source : 'default'
}

export function proxyValue(value: string): string {
  if (value === '限时福利') return 'benefit'
  if (value === '自定义') return 'custom'
  if (value === '默认') return 'default'
  return normalizeProxySource(value)
}

export function normalizeProxyAreaCode(value?: string): string | undefined {
  const text = value?.trim() ?? ''
  return /^\d{6}$/.test(text) ? text : undefined
}

export function normalizeRandomUARatios(
  value?: NetworkSettings['randomUaRatios'],
): NonNullable<NetworkSettings['randomUaRatios']> {
  if (!value) return { ...defaultRandomUARatios }
  const result = { wechat: 0, mobile: 0, pc: 0 }
  let sum = 0
  for (const key of ratioKeys) {
    const item = clampInt(value[key], 0, 100, -1)
    if (item < 0) return { ...defaultRandomUARatios }
    result[key] = item
    sum += item
  }
  return sum === 100 ? result : { ...defaultRandomUARatios }
}

export function updateRandomUARatio(
  current: NetworkSettings['randomUaRatios'],
  key: typeof ratioKeys[number],
  value: number,
): NonNullable<NetworkSettings['randomUaRatios']> {
  const next = normalizeRandomUARatios(current)
  next[key] = clampInt(value, 0, 100, next[key] ?? 0)
  let delta = ratioKeys.reduce((sum, item) => sum + (next[item] ?? 0), 0) - 100
  for (const candidate of ratioKeys) {
    if (candidate === key || delta === 0) continue
    if (delta > 0) {
      const decrease = Math.min(delta, next[candidate] ?? 0)
      next[candidate] = (next[candidate] ?? 0) - decrease
      delta -= decrease
    } else {
      const increase = Math.min(-delta, 100 - (next[candidate] ?? 0))
      next[candidate] = (next[candidate] ?? 0) + increase
      delta += increase
    }
  }
  return normalizeRandomUARatios(next)
}
