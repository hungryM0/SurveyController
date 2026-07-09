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

export const MORE_REPO_URL = 'https://github.com/SurveyController/SurveyController'
export const MORE_RELEASES_URL = `${MORE_REPO_URL}/releases/latest`
export const WINDOWS_STABLE_RELEASE_BASE_URL = 'https://dl.hungrym0.com/surveycontroller/win/stable/'
export const WINDOWS_STABLE_MANIFEST_URL = `${WINDOWS_STABLE_RELEASE_BASE_URL}latest.json`
export const WINDOWS_STABLE_FEED_URL = `${WINDOWS_STABLE_RELEASE_BASE_URL}releases.stable.json`
export const WINDOWS_LATEST_SETUP_URL = 'https://dl.hungrym0.com/SurveyController_latest_setup.exe'

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

function parseVersionParts(value: string): number[] {
  const normalized = normalizeVersion(value)
  if (!normalized) {
    return []
  }
  const core = normalized.split(/[+-]/)[0]
  const parts = core.split('.').map((item) => Number.parseInt(item, 10))
  return parts.map((item) => (Number.isFinite(item) ? item : 0))
}
