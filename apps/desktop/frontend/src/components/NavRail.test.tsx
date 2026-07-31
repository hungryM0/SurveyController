import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NavItem } from '../types'
import NavRail from './NavRail'

const topNav: NavItem[] = [
  { id: 'workflow', label: '任务', icon: 'home', section: 'top' },
]

const bottomNav: NavItem[] = [
  { id: 'settings', label: '设置', icon: 'settings', section: 'bottom' },
]

describe('NavRail', () => {
  it('keeps accessible names when navigation text is visually hidden', () => {
    const html = renderToStaticMarkup(
      <NavRail
        topNav={topNav}
        bottomNav={bottomNav}
        currentPage="workflow"
        disabled
        onChange={vi.fn()}
      />,
    )

    expect(html).toContain('aria-label="任务"')
    expect(html).toContain('title="任务"')
    expect(html).toContain('aria-label="设置"')
    expect(html).toContain('title="设置"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('tabindex="-1"')
  })
})
