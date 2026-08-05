import { FilePlus2, PencilLine } from 'lucide-react'
import { lazy } from 'react'
import { Button } from '../components/ui'
import { ConfigurationWorkspace, type ConfigurationWizardProps } from '../components/config-wizard'
import type { useSettingsActions } from '../hooks/useSettingsActions'
import type { useWorkspaceEditor } from '../hooks/useWorkspaceEditor'
import type { AppViewState } from '../types'
import type { ReleaseStatus } from './moreViewModel'

const CommunityView = lazy(() => import('./CommunityView'))
const InfoView = lazy(() => import('./InfoView'))
const MoreView = lazy(() => import('./MoreView'))

interface AppRoutesProps {
  currentPage: string
  view: AppViewState
  busy: boolean
  autoCheckUpdate: boolean
  settingsActions: ReturnType<typeof useSettingsActions>
  editor: ReturnType<typeof useWorkspaceEditor>
  wizardProps: ConfigurationWizardProps
  onOpenTaskWizard: () => void
  onReleaseStatusChange: (status: ReleaseStatus) => void
}

function AppRoutes({
  currentPage,
  view,
  busy,
  autoCheckUpdate,
  settingsActions,
  editor,
  wizardProps,
  onOpenTaskWizard,
  onReleaseStatusChange,
}: AppRoutesProps) {
  if (currentPage === 'task') {
    return wizardProps.open
      ? <ConfigurationWorkspace {...wizardProps} />
      : <TaskEntry initialDraft={wizardProps.initialDraft} onOpen={onOpenTaskWizard} />
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
        onReleaseStatusChange={onReleaseStatusChange}
      />
    )
  }
  return null
}

function TaskEntry({
  initialDraft,
  onOpen,
}: {
  initialDraft: ConfigurationWizardProps['initialDraft']
  onOpen: () => void
}) {
  const hasDraft = Boolean(initialDraft.config.survey.url.trim())
  const Icon = hasDraft ? PencilLine : FilePlus2

  return (
    <section className="page scroll-page workspace-page" aria-labelledby="task-entry-title">
      <div className="content-stack">
        <section className="surface table-empty-state">
          <div className="empty-icon" aria-hidden="true"><Icon size={28} strokeWidth={1.8} /></div>
          <h5 id="task-entry-title">{hasDraft ? '继续配置任务' : '添加问卷'}</h5>
          <Button
            type="primary"
            value={hasDraft ? '继续配置' : '添加问卷'}
            icon={<Icon size={15} strokeWidth={1.9} />}
            onClick={onOpen}
          />
        </section>
      </div>
    </section>
  )
}

export default AppRoutes
