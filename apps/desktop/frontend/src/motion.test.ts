import { describe, expect, it } from 'vitest'
import { resolvePageMotion } from './motion'

const pageOrder = ['dashboard', 'runtime', 'strategy', 'logs', 'settings']

describe('resolvePageMotion', () => {
  it('keeps the restrained opening motion on the initial page', () => {
    expect(resolvePageMotion('dashboard', 'dashboard', pageOrder)).toBe('page-motion-initial')
  })

  it('uses navigation order for forward and backward motion', () => {
    expect(resolvePageMotion('dashboard', 'strategy', pageOrder)).toBe('page-motion-forward')
    expect(resolvePageMotion('settings', 'runtime', pageOrder)).toBe('page-motion-backward')
  })

  it('falls back to forward motion for pages outside the navigation model', () => {
    expect(resolvePageMotion('unknown', 'dashboard', pageOrder)).toBe('page-motion-forward')
  })
})
