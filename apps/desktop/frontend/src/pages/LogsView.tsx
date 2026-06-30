import { Clipboard, Save } from 'lucide-react'
import { Browser, Clipboard as RuntimeClipboard, Dialogs } from '@wailsio/runtime'
import { Button } from 'react-windows-ui'

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
  async function copyAll() {
    await RuntimeClipboard.SetText(logs.join('\n'))
  }

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
    <section className="page scroll-page">
      <section className="surface log-panel">
        <div className="section-heading">
          <h2>日志</h2>
          <span>{logs.length}</span>
        </div>
        <div className="toolbar-row log-toolbar">
          <Button value="复制全部" icon={<Clipboard size={15} />} disabled={busy || !logs.length} onClick={() => void copyAll()} />
          <Button value="导出日志" icon={<Save size={15} />} disabled={busy || !logs.length} onClick={() => void exportLogs()} />
          <Button value="报错反馈" disabled={busy} onClick={() => void openFeedbackPage()} />
        </div>
        <div className="log-lines">
          {logs.map((line, index) => <code key={`${index}-${line}`}>{line}</code>)}
        </div>
      </section>
    </section>
  )
}

export default LogsView
