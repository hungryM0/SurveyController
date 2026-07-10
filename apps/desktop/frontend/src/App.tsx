import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { AppTheme, LoaderBusy } from './components/ui'
import { Browser, Dialogs, Events, Window } from '@wailsio/runtime'
import CloseConfirmationDialog from './components/CloseConfirmationDialog'
import { useCloseConfirmation } from './hooks/useCloseConfirmation'
import NavRail from './components/NavRail'
import StartupTutorialHint, {
  STARTUP_TUTORIAL_HINT_DELAY_MS,
  shouldScheduleStartupTutorialHint,
} from './components/StartupTutorialHint'
import WindowControls from './components/WindowControls'
import {
  buildDefaultConfig,
  cancelRuntimeConfig,
  confirmClose,
  decodeQRCode,
  decodeQRCodeDataURL,
  dismissStartupTutorialHint,
  exportLogLines,
  loadAppModel,
  loadProxyStatus,
  loadRunTaskState,
  loadRuntimeConfig,
  loadStartupTutorialHint,
  pauseRuntimeConfig,
  previewReverseFill,
  redeemProxyCard,
  resumeRuntimeConfig,
  resetSettings,
  saveRuntimeConfig,
  saveSettings,
  startRuntimeConfig,
  syncProxyStatus,
} from './services/shell'
import {
  applyConfigToShell,
  syncRuntimeDefaultsFromConfig,
  updateAppSettingsField,
  updateRuntimeConfigField,
  type AppModel,
} from './services/stateMapper'
import {
  applyTopmostSetting,
  buildTaskResultNotification,
  shouldAskSaveOnClose,
  shouldNotifyTaskResult,
  showTaskResultNotification,
} from './services/desktopSettings'
import type { ProxyStatus, RunTaskState, RuntimeConfig, ShellState } from './types'
import type { StartupTutorialHintState } from './types'

const DashboardView = lazy(() => import('./pages/DashboardView'))
const RuntimeView = lazy(() => import('./pages/RuntimeView'))
const StrategyView = lazy(() => import('./pages/StrategyView'))
const ReverseFillView = lazy(() => import('./pages/ReverseFillView'))
const LogsView = lazy(() => import('./pages/LogsView'))
const CommunityView = lazy(() => import('./pages/CommunityView'))
const InfoView = lazy(() => import('./pages/InfoView'))
const MoreView = lazy(() => import('./pages/MoreView'))

