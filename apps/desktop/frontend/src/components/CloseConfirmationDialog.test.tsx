import { describe, expect, it } from 'vitest'
import { closeConfirmationCopy } from './CloseConfirmationDialog'

describe('CloseConfirmationDialog', () => {
  it('keeps all close choices explicit', () => {
    expect(closeConfirmationCopy.title).toBe('保存当前配置？')
    expect(closeConfirmationCopy.cancel).toBe('取消')
    expect(closeConfirmationCopy.discard).toBe('不保存并关闭')
    expect(closeConfirmationCopy.save).toBe('保存并关闭')
  })
})
