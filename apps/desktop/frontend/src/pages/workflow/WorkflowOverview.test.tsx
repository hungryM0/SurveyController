import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildAppModel, mapAppViewState } from '../../viewModels/appModel'
import { createTestConfig, createTestQuestion, createTestQuestionEntry, createTestSettings } from '../../test/configFactory'
import WorkflowOverview from './WorkflowOverview'

function dashboard(configure?: Parameters<typeof createTestConfig>[0]) {
  return mapAppViewState(
    buildAppModel(createTestSettings(), createTestConfig(configure)),
    { value: '', operation: 'keep' },
  ).dashboard
}

const callbacks = {
  onOpenWizard: vi.fn(),
  onRun: vi.fn(),
  onCancelRun: vi.fn(),
  onPauseRun: vi.fn(),
  onResumeRun: vi.fn(),
  onOpenRuntime: vi.fn(),
  onOpenStrategy: vi.fn(),
  onOpenReverseFill: vi.fn(),
  onOpenLogs: vi.fn(),
}

function renderOverview(props: Partial<ComponentProps<typeof WorkflowOverview>> = {}) {
  return renderToStaticMarkup(
    <WorkflowOverview
      dashboard={dashboard()}
      busy={false}
      runPhase="idle"
      canRun={false}
      runBlockedReason="请先输入问卷链接。"
      {...callbacks}
      {...props}
    />,
  )
}

describe('WorkflowOverview', () => {
  it('starts from the first incomplete step and blocks running', () => {
    const html = renderOverview()

    expect(html).toContain('准备一次问卷任务')
    expect(html).toContain('aria-current="step"')
    expect(html).not.toContain('添加链接并解析结构')
    expect(html).toContain('请先输入问卷链接。')
    expect(html).toContain('尚未生成')
    expect(html).not.toContain('高级编辑')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="请先输入问卷链接。"|<button[^>]*title="请先输入问卷链接。"[^>]*disabled=""/)
  })

  it('shows a compact ready summary and keeps advanced editors reachable', () => {
    const readyDashboard = dashboard((config) => {
      config.survey.url = 'https://www.wjx.cn/vm/example.aspx'
      config.survey.title = '产品体验问卷'
      config.survey.definition.questions = [createTestQuestion()]
      config.answers.questions = [createTestQuestionEntry()]
      config.execution.target = 20
      config.execution.threads = 2
    })
    const html = renderOverview({ dashboard: readyDashboard, canRun: true })

    expect(html).toContain('配置已就绪')
    expect(html).toContain('产品体验问卷')
    expect(html).toContain('20 份 · 2 路')
    expect(html).toContain('题目策略')
    expect(html).toContain('反填数据')
    expect(html).toContain('高级参数')
    expect(html).toContain('开始执行')
  })

  it('keeps pause and stop available while a task is running', () => {
    const html = renderOverview({ runPhase: 'running', canRun: true, dashboard: { ...dashboard(), statusText: '运行中' } })

    expect(html).toContain('暂停')
    expect(html).toContain('停止')
    expect(html).not.toContain('>开始执行<')
  })
})
