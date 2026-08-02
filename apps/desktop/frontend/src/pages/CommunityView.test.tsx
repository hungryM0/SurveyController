import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CommunityView from './CommunityView'
import { resolveCommunityQrUrl } from './communityViewModel'

vi.mock('@wailsio/runtime', () => ({
  Browser: { OpenURL: vi.fn() },
}))

describe('CommunityView assets', () => {
  it('keeps community QR asset name stable', () => {
    const url = new URL('/community_qr.png', 'https://example.com/')
    expect(url.pathname).toBe('/community_qr.png')
  })

  it('builds a qr url only for http origins', () => {
    expect(resolveCommunityQrUrl('https://example.com', 'https:')).toBe('https://example.com/community_qr.png')
    expect(resolveCommunityQrUrl('https://example.com', 'file:')).toBe('')
  })

  it('renders community page', () => {
    const html = renderToStaticMarkup(<CommunityView />)
    expect(html).toContain('问题反馈')
    expect(html).toContain('提交 Issue')
    expect(html).not.toContain('仓库讨论')
  })
})
