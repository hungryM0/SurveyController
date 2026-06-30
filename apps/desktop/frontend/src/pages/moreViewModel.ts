export type ReleaseStatus = 'idle' | 'checking' | 'latest' | 'outdated' | 'preview' | 'unknown' | 'error'

export interface StableReleaseManifest {
  version?: string
  tag?: string
  published_at?: string
  installer_url?: string
  notes?: string
  body?: string
}

export interface VelopackFeedPayload {
  Assets?: VelopackFeedAsset[]
}

export interface VelopackFeedAsset {
  Version?: string
  Type?: string
  FileName?: string
  NotesMarkdown?: string
  NotesHtml?: string
}

export interface ReleaseInfo {
  tagName: string
  publishedAt: string
  htmlUrl: string
  status: ReleaseStatus
  message: string
  currentVersion: string
  latestVersion: string
  releaseNotes: string
}

export interface IPUsageChartPoint {
  label: string
  total: number
  x: number
  y: number
}

export interface IPUsageChartModel {
  hasData: boolean
  points: IPUsageChartPoint[]
  linePath: string
  areaPath: string
  yTicks: Array<{ value: number; y: number }>
  xLabels: Array<{ label: string; x: number }>
  rangeLabel: string
  total: number
  average: string
  peakLabel: string
  peakTotal: number
  maxY: number
}

export const MORE_REPO_URL = 'https://github.com/SurveyController/SurveyController'
export const MORE_RELEASES_URL = `${MORE_REPO_URL}/releases/latest`
export const WINDOWS_STABLE_RELEASE_BASE_URL = 'https://dl.hungrym0.com/surveycontroller/win/stable/'
export const WINDOWS_STABLE_MANIFEST_URL = `${WINDOWS_STABLE_RELEASE_BASE_URL}latest.json`
export const WINDOWS_STABLE_FEED_URL = `${WINDOWS_STABLE_RELEASE_BASE_URL}releases.stable.json`
export const WINDOWS_LATEST_SETUP_URL = 'https://dl.hungrym0.com/SurveyController_latest_setup.exe'
export const IP_USAGE_CHART_WIDTH = 640
export const IP_USAGE_CHART_HEIGHT = 260

export function emptyReleaseInfo(currentVersion: string): ReleaseInfo {
  return {
    tagName: '',
    publishedAt: '',
    htmlUrl: WINDOWS_LATEST_SETUP_URL,
    status: 'idle',
    message: '点击按钮检查新版本',
    currentVersion: normalizeVersion(currentVersion),
    latestVersion: '',
    releaseNotes: '',
  }
}

export function shouldAutoCheckRelease(autoCheckUpdate: boolean, refreshTick: number): boolean {
  return autoCheckUpdate || refreshTick > 0
}

export function checkingReleaseInfo(current: ReleaseInfo): ReleaseInfo {
  return {
    ...current,
    status: 'checking',
    message: '正在检查更新',
  }
}

export function errorReleaseInfo(current: ReleaseInfo, error: unknown): ReleaseInfo {
  return {
    ...current,
    status: 'error',
    message: `检查更新失败：${error instanceof Error ? error.message : String(error)}`,
  }
}

export function buildStableReleaseInfo(payload: StableReleaseManifest, currentVersion: string): ReleaseInfo {
  const latestVersion = normalizeVersion(payload.version ?? payload.tag ?? '')
  const current = normalizeVersion(currentVersion)
  const htmlUrl = String(payload.installer_url || '').trim() || WINDOWS_LATEST_SETUP_URL
  const base: ReleaseInfo = {
    tagName: latestVersion,
    publishedAt: String(payload.published_at || '').trim(),
    htmlUrl,
    status: 'unknown',
    message: '无法识别远端版本',
    currentVersion: current,
    latestVersion,
    releaseNotes: previewReleaseNotes(payload.notes ?? payload.body ?? '', 300),
  }

  return buildVersionedReleaseInfo(base, latestVersion, current)
}

export function buildVelopackFeedReleaseInfo(payload: VelopackFeedPayload, currentVersion: string): ReleaseInfo {
  const asset = latestFullVelopackAsset(payload)
  if (!asset) {
    return {
      ...emptyReleaseInfo(currentVersion),
      status: 'unknown',
      message: '无法识别远端版本',
    }
  }
  const filename = String(asset.FileName || '').trim()
  const version = normalizeVersion(asset.Version ?? '')
  const notes = String(asset.NotesMarkdown || asset.NotesHtml || '')
  return buildVersionedReleaseInfo({
    tagName: version,
    publishedAt: '',
    htmlUrl: filename ? `${WINDOWS_STABLE_RELEASE_BASE_URL}${encodeURIComponent(filename)}` : WINDOWS_LATEST_SETUP_URL,
    status: 'unknown',
    message: '无法识别远端版本',
    currentVersion: normalizeVersion(currentVersion),
    latestVersion: version,
    releaseNotes: previewReleaseNotes(notes, 300),
  }, version, normalizeVersion(currentVersion))
}

