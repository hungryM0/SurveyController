import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CommunityView from './CommunityView'
import { resolveCommunityQrUrl } from './communityViewModel'

vi.mock('@wailsio/runtime', () => ({
  Browser: { OpenURL: vi.fn() },
}))

vi.mock('../services/shell', () => ({
  loadContactStatus: vi.fn(),
  submitContactMessage: vi.fn(),
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

  it('renders community page with config/log props', () => {
    const html = renderToStaticMarkup(<CommunityView config={{ url: 'https://example.com/s/1' }} logLines={['[core] done']} />)
    expect(html).toContain('联系开发者')
  })
})
