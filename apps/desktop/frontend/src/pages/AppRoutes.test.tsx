import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { createWizardDraft, type ConfigurationWizardProps } from '../components/config-wizard'
import { createTestConfig, createTestSettings } from '../test/configFactory'
import { createBaseAppViewState } from '../services/appViewState'
import AppRoutes from './AppRoutes'

function createWizardProps(open: boolean, url = ''): ConfigurationWizardProps {
  const config = createTestConfig((value) => {
    value.survey.url = url
  })

  return {
    open,
    initialDraft: createWizardDraft(config, createTestSettings()),
    onDismiss: vi.fn(),
    onParseSurvey: vi.fn(async () => config),
    onDecodeQRCode: vi.fn(async () => null),
    onImportConfig: vi.fn(async () => null),
    onSave: vi.fn(async (draft) => draft),
  }
}

function renderTaskRoute(open: boolean, url = '') {
  const onOpenTaskWizard = vi.fn()
  const props: ComponentProps<typeof AppRoutes> = {
    currentPage: 'task',
    view: createBaseAppViewState('5.0.0'),
    busy: false,
    autoCheckUpdate: true,
    settingsActions: {} as ComponentProps<typeof AppRoutes>['settingsActions'],
    editor: {} as ComponentProps<typeof AppRoutes>['editor'],
    wizardProps: createWizardProps(open, url),
    onOpenTaskWizard,
  }

  return {
    html: renderToStaticMarkup(<AppRoutes {...props} />),
    onOpenTaskWizard,
  }
}

describe('AppRoutes task page', () => {
  it('keeps a closed task wizard actionable without rendering legacy task data', () => {
    const { html } = renderTaskRoute(false)

    expect(html).toContain('添加问卷')
    expect(html).not.toContain('添加问卷链接后开始配置任务。')
    expect(html).toContain('class="sc-button sc-button-primary"')
    expect(html).not.toContain('WorkflowOverview')
  })

  it('labels a preserved survey draft as continue configuration', () => {
    const { html } = renderTaskRoute(false, 'https://www.wjx.cn/vm/example.aspx')

    expect(html).toContain('继续配置任务')
    expect(html).toContain('继续配置')
    expect(html).not.toContain('从保留的配置继续完成问卷任务。')
  })

  it('renders the wizard when the task flow is open', () => {
    const { html } = renderTaskRoute(true)

    expect(html).toContain('config-wizard-workspace')
    expect(html).not.toContain('从保留的配置继续完成问卷任务。')
  })
})
