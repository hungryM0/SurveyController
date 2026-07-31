import { describe, expect, it } from 'vitest'
import { RunTaskStatus } from '../../bindings/github.com/hungrym0/SurveyController/apps/desktop/models'
import { mergeRunTaskState } from './useRunTaskPolling'

describe('mergeRunTaskState', () => {
  it('keeps the latest real event when a polling response has no new events', () => {
    const previous = {
      runId: 'run-1',
      status: RunTaskStatus.RunTaskStatusRunning,
      nextSequence: 2,
      droppedEvents: 0,
      events: [{ sequence: 1, event: { worker: 'core', message: '处理中', success: false, fail: false, current: 2, total: 5, time: '' } }],
    }
    const next = { ...previous, events: [] }

    expect(mergeRunTaskState(previous, next).events).toEqual(previous.events)
  })

  it('resets event history when the task changes', () => {
    const previous = {
      runId: 'run-1',
      status: RunTaskStatus.RunTaskStatusSucceeded,
      nextSequence: 5,
      droppedEvents: 0,
      events: [{ sequence: 4, event: { worker: 'core', message: '完成', success: true, fail: false, current: 3, total: 3, time: '1s' } }],
    }
    const next = {
      runId: 'run-2',
      status: RunTaskStatus.RunTaskStatusRunning,
      nextSequence: 2,
      droppedEvents: 0,
      events: [{ sequence: 1, event: { worker: 'core', message: '开始', success: false, fail: false, current: 1, total: 3, time: '' } }],
    }

    expect(mergeRunTaskState(previous, next).events).toEqual(next.events)
  })
})
