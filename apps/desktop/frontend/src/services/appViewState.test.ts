import { describe, expect, it } from 'vitest'
import { createBaseAppViewState } from './appViewState'

describe('createBaseAppViewState', () => {
  it('keeps the task flow as the only primary destination', () => {
    const view = createBaseAppViewState('5.0.0')

    expect(view.currentPage).toBe('task')
    expect(view.topNav).toEqual([
      { id: 'task', label: '任务', icon: 'home', section: 'top', selected: true },
    ])
    expect(view.bottomNav.map((item) => item.id)).toEqual(['settings', 'community', 'more'])
  })
})