export function latestFullVelopackAsset(payload: VelopackFeedPayload): VelopackFeedAsset | null {
  const assets = Array.isArray(payload.Assets) ? payload.Assets : []
  return assets.reduce<VelopackFeedAsset | null>((latest, asset) => {
    if (String(asset.Type || '').toLowerCase() !== 'full') {
      return latest
    }
    if (!latest || compareVersion(normalizeVersion(asset.Version ?? ''), normalizeVersion(latest.Version ?? '')) > 0) {
      return asset
    }
    return latest
  }, null)
}

function buildVersionedReleaseInfo(base: ReleaseInfo, latestVersion: string, current: string): ReleaseInfo {
  if (!latestVersion || !current) {
    return base
  }

  const diff = compareVersion(latestVersion, current)
  if (diff > 0) {
    return {
      ...base,
      status: 'outdated',
      message: `发现新版本 v${latestVersion}`,
    }
  }
  if (diff < 0) {
    return {
      ...base,
      status: 'preview',
      message: `远端最新版是 v${latestVersion}，当前版本 v${current}`,
    }
  }
  return {
    ...base,
    status: 'latest',
    message: `当前已是最新版本 v${current}`,
  }
}

export function releaseStatusText(info: ReleaseInfo): string {
  if (info.status === 'outdated') {
    const date = formatReleaseDate(info.publishedAt)
    return `最新版本 v${info.latestVersion || info.tagName}，发布于 ${date}`
  }
  return info.message
}

export function normalizeVersion(value: string): string {
  return String(value || '').trim().replace(/^v/i, '')
}

export function compareVersion(left: string, right: string): number {
  const leftParts = parseVersionParts(left)
  const rightParts = parseVersionParts(right)
  if (!leftParts.length || !rightParts.length) {
    return 0
  }
  const size = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < size; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

export function formatReleaseDate(value: string): string {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toISOString().slice(0, 10)
}

export function previewReleaseNotes(text: string, limit: number): string {
  const normalized = String(text || '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!normalized) {
    return '暂无更新说明'
  }
  if (normalized.length <= limit) {
    return normalized
  }
  return `${normalized.slice(0, limit)}\n...`
}

export function buildIPUsageChartModel(records: Array<{ label?: string; total?: number }> | null | undefined): IPUsageChartModel {
  const normalized = normalizeUsageRecords(records)
  const left = 52
  const right = 24
  const top = 22
  const bottom = 42
  const plotWidth = IP_USAGE_CHART_WIDTH - left - right
  const plotHeight = IP_USAGE_CHART_HEIGHT - top - bottom
  const baselineY = top + plotHeight
  const maxTotal = normalized.reduce((max, item) => Math.max(max, item.total), 0)
  let maxY = Math.max(1000, Math.ceil(maxTotal / 1000) * 1000)
  if (maxY === maxTotal) {
    maxY += 1000
  }

  if (!normalized.length) {
    return {
      hasData: false,
      points: [],
      linePath: '',
      areaPath: '',
      yTicks: buildYTicks(maxY, top, plotHeight),
      xLabels: [],
      rangeLabel: '暂无数据',
      total: 0,
      average: '0',
      peakLabel: '-',
      peakTotal: 0,
      maxY,
    }
  }

  const minMs = normalized[0].dateMs
  const maxMs = normalized[normalized.length - 1].dateMs
  const span = Math.max(1, maxMs - minMs)
  const points = normalized.map((item, index) => {
    const x = normalized.length === 1
      ? left + plotWidth / 2
      : left + ((item.dateMs - minMs) / span) * plotWidth
    const y = baselineY - (item.total / maxY) * plotHeight
    return { label: item.label, total: item.total, x: roundCoord(x), y: roundCoord(y), index }
  })
  const linePath = buildSmoothPath(points)
  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  const areaPath = linePath && firstPoint && lastPoint
    ? `${linePath} L ${lastPoint.x} ${baselineY} L ${firstPoint.x} ${baselineY} Z`
    : ''
  const total = normalized.reduce((sum, item) => sum + item.total, 0)
  const peak = normalized.reduce((current, item) => item.total > current.total ? item : current, normalized[0])
  const xLabels = buildXLabels(points)

  return {
    hasData: true,
    points: points.map(({ label, total, x, y }) => ({ label, total, x, y })),
    linePath,
    areaPath,
    yTicks: buildYTicks(maxY, top, plotHeight),
    xLabels,
    rangeLabel: normalized.length === 1 ? normalized[0].label : `${normalized[0].label} ~ ${normalized[normalized.length - 1].label}`,
    total,
    average: formatUsageAverage(total, normalized.length),
    peakLabel: peak.label,
    peakTotal: peak.total,
    maxY,
  }
}

export function formatUsageAverage(total: number, days: number): string {
  if (!Number.isFinite(total) || !Number.isFinite(days) || days <= 0) {
    return '0'
  }
  const average = total / days
  if (Number.isInteger(average)) {
    return String(average)
  }
  return average.toFixed(1).replace(/\.0$/, '')
}

function parseVersionParts(value: string): number[] {
  const normalized = normalizeVersion(value)
  if (!normalized) {
    return []
  }
  const core = normalized.split(/[+-]/)[0]
  const parts = core.split('.').map((item) => Number.parseInt(item, 10))
  return parts.map((item) => (Number.isFinite(item) ? item : 0))
}

function normalizeUsageRecords(records: Array<{ label?: string; total?: number }> | null | undefined) {
  if (!Array.isArray(records)) {
    return []
  }
  return records
    .map((item) => {
      const label = String(item.label || '').trim()
      const dateMs = parseDateLabel(label)
      const total = Number(item.total)
      return {
        label,
        dateMs,
        total: Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0,
      }
    })
    .filter((item) => item.label && Number.isFinite(item.dateMs))
    .sort((left, right) => left.dateMs - right.dateMs)
}

function parseDateLabel(label: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label)
  if (!match) {
    return Number.NaN
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return Number.NaN
  }
  return Date.UTC(year, month - 1, day)
}

