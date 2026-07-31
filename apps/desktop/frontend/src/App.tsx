import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Dialogs, Window } from '@wailsio/runtime'
import { AppTheme, LoaderBusy } from './components/ui'
import CloseConfirmationDialog from './components/CloseConfirmationDialog'
import NavRail from './components/NavRail'
import WindowControls from './components/WindowControls'
import { clearWizardDraftStorage, useConfigurationWizard, type WizardCheckState, type WizardDraft } from './components/config-wizard'
import { useAppBootstrap, type AppModelRefs } from './hooks/useAppBootstrap'
import { useAsyncFeedback } from './hooks/useAsyncFeedback'
import { useConfigDocumentActions } from './hooks/useConfigDocumentActions'
import { useRunControls } from './hooks/useRunControls'
import { useRunTaskPolling } from './hooks/useRunTaskPolling'
import { useSettingsActions } from './hooks/useSettingsActions'
import { useWindowLifecycle } from './hooks/useWindowLifecycle'
import { useWorkspaceEditor } from './hooks/useWorkspaceEditor'
import { applyTopmostSetting } from './services/desktopSettings'
import { checkTask, exportLogLines } from './services/shell'
import { mapAppViewState } from './viewModels/appModel'
import { isNetworkReady } from './viewModels/taskWorkflow'
import { resolvePageMotion } from './motion'
import AppRoutes from './pages/AppRoutes'
import type { AICredentialDraft, AppSettings, ConfigDocument } from './types'

