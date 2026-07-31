import { useEffect, useState, type MutableRefObject } from 'react'
import { buildAppModel, type AppModel } from '../viewModels/appModel'
import { loadAppBootstrap, loadProxyStatus, loadRunTaskState, syncProxyStatus } from '../services/shell'
import type { AppSettings, ConfigDocument, ProxyStatus, RunTaskState } from '../types'

interface AppBootstrapOptions {
  refs: AppModelRefs
  hydrateRunState: (state: RunTaskState) => void
  setProxyStatus: (status: ProxyStatus | null) => void
  stopRunPolling: () => void
  setError: (message: string) => void
}

export interface AppModelRefs {
  settings: MutableRefObject<AppSettings | null>
  config: MutableRefObject<ConfigDocument | null>
  configPath: MutableRefObject<string>
}

export function useAppBootstrap({
  refs,
  hydrateRunState,
  setProxyStatus,
  stopRunPolling,
  setError,
}: AppBootstrapOptions) {
  const [model, setModel] = useState<AppModel | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    refs.settings.current = model?.settings ?? null
    refs.config.current = model?.config ?? null
    refs.configPath.current = model?.configPath ?? ''
  }, [model])

  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const bootstrap = await loadAppBootstrap()
        if (ignore) return
        const loaded = buildAppModel(
          bootstrap.settings,
          bootstrap.config,
          bootstrap.configPath,
          bootstrap.configExists,
        )
        setModel(loaded)
        const proxyRequest = loaded.config.network.randomProxyEnabled && loaded.config.network.proxySource !== 'custom'
          ? syncProxyStatus(loaded.config.network.proxySource).catch(loadProxyStatus)
          : loadProxyStatus()
        const [proxy, run] = await Promise.allSettled([
          proxyRequest,
          loadRunTaskState(),
        ])
        if (ignore) return
        if (proxy.status === 'fulfilled') setProxyStatus(proxy.value)
        if (run.status === 'fulfilled') hydrateRunState(run.value)
      } catch (cause) {
        if (!ignore) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void load()
    return () => {
      ignore = true
      stopRunPolling()
    }
  }, [hydrateRunState, setError, setProxyStatus, stopRunPolling])

  return { model, setModel, loading, refs }
}