function buildYTicks(maxY: number, top: number, plotHeight: number): Array<{ value: number; y: number }> {
  const tickCount = 5
  return Array.from({ length: tickCount }, (_, index) => {
    const value = Math.round((maxY / (tickCount - 1)) * index)
    return {
      value,
      y: roundCoord(top + plotHeight - (value / maxY) * plotHeight),
    }
  })
}

function buildXLabels(points: Array<IPUsageChartPoint & { index?: number }>): Array<{ label: string; x: number }> {
  if (!points.length) {
    return []
  }
  if (points.length === 1) {
    return [{ label: points[0].label.slice(5), x: points[0].x }]
  }
  const middle = points[Math.floor((points.length - 1) / 2)]
  const labels = [points[0], middle, points[points.length - 1]]
  const seen = new Set<string>()
  return labels
    .filter((point) => {
      const key = `${point.label}-${point.x}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .map((point) => ({ label: point.label.slice(5), x: point.x }))
}

function buildSmoothPath(points: IPUsageChartPoint[]): string {
  if (!points.length) {
    return ''
  }
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`
  }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const slopes = computeMonotoneSlopes(xs, ys)
  const segments = [`M ${points[0].x} ${points[0].y}`]
  for (let index = 0; index < points.length - 1; index += 1) {
    const h = xs[index + 1] - xs[index]
    for (let step = 1; step <= 12; step += 1) {
      const t = step / 12
      const y = evalMonotoneCubic(xs[index], ys[index], slopes[index], xs[index + 1], ys[index + 1], slopes[index + 1], t)
      segments.push(`L ${roundCoord(xs[index] + t * h)} ${roundCoord(y)}`)
    }
  }
  return segments.join(' ')
}

function computeMonotoneSlopes(xs: number[], ys: number[]): number[] {
  const n = xs.length
  const d = Array.from({ length: n - 1 }, (_, index) => (ys[index + 1] - ys[index]) / (xs[index + 1] - xs[index]))
  const m = Array.from({ length: n }, () => 0)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let index = 1; index < n - 1; index += 1) {
    m[index] = (d[index - 1] + d[index]) / 2
  }
  for (let index = 0; index < n - 1; index += 1) {
    if (Math.abs(d[index]) < 1e-10) {
      m[index] = 0
      m[index + 1] = 0
    } else {
      const a = m[index] / d[index]
      const b = m[index + 1] / d[index]
      const s = a * a + b * b
      if (s > 9) {
        const t = 3 / Math.sqrt(s)
        m[index] = t * a * d[index]
        m[index + 1] = t * b * d[index]
      }
    }
  }
  return m
}

function evalMonotoneCubic(x0: number, y0: number, m0: number, x1: number, y1: number, m1: number, t: number): number {
  const h = x1 - x0
  const t2 = t * t
  const t3 = t2 * t
  return (
    (2 * t3 - 3 * t2 + 1) * y0
    + (t3 - 2 * t2 + t) * h * m0
    + (-2 * t3 + 3 * t2) * y1
    + (t3 - t2) * h * m1
  )
}

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100
}
