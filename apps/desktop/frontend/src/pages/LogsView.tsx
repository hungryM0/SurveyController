import { Activity, Save } from 'lucide-react'
import { Browser, Dialogs } from '@wailsio/runtime'
import { Button } from '../components/ui'
import PageHeader from '../components/PageHeader'

interface LogsViewProps {
  logs: string[]
  busy?: boolean
  onExport: (path: string, lines: string[]) => Promise<void>
}

async function openFeedbackPage() {
  try {
    await Browser.OpenURL('https://github.com/SurveyController/SurveyController/issues/new')
  } catch {
    return
  }
}

function LogsView({ logs, busy = false, onExport }: LogsViewProps) {
  async function exportLogs() {
    const path = await Dialogs.SaveFile({
      Title: '保存日志',
      Filename: `runtime_${new Date().toISOString().slice(0, 10)}.log`,
      Filters: [{ DisplayName: '日志文件', Pattern: '*.log;*.txt' }],
    })
    if (!path) {
      return
    }
    const finalPath = Array.isArray(path) ? path[0] : path
    await onExport(finalPath, logs)
  }

  return (
    <section className="page logs-page workspace-page">
      <PageHeader title="运行日志" actions={(
        <div className="logs-toolbar-card">
          <Button value="导出日志" icon={<Save size={15} />} disabled={busy || !logs.length} onClick={() => void exportLogs()} />
          <Button value="提交 issue" disabled={busy} onClick={() => void openFeedbackPage()} />
        </div>
      )} />
      <div className="surface logs-terminal-body">
        {logs.length === 0 ? (
          <div className="logs-empty-state" role="status">
            <div className="logs-empty-icon" aria-hidden="true">
              <Activity size={22} />
            </div>
            <h2>暂无运行日志</h2>
          </div>
        ) : (
          <div className="logs-lines">
            {logs.map((line, index) => (
              <div className="terminal-line" key={`${index}-${line}`}>
                <span className="line-number">{String(index + 1).padStart(3, '0')}</span>
                <span className="line-content">{line}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default LogsView
