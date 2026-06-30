export const COMMUNITY_REPO_URL = 'https://github.com/SurveyController/SurveyController'

export function buildCommunityIssueUrl(baseRepoUrl: string): string {
  return `${baseRepoUrl.replace(/\/$/, '')}/issues/new`
}

export function resolveCommunityQrUrl(origin: string, protocol: string): string {
  if (!protocol.startsWith('http')) {
    return ''
  }
  return new URL('/community_qr.png', origin).toString()
}
