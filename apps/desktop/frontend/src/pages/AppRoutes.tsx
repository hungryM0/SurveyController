import { lazy } from 'react'
import type { ConfigurationWizardProps } from '../components/config-wizard'
import type { useConfigDocumentActions } from '../hooks/useConfigDocumentActions'
import type { useRunControls } from '../hooks/useRunControls'
import type { useSettingsActions } from '../hooks/useSettingsActions'
import type { useWorkspaceEditor } from '../hooks/useWorkspaceEditor'
import type { AppViewState } from '../types'
import type { RunPhase } from './workflow/types'

const WorkflowView = lazy(() => import('./workflow/WorkflowView'))
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
  runPhase: RunPhase
  runReadiness: { valid: boolean, message?: string }
  autoCheckUpdate: boolean
  configActions: ReturnType<typeof useConfigDocumentActions>
  runControls: ReturnType<typeof useRunControls>
  settingsActions: ReturnType<typeof useSettingsActions>
  editor: ReturnType<typeof useWorkspaceEditor>
  openWizard: () => void
  wizardProps: ConfigurationWizardProps
  setCurrentPage: (page: string) => void
  runSurvey: () => Promise<void>
}

function AppRoutes({
  currentPage,
  view,
  busy,
  runPhase,
  runReadiness,
  autoCheckUpdate,
  configActions,
  runControls,
  settingsActions,
  editor,
  openWizard,
  wizardProps,
  setCurrentPage,
  runSurvey,
}: AppRoutesProps) {
  if (currentPage === 'task') {
    return (
      <WorkflowView
        dashboard={view.dashboard}
        busy={busy}
        runPhase={runPhase}
        canRun={runReadiness.valid}
        runBlockedReason={runReadiness.message}
        wizardProps={wizardProps}
        onOpenWizard={openWizard}
        onRun={runSurvey}
        onCancelRun={runControls.cancelSurvey}
        onPauseRun={runControls.pauseSurvey}
        onResumeRun={runControls.resumeSurvey}
        onOpenRuntime={() => setCurrentPage('runtime')}
        onOpenStrategy={() => setCurrentPage('strategy')}
        onOpenReverseFill={() => setCurrentPage('reverse-fill')}
        onOpenLogs={() => setCurrentPage('logs')}
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
