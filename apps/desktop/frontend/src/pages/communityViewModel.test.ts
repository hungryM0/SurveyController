import { describe, expect, it } from 'vitest'
import { buildCommunityIssueUrl, COMMUNITY_REPO_URL } from './communityViewModel'

describe('communityViewModel', () => {
  it('builds an issue url from the repo url', () => {
    expect(buildCommunityIssueUrl(COMMUNITY_REPO_URL)).toBe('https://github.com/SurveyController/SurveyController/issues/new')
  })
})