function App() {
  useEffect(() => {
    document.documentElement.classList.add('platform-windows')
    return () => document.documentElement.classList.remove('platform-windows')
  }, [])

  const feedback = useAsyncFeedback()
  const settingsRef = useRef<AppSettings | null>(null)
  const configRef = useRef<ConfigDocument | null>(null)
  const configPathRef = useRef('')
  const refs: AppModelRefs = { settings: settingsRef, config: configRef, configPath: configPathRef }
  const [credential, setCredential] = useState<AICredentialDraft>({ value: '', operation: 'keep' })
  const credentialRef = useRef(credential)
  const [currentPage, setCurrentPage] = useState('task')
  const previousPage = useRef(currentPage)

  const polling = useRunTaskPolling({
    settingsRef,
    setError: feedback.setError,
    setNotice: feedback.setNotice,
  })
  const { model, setModel, loading } = useAppBootstrap({
    refs,
    hydrateRunState: polling.hydrateRunState,
    setProxyStatus: polling.setProxyStatus,
    stopRunPolling: polling.stopRunPolling,
    setError: feedback.setError,
  })
  const editor = useWorkspaceEditor({ model, setModel, credential, setCredential })

  useEffect(() => {
    credentialRef.current = credential
  }, [credential])

  const configActions = useConfigDocumentActions({
    config: editor.config,
    configRef,
    configPathRef,
    setModel,
    setConfig: editor.setConfig,
    withBusy: feedback.withBusy,
    setNotice: feedback.setNotice,
  })
  const settingsActions = useSettingsActions({
    settingsRef,
    credentialRef,
    setCredential,
    setModel,
    withBusy: feedback.withBusy,
    setNotice: feedback.setNotice,
  })
  const runControls = useRunControls({
    config: editor.config,
    persistSettings: settingsActions.persistSettings,
    hydrateRunState: polling.hydrateRunState,
    setProxyStatus: polling.setProxyStatus,
    startRunPolling: polling.startRunPolling,
    resetLogs: polling.resetLogs,
    withBusy: feedback.withBusy,
    setNotice: feedback.setNotice,
  })
  const { openWizard, requestWizardDismiss, wizardProps } = useConfigurationWizard({
    loading,
    config: editor.config,
    configExists: model?.configExists ?? false,
    configPath: model?.configPath ?? '',
    settings: editor.settings,
    credential,
    onPersisted: ({ config, configPath, settings, credential: savedCredential }) => {
      setCredential(savedCredential)
      setModel((current) => current
        ? { ...current, config, configPath, configExists: true, settings }
        : current)
    },
    onNotice: feedback.setNotice,
    onComplete: () => setCurrentPage('task'),
  })
  const closeConfirmation = useWindowLifecycle({
    settingsRef,
    saveConfig: configActions.saveCurrentConfig,
    saveSettings: settingsActions.persistSettings,
    setError: feedback.setError,
    guardClose: requestWizardDismiss,
  })

  function openTaskWizard() {
    setCurrentPage('task')
    openWizard()
  }

  useEffect(() => {
    void applyTopmostSetting(Window, model?.settings).catch(() => undefined)
  }, [model?.settings])

  const view = useMemo(() => {
    if (!model) return null
    const mapped = mapAppViewState(model, credential, polling.runState, polling.proxyStatus)
    return { ...mapped, logLines: polling.runtimeLogLines }
  }, [credential, model, polling.proxyStatus, polling.runState, polling.runtimeLogLines])
  const pageOrder = view ? [...view.topNav, ...view.bottomNav].map((item) => item.id) : []
  const pageMotion = resolvePageMotion(previousPage.current, currentPage, pageOrder)

  useEffect(() => {
    previousPage.current = currentPage
  }, [currentPage])

  async function runSurvey() {
    if (!editor.config) return
    if (!isNetworkReady(editor.config, polling.proxyStatus)) {
      feedback.setError('代理状态尚未确认，或代理连接测试失败。请先检查网络设置。')
      return
    }
    try {
      const checked = await checkTask(editor.config, editor.settings?.aiProfile, credential)
      if (checked.status === 'blocked') {
        feedback.setError(checked.problems?.[0]?.message || '当前配置无法启动。')
        return
      }
    } catch (cause) {
      feedback.setError(cause instanceof Error ? cause.message : String(cause))
      return
    }
    await runControls.runSurvey()
  }

  async function checkWizardTask(draft: WizardDraft): Promise<WizardCheckState> {
    const checked = await checkTask(draft.config, draft.aiProfile, draft.credential)
    return {
      status: String(checked.status) as WizardCheckState['status'],
      problems: (checked.problems ?? []).map((problem) => ({
        code: problem.code,
        message: problem.message,
        step: problem.step,
        severity: problem.severity,
      })),
    }
  }

  async function exportRunResult() {
    const path = await Dialogs.SaveFile({
      Title: '导出任务结果',
      Filename: 'surveycontroller-result.json',
      Filters: [{ DisplayName: 'JSON 文件', Pattern: '*.json' }],
    })
    if (!path || Array.isArray(path)) return
    const payload = JSON.stringify({
      result: polling.runState?.result ?? null,
      logs: polling.runtimeLogLines,
    }, null, 2)
    await exportLogLines(path, payload.split('\n'))
    feedback.setNotice('任务结果已导出')
  }

  function changePage(nextPage: string) {
    if (nextPage === 'task') {
      setCurrentPage('task')
      openTaskWizard()
      return
    }
    if (nextPage === currentPage) return
    if (wizardProps.open) {
      requestWizardDismiss(() => setCurrentPage(nextPage))
      return
    }
    setCurrentPage(nextPage)
  }

  const taskWizardProps = {
    ...wizardProps,
    onCheckTask: checkWizardTask,
    proxyStatus: polling.proxyStatus,
    onProxyStatusChange: polling.setProxyStatus,
    runTaskState: polling.runState,
    runLogs: polling.runtimeLogLines,
    runError: polling.runState?.error,
    runResult: polling.runState?.result,
    onStartRun: runSurvey,
    onPauseRun: runControls.pauseSurvey,
    onResumeRun: runControls.resumeSurvey,
    onStopRun: runControls.cancelSurvey,
    onExportResult: exportRunResult,
  }

  if (loading) return <BootScreen />
  if (feedback.error && !view) return <BootError message={feedback.error} />
  if (!view) return null

  return (
    <div className="app-root">
      <AppTheme scheme={view.themeMode === 'dark' || view.themeMode === 'light' ? view.themeMode : 'system'} color="#0067c0" colorDarkMode="#60cdff" />
      <header className="app-titlebar drag-region">
        <div className="brand-block">
          <img className="app-logo" src="/appicon.png" alt="" draggable={false} />
          <div className="brand-text"><span>{view.appTitle}</span><small>{view.appVersion}</small></div>
        </div>
        <WindowControls onClose={closeConfirmation.requestClose} />
      </header>

      <div className="app-frame">
        <NavRail topNav={view.topNav} bottomNav={view.bottomNav} currentPage={currentPage} onChange={changePage} />
        <main className="workspace">
          <div className="message-stack">
            {feedback.error ? <div className="status-banner status-banner-danger">{feedback.error}</div> : null}
            {feedback.notice ? <div className="status-banner status-banner-info">{feedback.notice}</div> : null}
          </div>
          <Suspense fallback={<PageLoadFallback />}>
            <div key={currentPage} className={`page-transition ${pageMotion}`}>
              <AppRoutes
                currentPage={currentPage}
                view={view}
                busy={feedback.busy}
                autoCheckUpdate={settingsRef.current?.autoCheckUpdate ?? true}
                settingsActions={settingsActions}
                editor={editor}
                wizardProps={taskWizardProps}
                onOpenTaskWizard={openTaskWizard}
              />
            </div>
          </Suspense>
        </main>
      </div>
      <CloseConfirmationDialog
        open={closeConfirmation.open}
        busy={closeConfirmation.busy}
        onCancel={closeConfirmation.cancelClose}
        onDiscard={() => {
          clearWizardDraftStorage()
          void closeConfirmation.closeWithoutSaving()
        }}
        onSave={() => void closeConfirmation.saveAndClose()}
      />
    </div>
  )
}

function BootScreen() {
  return <div className="boot-screen"><LoaderBusy isLoading /></div>
}

function BootError({ message }: { message: string }) {
  return <div className="boot-screen"><div className="error-panel"><AlertCircle size={18} /><div><strong>应用加载失败</strong><span>{message}</span></div></div></div>
}

function PageLoadFallback() {
  return <div className="page-loading"><LoaderBusy isLoading /></div>
}

export default App
