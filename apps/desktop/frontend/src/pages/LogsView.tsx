import { Clipboard, Save, Terminal } from 'lucide-react'
import { Browser, Clipboard as RuntimeClipboard, Dialogs } from '@wailsio/runtime'
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
    <section className="page logs-page workspace-page">
      <PageHeader eyebrow="运行日志" title="诊断任务状态" description="查看本次会话的运行记录，复制或导出后提交问题。" meta={<span>{logs.length} 条记录</span>} actions={(
        <div className="logs-toolbar-card">
          <Button value="复制全部" icon={<Clipboard size={15} />} disabled={busy || !logs.length} onClick={() => void copyAll()} />
          <Button value="导出日志" icon={<Save size={15} />} disabled={busy || !logs.length} onClick={() => void exportLogs()} />
          <Button value="提交 issue" disabled={busy} onClick={() => void openFeedbackPage()} />
        </div>
      )} />
      <div className="surface logs-terminal-body">
        {logs.length === 0 ? (
          <div className="logs-empty-state">
            <Terminal size={24} />
            <p>暂无运行日志</p>
          </div>
        ) : (
          logs.map((line, index) => (
            <div className="terminal-line" key={`${index}-${line}`}>
              <span className="line-number">{index + 1}</span>
              <span className="line-content">{line}</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export default LogsView
