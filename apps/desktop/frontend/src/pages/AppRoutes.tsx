import { lazy } from 'react'
import type { useConfigDocumentActions } from '../hooks/useConfigDocumentActions'
import type { useRunControls } from '../hooks/useRunControls'
import type { useSettingsActions } from '../hooks/useSettingsActions'
import type { useWorkspaceEditor } from '../hooks/useWorkspaceEditor'
import type { AppViewState } from '../types'
import type { RunPhase } from './dashboard/types'

const DashboardView = lazy(() => import('./DashboardView'))
const RuntimeView = lazy(() => import('./RuntimeView'))
const StrategyView = lazy(() => import('./StrategyView'))
const ReverseFillView = lazy(() => import('./ReverseFillView'))
const LogsView = lazy(() => import('./LogsView'))
const CommunityView = lazy(() => import('./CommunityView'))
const InfoView = lazy(() => import('./InfoView'))
const MoreView = lazy(() => import('./MoreView'))

interface AppRoutesProps {
  currentPage: string
  view: AppViewState
  busy: boolean
  runBusy: boolean
  runPhase: RunPhase
  runReadiness: { valid: boolean, message?: string }
  autoCheckUpdate: boolean
  configActions: ReturnType<typeof useConfigDocumentActions>
  runControls: ReturnType<typeof useRunControls>
  settingsActions: ReturnType<typeof useSettingsActions>
  editor: ReturnType<typeof useWorkspaceEditor>
  openWizard: () => void
  setCurrentPage: (page: string) => void
  runSurvey: () => Promise<void>
}

function AppRoutes({
  currentPage,
  view,
  busy,
  runBusy,
  runPhase,
  runReadiness,
  autoCheckUpdate,
  configActions,
  runControls,
  settingsActions,
  editor,
  openWizard,
  setCurrentPage,
  runSurvey,
}: AppRoutesProps) {
  if (currentPage === 'dashboard') {
    return (
      <DashboardView
        dashboard={view.dashboard}
        busy={runBusy}
        runPhase={runPhase}
        canRun={runReadiness.valid}
        runBlockedReason={runReadiness.message}
        onUpdateUrl={configActions.updateURL}
        onAutoConfig={configActions.autoConfig}
        onLoadQRCode={configActions.loadQRCodeFromDialog}
        onDecodeQRCodeImage={(file) => void configActions.decodeQRCodeImage(file)}
        onLoadConfig={configActions.loadConfigFromDialog}
        onSaveConfig={configActions.saveConfigToDialog}
        onOpenSetupWizard={openWizard}
        onOpenRuntime={() => setCurrentPage('runtime')}
        onTargetChange={(value) => editor.updateField('target', String(value))}
        onThreadsChange={(value) => editor.updateField('threads', String(value))}
        onRandomIpChange={(value) => editor.updateField('random-ip', value)}
        onProxySourceChange={(value) => editor.updateField('proxy-source', value)}
        customProxyAPI={editor.config?.network.customProxyApi ?? ''}
        onCustomProxyAPIChange={(value) => editor.updateField('custom-proxy-api', value)}
        onSyncProxyStatus={runControls.syncRandomIpQuota}
        onRedeemProxyCard={(cardCode) => void runControls.redeemRandomIpQuota(cardCode)}
        onRun={runSurvey}
        onCancelRun={runControls.cancelSurvey}
        onPauseRun={runControls.pauseSurvey}
        onResumeRun={runControls.resumeSurvey}
      />
    )
  }
  if (currentPage === 'runtime') {
    return <RuntimeView groups={view.runtimeGroups} onFieldChange={editor.updateField} onTestAIConnection={runControls.testAI} />
  }
  if (currentPage === 'strategy' && editor.config) {
    return <StrategyView config={editor.config} onConfigChange={editor.setConfig} />
  }
  if (currentPage === 'reverse-fill') {
    return (
      <ReverseFillView
        reverseFill={view.reverseFillPlan}
        reverseFillPath={editor.config?.reverseFill.sourcePath}
        config={editor.config}
        busy={busy}
        onFieldChange={editor.updateField}
        onChooseReverseFill={configActions.chooseReverseFillFile}
        onPreviewReverseFill={configActions.previewReverseFillFile}
      />
    )
  }
  if (currentPage === 'logs') {
    return <LogsView logs={view.logLines} busy={busy} onExport={configActions.exportLogs} />
  }
  if (currentPage === 'community') {
    return <CommunityView />
  }
  if (currentPage === 'settings') {
    return (
      <InfoView
        title="设置"
        settings={view.settingsGroups}
        busy={busy}
        onSettingChange={editor.updateSettings}
        onSaveSettings={settingsActions.saveAppSettings}
        onChooseConfigDirectory={settingsActions.chooseConfigDirectory}
        onResetSettings={settingsActions.resetAppSettings}
      />
    )
  }
  if (currentPage === 'more') {
    return (
      <MoreView
        version={view.appVersion}
        aboutItems={view.aboutItems}
        donateItems={view.donateItems}
        busy={busy}
        autoCheckUpdate={autoCheckUpdate}
      />
    )
  }
  return null
}

export default AppRoutes
