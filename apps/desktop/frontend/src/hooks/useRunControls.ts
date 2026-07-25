import { useCallback } from 'react'
import {
  cancelRun,
  loadProxyStatus,
  pauseRun,
  redeemProxyCard,
  resumeRun,
  startRun,
  syncProxyStatus,
  testAIConnection,
} from '../services/shell'
import type { AIConnectionTestState, AppSettings, ConfigDocument, ProxyStatus, RunTaskState } from '../types'

interface RunControlsOptions {
  config: ConfigDocument | null
  persistSettings: () => Promise<AppSettings>
  hydrateRunState: (state: RunTaskState) => void
  setProxyStatus: (status: ProxyStatus | null) => void
  startRunPolling: () => void
  resetLogs: () => void
  withBusy: (action: () => Promise<void>) => Promise<void>
  setNotice: (message: string) => void
}

export function useRunControls({
  config,
  persistSettings,
  hydrateRunState,
  setProxyStatus,
  startRunPolling,
  resetLogs,
  withBusy,
  setNotice,
}: RunControlsOptions) {
  const runSurvey = useCallback(async () => {
    await withBusy(async () => {
      if (!config) return
      await persistSettings()
      resetLogs()
      const [nextRun, nextProxy] = await Promise.all([startRun(config), loadProxyStatus()])
      hydrateRunState(nextRun)
      setProxyStatus(nextProxy)
      startRunPolling()
      setNotice('任务已启动')
    })
  }, [config, hydrateRunState, persistSettings, resetLogs, setNotice, setProxyStatus, startRunPolling, withBusy])

  const cancelSurvey = useCallback(async () => {
    await withBusy(async () => {
      const [nextRun, nextProxy] = await Promise.all([cancelRun(), loadProxyStatus()])
      hydrateRunState(nextRun)
      setProxyStatus(nextProxy)
      startRunPolling()
      setNotice('正在停止任务')
    })
  }, [hydrateRunState, setNotice, setProxyStatus, startRunPolling, withBusy])

  const pauseSurvey = useCallback(async () => {
    await withBusy(async () => {
      hydrateRunState(await pauseRun('手动暂停'))
      startRunPolling()
      setNotice('任务已暂停')
    })
  }, [hydrateRunState, setNotice, startRunPolling, withBusy])

  const resumeSurvey = useCallback(async () => {
    await withBusy(async () => {
      hydrateRunState(await resumeRun())
      startRunPolling()
      setNotice('任务已恢复')
    })
  }, [hydrateRunState, setNotice, startRunPolling, withBusy])

  const redeemRandomIpQuota = useCallback(async (cardCode: string) => {
    if (!cardCode.trim()) return
    await withBusy(async () => {
      const result = await redeemProxyCard(cardCode, config?.network.proxySource ?? 'default')
      setProxyStatus(result.status)
      setNotice(result.cardQuotaLabel ? `兑换成功，到账 ${result.cardQuotaLabel}` : '兑换成功')
    })
  }, [config, setNotice, setProxyStatus, withBusy])

  const syncRandomIpQuota = useCallback(async () => {
    await withBusy(async () => {
      const status = await syncProxyStatus(config?.network.proxySource ?? 'default')
      setProxyStatus(status)
      setNotice('随机 IP 额度已同步')
    })
  }, [config, setNotice, setProxyStatus, withBusy])

  const testAI = useCallback(async (): Promise<AIConnectionTestState> => {
    const saved = await persistSettings()
    return await testAIConnection(saved.aiProfile)
  }, [persistSettings])

  return {
    runSurvey,
    cancelSurvey,
    pauseSurvey,
    resumeSurvey,
    redeemRandomIpQuota,
    syncRandomIpQuota,
    testAI,
  }
}