function App() {
  useEffect(() => {
    document.documentElement.classList.add('platform-windows')
    return () => {
      document.documentElement.classList.remove('platform-windows')
    }
  }, [])

  const [model, setModel] = useState<AppModel | null>(null)
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [runState, setRunState] = useState<RunTaskState | null>(null)
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus | null>(null)
  const [runtimeLogLines, setRuntimeLogLines] = useState<string[]>([])
  const [startupTutorialHint, setStartupTutorialHint] = useState<StartupTutorialHintState | null>(null)
  const [startupTutorialVisible, setStartupTutorialVisible] = useState(false)
  const previousPage = useRef(currentPage)
  const runPollTimer = useRef<number | null>(null)
  const settingsRef = useRef(model?.settings ?? null)
  const configRef = useRef<RuntimeConfig | null>(null)
  const configPathRef = useRef('')
  const notifiedRunEndRef = useRef('')

  const config = model?.config ?? null
  const currentConfig = config ?? model?.config ?? null
  const runBusy = busy || Boolean(runState?.running || runState?.canceling)
  const runPhase = runState?.canceling ? 'canceling' as const
    : runState?.paused ? 'paused' as const
    : (runState?.running || runBusy) ? 'running' as const
    : 'idle' as const

  useEffect(() => {
    settingsRef.current = model?.settings ?? null
    configRef.current = model?.config ?? null
    configPathRef.current = model?.configPath ?? ''
  }, [model])

  const shell = useMemo<ShellState | null>(() => {
    if (!model) {
      return null
    }
    const mapped = applyConfigToShell(
      model.shell,
      model.settings,
      model.config,
      model.reverseFillPreview,
      runState,
      proxyStatus,
    )
    return {
      ...mapped,
      logLines: [...runtimeLogLines, ...mapped.logLines].slice(0, 200),
    }
  }, [model, proxyStatus, runState, runtimeLogLines])

  const stopRunPolling = useCallback(() => {
    if (!runPollTimer.current) {
      return
    }
    window.clearInterval(runPollTimer.current)
    runPollTimer.current = null
  }, [])

  const pollRunState = useCallback(async () => {
    try {
      const [nextRun, nextProxy] = await Promise.all([loadRunTaskState(), loadProxyStatus()])
      setRunState(nextRun)
      setProxyStatus(nextProxy)
      if (!nextRun.running && !nextRun.canceling) {
        stopRunPolling()
        notifyTaskResult(nextRun)
        if (nextRun.events?.length) {
          setRuntimeLogLines((lines) => [
            ...nextRun.events!.map((event) => `[${event.worker || 'core'}] ${event.message}`),
            ...lines,
          ].slice(0, 200))
        }
      }
    } catch (err) {
      stopRunPolling()
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [stopRunPolling])

  async function notifyTaskResult(nextRun: RunTaskState) {
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
  }

  const startRunPolling = useCallback(() => {
    if (runPollTimer.current) {
      return
    }
    runPollTimer.current = window.setInterval(() => {
      void pollRunState()
    }, 500)
    void pollRunState()
  }, [pollRunState])

  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const loaded = await loadAppModel()
        if (ignore) {
          return
        }
        setModel(loaded)
        setCurrentPage(loaded.shell.currentPage || 'dashboard')
        const [proxy, run] = await Promise.allSettled([loadProxyStatus(), loadRunTaskState()])
        if (ignore) {
          return
        }
        if (proxy.status === 'fulfilled') {
          setProxyStatus(proxy.value)
        }
        if (run.status === 'fulfilled') {
          setRunState(run.value)
          if (run.value.running) {
            startRunPolling()
          }
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      ignore = true
      stopRunPolling()
    }
  }, [startRunPolling, stopRunPolling])

  useEffect(() => {
    void applyTopmostSetting(Window, model?.settings).catch(() => undefined)
  }, [model?.settings])

  useEffect(() => {
    if (!model || loading) {
      return
    }
    let active = true
    let timer: number | null = null

    void loadStartupTutorialHint()
      .then((hint) => {
        if (!active || !shouldScheduleStartupTutorialHint(loading, hint.shouldShow)) {
          return
        }
        setStartupTutorialHint(hint)
        timer = window.setTimeout(() => {
          if (active) {
            setStartupTutorialVisible(true)
          }
        }, STARTUP_TUTORIAL_HINT_DELAY_MS)
      })
      .catch(() => undefined)

    return () => {
      active = false
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [loading, model?.settings.startupTutorialHintSeen])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(t)
  }, [notice])

  async function withBusy(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function setConfig(next: RuntimeConfig) {
    setModel((current) => current ? { ...current, config: next } : current)
  }

  function updateConfigField(id: string, value: string | boolean) {
    if (!config) {
      return
    }
    const next = updateRuntimeConfigField(config, id, value)
    setModel((current) => current
      ? {
          ...current,
          config: next,
          settings: syncRuntimeDefaultsFromConfig(current.settings, next, id),
        }
      : current)
  }

  function updateSettingsField(id: string, value: string | boolean) {
    setModel((current) => current
      ? { ...current, settings: updateAppSettingsField(current.settings, id, value) }
      : current)
  }

  function updateURL(value: string) {
    if (!config) {
      return
    }
    setConfig({ ...config, url: value })
  }

  async function autoConfig() {
    await withBusy(async () => {
      if (!config?.url) {
        throw new Error('问卷链接不能为空')
      }
      const next = await buildDefaultConfig(config.url)
      setConfig({
        ...config,
        ...next,
        target: config.target,
        threads: config.threads,
        random_ip_enabled: config.random_ip_enabled,
        proxy_source: config.proxy_source,
      })
      setNotice('问卷配置已生成')
    })
  }

  async function loadConfigFromDialog() {
    await withBusy(async () => {
      const path = await Dialogs.OpenFile({
        Title: '载入配置',
        CanChooseFiles: true,
        Filters: [{ DisplayName: 'JSON 配置', Pattern: '*.json' }],
      })
      if (!path || Array.isArray(path)) {
        return
      }
      const loaded = await loadRuntimeConfig(path)
      setModel((current) => current
        ? { ...current, configPath: loaded.path, config: loaded.config }
        : current)
      setNotice('配置已载入')
    })
  }

  async function loadQRCodeFromDialog() {
    await withBusy(async () => {
      const path = await Dialogs.OpenFile({
        Title: '识别二维码',
        CanChooseFiles: true,
        Filters: [{ DisplayName: '图片文件', Pattern: '*.png;*.jpg;*.jpeg;*.gif' }],
      })
      if (!path || Array.isArray(path)) {
        return
      }
      const decoded = await decodeQRCode(path)
      if (!config) {
        return
      }
      setConfig({ ...config, url: decoded.text })
      setNotice('二维码已识别')
    })
  }

  async function decodeQRCodeFromImageFile(file: File) {
    await withBusy(async () => {
      const decoded = await decodeQRCodeDataURL(await readFileAsDataURL(file), file.name)
      if (!config) {
        return
      }
      setConfig({ ...config, url: decoded.text })
      setNotice('二维码已识别')
    })
  }

  async function saveConfigToDialog() {
    await withBusy(async () => {
      if (!config) {
        return
      }
      const path = await Dialogs.SaveFile({
        Title: '保存配置',
        Filename: `${config.survey_title || 'wjx_config'}.json`,
        Filters: [{ DisplayName: 'JSON 配置', Pattern: '*.json' }],
      })
      if (!path) {
        return
      }
      const saved = await saveRuntimeConfig(config, path)
      setModel((current) => current
        ? { ...current, configPath: saved.path, config: saved.config }
        : current)
      setNotice('配置已保存')
    })
  }

  async function saveCurrentConfig() {
    const current = configRef.current
    if (!current) {
      return
    }
    const saved = await saveRuntimeConfig(current, configPathRef.current)
    setModel((existing) => existing
      ? { ...existing, configPath: saved.path, config: saved.config }
      : existing)
  }

  const closeConfirmation = useCloseConfirmation({
    shouldAsk: () => shouldAskSaveOnClose(settingsRef.current),
    save: saveCurrentConfig,
    confirm: confirmClose,
    close: Window.Close,
    onError: (err) => setError(err.message),
  })

  useEffect(() => Events.On('surveycontroller:close-requested', () => closeConfirmation.requestClose()), [closeConfirmation.requestClose])

  async function exportLogs(path: string, lines: string[]) {
    await withBusy(async () => {
      await exportLogLines(path, lines)
      setNotice('日志已导出')
    })
  }

  async function chooseReverseFillFile() {
    await withBusy(async () => {
      const path = await Dialogs.OpenFile({
        Title: '选择反填 Excel',
        CanChooseFiles: true,
        Filters: [{ DisplayName: 'Excel 文件', Pattern: '*.xlsx;*.xlsm' }],
      })
      if (!path || Array.isArray(path) || !config) {
        return
      }
      setConfig({ ...config, reverse_fill_enabled: true, reverse_fill_source_path: path })
    })
  }

  async function previewReverseFillFile() {
    await withBusy(async () => {
      if (!config) {
        return
      }
      const preview = await previewReverseFill(config)
      setModel((current) => current ? { ...current, reverseFillPreview: preview } : current)
      setNotice(`已预览 ${preview.total_data_rows} 行`)
    })
  }

  async function saveAppSettings() {
    await withBusy(async () => {
      if (!model) {
        return
      }
      const saved = await saveSettings(model.settings)
      setModel((current) => current ? { ...current, settings: saved } : current)
      setNotice('设置已保存')
    })
  }

  async function resetAppSettings() {
    await withBusy(async () => {
      const saved = await resetSettings()
      setModel((current) => current ? { ...current, settings: saved } : current)
      setNotice('设置已恢复默认')
    })
  }

  async function chooseConfigDirectory() {
    await withBusy(async () => {
      if (!model) {
        return
      }
      const path = await Dialogs.OpenFile({
        Title: '选择配置目录',
        CanChooseDirectories: true,
        CanChooseFiles: false,
      })
      if (!path || Array.isArray(path)) {
        return
      }
      setModel((current) => current
        ? { ...current, settings: updateAppSettingsField(current.settings, 'config-directory', path) }
        : current)
      setNotice('配置目录已选中，记得保存')
    })
  }

  async function dismissStartupTutorial() {
    setStartupTutorialVisible(false)
    try {
      const saved = await dismissStartupTutorialHint()
      setModel((current) => current ? { ...current, settings: saved } : current)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function openStartupTutorial() {
    const url = startupTutorialHint?.docUrl || 'https://surveydoc.hungrym0.com/'
    await dismissStartupTutorial()
    try {
      await Browser.OpenURL(url)
    } catch {
      setNotice(url)
    }
  }

  async function runSurvey() {
    await withBusy(async () => {
      if (!config) {
        return
      }
      setRuntimeLogLines([])
      const nextRun = await startRuntimeConfig(config)
      const nextProxy = await loadProxyStatus()
      setRunState(nextRun)
      setProxyStatus(nextProxy)
      startRunPolling()
      setNotice('任务已启动')
    })
  }

  async function cancelRun() {
    await withBusy(async () => {
      const nextRun = await cancelRuntimeConfig()
      const nextProxy = await loadProxyStatus()
      setRunState(nextRun)
      setProxyStatus(nextProxy)
      startRunPolling()
      setNotice('正在停止任务')
    })
  }

  async function pauseRun() {
    await withBusy(async () => {
      const nextRun = await pauseRuntimeConfig('手动暂停')
      setRunState(nextRun)
      startRunPolling()
      setNotice('任务已暂停')
    })
  }

  async function resumeRun() {
    await withBusy(async () => {
      const nextRun = await resumeRuntimeConfig()
      setRunState(nextRun)
      startRunPolling()
      setNotice('任务已恢复')
    })
  }

  async function redeemRandomIpQuota(cardCode: string) {
    if (!cardCode.trim()) {
      return
    }
    await withBusy(async () => {
      const result = await redeemProxyCard(cardCode, config?.proxy_source ?? 'default')
      setProxyStatus(result.status)
      setNotice(result.cardQuotaLabel ? `兑换成功，到账 ${result.cardQuotaLabel}` : '兑换成功')
    })
  }

  async function syncRandomIpQuota() {
    await withBusy(async () => {
      const status = await syncProxyStatus(config?.proxy_source ?? 'default')
      setProxyStatus(status)
      setNotice('随机 IP 额度已同步')
    })
  }

  const scheme = shell?.themeMode === 'dark' || shell?.themeMode === 'light' ? shell.themeMode : 'system'
  const pageMotion = previousPage.current === currentPage ? 'page-motion-initial' : 'page-motion-forward'

  useEffect(() => {
    previousPage.current = currentPage
  }, [currentPage])

  if (loading) {
    return (
      <div className="boot-screen">
        <LoaderBusy isLoading />
      </div>
    )
  }

  if (error && !shell) {
    return (
      <div className="boot-screen">
        <div className="error-panel">
          <AlertCircle size={18} />
          <div>
            <strong>服务连接失败</strong>
            <span>{error}</span>
          </div>
        </div>
      </div>
    )
  }

  if (!shell) {
    return null
  }

  return (
    <div className="app-root">
      <AppTheme scheme={scheme} color="#0067c0" colorDarkMode="#60cdff" />
      <header className="app-titlebar drag-region">
        <div className="brand-block">
          <img className="app-logo" src="/appicon.png" alt="" draggable={false} />
          <div className="brand-text">
            <span>{shell.appTitle}</span>
            <small>{shell.appVersion}</small>
          </div>
        </div>
        <WindowControls onClose={closeConfirmation.requestClose} />
      </header>

      <div className="app-frame">
        <NavRail
          topNav={shell.topNav}
          bottomNav={shell.bottomNav}
          currentPage={currentPage}
          onChange={setCurrentPage}
        />

        <main className="workspace">
          <div className="message-stack">
            {error ? <div className="status-banner status-banner-danger">{error}</div> : null}
            {notice ? <div className="status-banner status-banner-info">{notice}</div> : null}
          </div>

          <Suspense fallback={<PageLoadFallback />}>
            <div key={currentPage} className={`page-transition ${pageMotion}`}>
              {currentPage === 'dashboard' ? (
                <DashboardView
                  dashboard={shell.dashboard}
                  busy={runBusy}
                  runPhase={runPhase}
                  onUpdateUrl={updateURL}
                  onAutoConfig={autoConfig}
                  onLoadQRCode={loadQRCodeFromDialog}
                  onDecodeQRCodeImage={(file) => void decodeQRCodeFromImageFile(file)}
                  onLoadConfig={loadConfigFromDialog}
                  onSaveConfig={saveConfigToDialog}
                  onOpenRuntime={() => setCurrentPage('runtime')}
                  onTargetChange={(value) => updateConfigField('target', String(value))}
                  onThreadsChange={(value) => updateConfigField('threads', String(value))}
                  onRandomIpChange={(value) => updateConfigField('random-ip', value)}
                  onProxySourceChange={(value) => updateConfigField('proxy-source', value)}
                  onSyncProxyStatus={syncRandomIpQuota}
                  onRedeemProxyCard={(cardCode) => void redeemRandomIpQuota(cardCode)}
                  onRun={runSurvey}
                  onCancelRun={cancelRun}
                  onPauseRun={pauseRun}
                  onResumeRun={resumeRun}
                />
              ) : null}
              {currentPage === 'runtime' ? (
                <RuntimeView groups={shell.runtimeGroups} config={currentConfig} onFieldChange={updateConfigField} />
              ) : null}
              {currentPage === 'strategy' ? (
                currentConfig ? <StrategyView config={currentConfig} onConfigChange={setConfig} /> : null
              ) : null}
              {currentPage === 'reverse-fill' ? (
                <ReverseFillView
                  reverseFill={shell.reverseFillPlan}
                  reverseFillPath={config?.reverse_fill_source_path}
                  busy={busy}
                  onChooseReverseFill={chooseReverseFillFile}
                  onPreviewReverseFill={previewReverseFillFile}
                />
              ) : null}
              {currentPage === 'logs' ? <LogsView logs={shell.logLines} busy={busy} onExport={exportLogs} /> : null}
              {currentPage === 'community' ? <CommunityView /> : null}
              {currentPage === 'settings' ? (
                <InfoView
                  title="设置"
                  settings={shell.settingsGroups}
                  busy={busy}
                  onSettingChange={updateSettingsField}
                  onSaveSettings={saveAppSettings}
                  onChooseConfigDirectory={chooseConfigDirectory}
                  onResetSettings={resetAppSettings}
                />
              ) : null}
              {currentPage === 'more' ? (
                <MoreView
                  version={shell.appVersion}
                  aboutItems={shell.aboutItems}
                  donateItems={shell.donateItems}
                  busy={busy}
                  autoCheckUpdate={settingsRef.current?.autoCheckUpdate ?? true}
                />
              ) : null}
            </div>
          </Suspense>
        </main>
      </div>
      {startupTutorialVisible ? (
        <StartupTutorialHint
          onDismiss={() => void dismissStartupTutorial()}
          onOpen={() => void openStartupTutorial()}
        />
      ) : null}
      <CloseConfirmationDialog
        open={closeConfirmation.open}
        busy={closeConfirmation.busy}
        onCancel={closeConfirmation.cancelClose}
        onDiscard={() => void closeConfirmation.closeWithoutSaving()}
        onSave={() => void closeConfirmation.saveAndClose()}
      />
    </div>
  )
}

export default App

function PageLoadFallback() {
  return (
    <div className="page-loading">
      <LoaderBusy isLoading />
    </div>
  )
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}
