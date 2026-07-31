import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { loadProxyStatus, loadRunTaskState } from '../services/shell'
import {
  buildTaskResultNotification,
  shouldNotifyTaskResult,
  showTaskResultNotification,
} from '../services/desktopSettings'
import type { AppSettings, ProxyStatus, RunTaskState } from '../types'

interface RunTaskPollingOptions {
  settingsRef: MutableRefObject<AppSettings | null>
  setError: (message: string) => void
  setNotice: (message: string) => void
}

export function useRunTaskPolling({ settingsRef, setError, setNotice }: RunTaskPollingOptions) {
  const [runState, setRunState] = useState<RunTaskState | null>(null)
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus | null>(null)
  const [runtimeLogLines, setRuntimeLogLines] = useState<string[]>([])
  const runPollTimer = useRef<number | null>(null)
  const notifiedRunEndRef = useRef('')
  const runCursorRef = useRef({ runId: '', sequence: 0 })
  const runStateRef = useRef<RunTaskState | null>(null)

  const stopRunPolling = useCallback(() => {
    if (runPollTimer.current === null) {
      return
    }
    window.clearInterval(runPollTimer.current)
    runPollTimer.current = null
  }, [])

  const notifyTaskResult = useCallback(async (nextRun: RunTaskState) => {
    if (!shouldNotifyTaskResult(settingsRef.current)) {
      return
    }
    const message = buildTaskResultNotification(nextRun)
    if (!message) {
      return
    }
    const key = `${nextRun.endedAt || ''}:${message.title}:${message.body}`
    if (key === notifiedRunEndRef.current) {
      return
    }
    notifiedRunEndRef.current = key
    const notificationApi = typeof Notification === 'undefined' ? undefined : Notification
    const shown = await showTaskResultNotification(notificationApi, message).catch(() => false)
    if (!shown) {
      setNotice(message.body)
    }
  }, [setNotice, settingsRef])

  const pollRunState = useCallback(async () => {
    try {
      const cursor = runCursorRef.current
      const [nextRun, nextProxy] = await Promise.all([
        loadRunTaskState(cursor.runId, cursor.sequence),
        loadProxyStatus(),
      ])
      const runChanged = Boolean(cursor.runId && nextRun.runId !== cursor.runId)
      runCursorRef.current = {
        runId: nextRun.runId ?? '',
        sequence: nextRun.nextSequence,
      }
      const newLines = (nextRun.events ?? []).map(({ event }) => `[${event.worker || 'core'}] ${event.message}`)
      if (runChanged || newLines.length) {
        setRuntimeLogLines((lines) => (runChanged ? newLines : [...lines, ...newLines]).slice(-200))
      }
      const mergedRun = mergeRunTaskState(runStateRef.current, nextRun)
      runStateRef.current = mergedRun
      setRunState(mergedRun)
      setProxyStatus(nextProxy)
      if (!isRunActive(nextRun.status)) {
        stopRunPolling()
        await notifyTaskResult(nextRun)
      }
    } catch (err) {
      stopRunPolling()
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [notifyTaskResult, setError, stopRunPolling])

  const startRunPolling = useCallback(() => {
    if (runPollTimer.current !== null) {
      return
    }
    runPollTimer.current = window.setInterval(() => {
      void pollRunState()
    }, 500)
    void pollRunState()
  }, [pollRunState])

  const hydrateRunState = useCallback((nextRun: RunTaskState) => {
    runStateRef.current = nextRun
    setRunState(nextRun)
    runCursorRef.current = {
      runId: nextRun.runId ?? '',
      sequence: nextRun.nextSequence,
    }
    if (nextRun.events?.length) {
      setRuntimeLogLines(nextRun.events.map(({ event }) => `[${event.worker || 'core'}] ${event.message}`).slice(-200))
    }
    if (isRunActive(nextRun.status)) {
      startRunPolling()
    }
  }, [startRunPolling])

  const resetLogs = useCallback(() => {
    setRuntimeLogLines([])
  }, [])

  useEffect(() => () => stopRunPolling(), [stopRunPolling])

  return {
    runState,
    setRunState,
    proxyStatus,
    setProxyStatus,
    runtimeLogLines,
    setRuntimeLogLines,
    startRunPolling,
    stopRunPolling,
    hydrateRunState,
    resetLogs,
  }
}

export function mergeRunTaskState(previous: RunTaskState | null, next: RunTaskState): RunTaskState {
  const runChanged = Boolean(previous?.runId && next.runId && previous.runId !== next.runId)
  if (runChanged) return next

  const eventsBySequence = new Map<number, NonNullable<RunTaskState['events']>[number]>()
  for (const event of [...(previous?.events ?? []), ...(next.events ?? [])]) {
    eventsBySequence.set(event.sequence, event)
  }
  const events = [...eventsBySequence.values()]
    .sort((left, right) => left.sequence - right.sequence)
    .slice(-200)
  return { ...next, events }
}

export function isRunActive(status?: RunTaskState['status']): boolean {
  return status === 'running' || status === 'paused' || status === 'canceling'
}
