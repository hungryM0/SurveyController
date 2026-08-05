import { describe, expect, it } from 'vitest'
import { firstSupportedQRImageFile, isSupportedQRImage } from './qrImage'

describe('wizard QR image input', () => {
  it('accepts image MIME types and legacy image extensions', () => {
    expect(isSupportedQRImage(new File(['qr'], 'wechat-image', { type: 'image/png' }))).toBe(true)
    expect(isSupportedQRImage(new File(['qr'], 'wechat-image.bmp', { type: '' }))).toBe(true)
    expect(isSupportedQRImage(new File(['text'], 'notes.txt', { type: 'text/plain' }))).toBe(false)
  })

  it('selects the first supported image from a pasted or dropped file list', () => {
    const text = new File(['text'], 'notes.txt', { type: 'text/plain' })
    const image = new File(['qr'], 'survey.png', { type: 'image/png' })

    expect(firstSupportedQRImageFile([text, image])).toBe(image)
    expect(firstSupportedQRImageFile([text])).toBeNull()
  })
})
