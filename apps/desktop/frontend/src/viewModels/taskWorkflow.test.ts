import { describe, expect, it } from 'vitest'
import { RunTaskStatus } from '../../bindings/github.com/hungrym0/SurveyController/apps/desktop/models'
import { createTestConfig, createTestQuestion, createTestQuestionEntry } from '../test/configFactory'
import {
  formatRunLogEvent,
  formatRunResultSummary,
  fingerprintConfig,
  getStatusPresentation,
  mapTaskLifecycleStatus,
  mapTaskWorkflow,
  mapWorkflowCheck,
  mapRunTaskStatus,
  isNetworkReady,
} from './taskWorkflow'
import type { ProxyStatus, RunTaskEvent, RunTaskState } from '../types'

function parsedConfig(): ReturnType<typeof createTestConfig> {
  return createTestConfig((config) => {
    config.survey.url = 'https://www.wjx.cn/vm/demo.aspx'
    config.survey.definition.questions = [createTestQuestion()]
    config.answers.questions = [createTestQuestionEntry()]
  })
}

function readyProxy(): ProxyStatus {
  return {
    available: 1,
    inUse: 0,
    userId: 1,
    userKnown: true,
    poolRemainingIp: 1,
    poolRemainingKnown: true,
    remainingQuota: '10',
    totalQuota: '10',
    quotaKnown: true,
    randomIpEnabled: true,
    source: 'default',
    message: '',
    quota: { RemainingQuota: 10, TotalQuota: 10, UsedQuota: 0, QuotaKnown: true },
  }
}

describe('task workflow view model', () => {
  it('requires a real parsed question before later steps are accessible', () => {
    const config = createTestConfig((value) => { value.survey.url = 'https://www.wjx.cn/vm/demo.aspx' })
    const workflow = mapTaskWorkflow({ config, currentStep: 'answers' })

    expect(workflow.steps.map((step) => step.state)).toEqual(['available', 'locked', 'locked', 'locked', 'locked', 'locked'])
    expect(workflow.check.issues[0]).toMatchObject({ step: 'survey', severity: 'error' })
    expect(workflow.status).toBe('new')
  })

  it('maps completed configuration through network and invalidates a stale check', () => {
    const config = parsedConfig()
    const initial = mapTaskWorkflow({ config })
    const checked = mapTaskWorkflow({ config, checkedConfigFingerprint: initial.configFingerprint })

    expect(checked.check.level).toBe('ready')
    expect(checked.canStart).toBe(true)
    expect(checked.steps.slice(0, 4).every((step) => step.completed)).toBe(true)
    expect(mapTaskWorkflow({ config }).status).toBe('needs_check')

    config.execution.target = 2
    const changed = mapTaskWorkflow({ config, checkedConfigFingerprint: checked.configFingerprint })
    expect(changed.check.isStale).toBe(true)
    expect(changed.steps[4].completed).toBe(false)
    expect(changed.steps[5].accessible).toBe(false)
    expect(changed.canStart).toBe(false)
  })

  it('requires a confirmed proxy state only when random proxy is enabled', () => {
    const config = parsedConfig()
    config.network.randomProxyEnabled = true
    expect(mapWorkflowCheck(config).level).toBe('blocked')
    expect(mapWorkflowCheck(config, readyProxy()).level).toBe('ready')
    config.network.proxySource = 'custom'
    expect(mapWorkflowCheck(config, readyProxy()).level).toBe('blocked')
    expect(mapWorkflowCheck(config, { ...readyProxy(), source: 'custom' }).level).toBe('ready')
    config.network.randomProxyEnabled = false
    expect(mapWorkflowCheck(config).level).toBe('ready')
  })

  it('requires a valid fixed proxy address and treats direct mode as independent of stale data', () => {
    const config = parsedConfig()
    config.network.proxyMode = 'fixed'
    config.network.fixedProxyAddress = ''
    expect(isNetworkReady(config, null)).toBe(false)
    expect(mapWorkflowCheck(config).issues[0]).toMatchObject({ field: 'network', step: 'network' })

    config.network.fixedProxyAddress = 'ftp://proxy.example:8080'
    expect(isNetworkReady(config, null)).toBe(false)

    config.network.fixedProxyAddress = 'proxy.example:8080'
    expect(isNetworkReady(config, null)).toBe(true)
    expect(mapWorkflowCheck(config).level).toBe('ready')

    config.network.proxyMode = 'direct'
    config.network.fixedProxyAddress = 'ftp://stale.example:8080'
    expect(isNetworkReady(config, null)).toBe(true)
  })

  it('keeps a blocked backend check from making the run step available', () => {
    const config = parsedConfig()
    const workflow = mapTaskWorkflow({
      config,
      checkedConfigFingerprint: fingerprintConfig(config),
      checkedStatus: 'blocked',
    })

    expect(workflow.check.level).toBe('blocked')
    expect(workflow.canStart).toBe(false)
    expect(workflow.steps[5].accessible).toBe(false)
  })

  it('maps runtime states with text, icon, and tone', () => {
    const completion = [true, true, true, true]
    const check = { level: 'ready' as const, isStale: false }
    expect(mapTaskLifecycleStatus({ status: RunTaskStatus.RunTaskStatusPaused, nextSequence: 0, droppedEvents: 0 }, completion, check)).toBe('paused')
    expect(getStatusPresentation('canceling')).toEqual({ label: '正在停止', icon: 'loader-circle', tone: 'warning' })
    expect(getStatusPresentation('failed')).toEqual({ label: '运行失败', icon: 'circle-x', tone: 'danger' })
  })

  it('formats real result values and preserves unknown result fields', () => {
    expect(formatRunResultSummary(undefined)).toMatchObject({ status: '尚未启动', success: '未知', failed: '未知', total: '未知' })
    expect(formatRunResultSummary({ success: 3, fail: 1, stopped: false, thread_progress: null })).toMatchObject({ status: '已完成', success: '3', failed: '1', total: '4' })
    expect(formatRunResultSummary({ success: Number.NaN, fail: 1, stopped: true, thread_progress: null }).success).toBe('未知')
  })

  it('formats log events without inventing absent values', () => {
    expect(formatRunLogEvent(null)).toMatchObject({ message: '尚未启动', time: '未知', progress: '未知' })
    const event: RunTaskEvent = {
      sequence: 4,
      event: { worker: 'Worker-1', message: '提交成功', success: true, fail: false, current: 2, total: 5, time: '10:00' },
    }
    expect(formatRunLogEvent(event)).toMatchObject({ sequence: '4', worker: 'Worker-1', icon: 'circle-check', tone: 'success', progress: '2 / 5' })
  })

  it('maps all runtime status labels required by the workflow', () => {
    expect(['idle', 'running', 'paused', 'canceling', 'succeeded', 'failed', 'stopped'].map((status) => {
      const state: RunTaskState = { status: status as RunTaskState['status'], nextSequence: 0, droppedEvents: 0 }
      return getStatusPresentation(status === 'idle'
        ? mapTaskLifecycleStatus(state, [false, false, false, false], { level: 'blocked', isStale: false })
        : mapTaskLifecycleStatus(state, [true, true, true, true], { level: 'ready', isStale: false })).label
    })).toEqual(['新建', '运行中', '已暂停', '正在停止', '已完成', '运行失败', '已完成'])
    expect(getStatusPresentation(mapRunTaskStatus(RunTaskStatus.RunTaskStatusIdle)).label).toBe('新建')
  })
})
