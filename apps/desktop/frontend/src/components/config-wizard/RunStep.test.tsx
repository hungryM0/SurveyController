import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RunTaskState } from '../../types'
import RunStep from './RunStep'

describe('RunStep', () => {
  it('shows an honest idle state without inventing progress or results', () => {
    const html = renderToStaticMarkup(<RunStep />)

    expect(html).toContain('尚未启动')
    expect(html).not.toContain('当前进度')
    expect(html).not.toContain('任务结果')
    expect(html).not.toContain('成功</dt>')
  })

  it('renders only supplied running state, logs, and result actions', () => {
    const onPause = vi.fn()
    const onStop = vi.fn()
    const onExportResult = vi.fn()
    const html = renderToStaticMarkup(
      <RunStep
        runTaskState={{
          status: 'running' as RunTaskState['status'],
          runId: 'run-1',
          nextSequence: 2,
          droppedEvents: 0,
          events: [{
            sequence: 1,
            event: { worker: '线程 1', message: '正在提交', success: false, fail: false, current: 2, total: 5, time: '' },
          }],
        }}
        logs={['已读取题目', '正在提交']}
        result={{ success: 2, fail: 1, stopped: false }}
        onPause={onPause}
        onStop={onStop}
        onExportResult={onExportResult}
      />,
    )

    expect(html).toContain('运行中')
    expect(html).toContain('2 / 5')
    expect(html).toContain('已读取题目')
    expect(html).toContain('任务结果')
    expect(html).toContain('导出结果')
    expect(onPause).not.toHaveBeenCalled()
  })
})
