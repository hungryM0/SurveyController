import { Eye, FileSpreadsheet, FolderOpen } from 'lucide-react'
import { Button } from '../components/ui'
import SettingField from '../components/SettingField'
import type { ReverseFillRow, RuntimeConfig, SettingField as SettingFieldType } from '../types'
import PageHeader from '../components/PageHeader'

interface ReverseFillViewProps {
  reverseFill: ReverseFillRow[]
  reverseFillPath?: string
  config?: RuntimeConfig | null
  busy?: boolean
  onFieldChange?: (id: string, value: string | boolean) => void
  onChooseReverseFill: () => void
  onPreviewReverseFill: () => void
}

function ReverseFillView({
  reverseFill,
  reverseFillPath,
  config,
  busy = false,
  onFieldChange,
  onChooseReverseFill,
  onPreviewReverseFill,
}: ReverseFillViewProps) {
  const matchedCount = reverseFill.filter((row) => row.state.startsWith('已匹配')).length
  const settings: SettingFieldType[] = [
    { id: 'reverse-fill-enabled', label: '启用反填', description: '使用 Excel 回放答案', kind: 'toggle', value: String(Boolean(config?.reverse_fill_enabled)) },
    { id: 'reverse-fill-format', label: '反填格式', description: '问卷星导出格式', kind: 'select', value: config?.reverse_fill_format ?? 'auto', options: ['auto', 'wjx_text', 'wjx_score', 'wjx_sequence'] },
    { id: 'reverse-fill-start-row', label: '起始行', description: 'Excel 数据起始行', kind: 'number', value: String(config?.reverse_fill_start_row ?? 1) },
    { id: 'reverse-fill-threads', label: '反填并发', description: '反填任务并发数', kind: 'number', value: String(config?.reverse_fill_threads ?? config?.threads ?? 1) },
  ]

  return (
    <section className="page scroll-page workspace-page">
      <div className="content-stack reverse-fill-stack">
        <PageHeader title="反填" />
        <section className="surface info-panel reverse-fill-panel">
          <div className="section-heading">
            <FileSpreadsheet size={18} />
            <h2>数据源与映射结果</h2>
            <span>{reverseFill.length}</span>
          </div>

          <div className="toolbar-row">
            <Button value="选择 Excel" icon={<FolderOpen size={15} />} disabled={busy} onClick={onChooseReverseFill} />
            <Button value="预览反填" icon={<Eye size={15} />} disabled={busy || !reverseFillPath} onClick={onPreviewReverseFill} />
            <span className="filepath-badge">{reverseFillPath || '未选择文件'}</span>
          </div>

          <div className="metric-grid reverse-metrics">
            <div className="metric-tile tone-success">
              <span>已匹配</span>
              <strong>{matchedCount}</strong>
            </div>
            <div className="metric-tile">
              <span>未匹配</span>
              <strong>{Math.max(0, reverseFill.length - matchedCount)}</strong>
            </div>
          </div>

          <div className="reverse-list">
            {reverseFill.length ? reverseFill.map((row) => (
              <div key={`${row.question}-${row.column}`} className="reverse-row">
                <span>{row.question}</span>
                <small>{row.column}</small>
                <span className={`reverse-row-state ${row.state.startsWith('已匹配') ? 'match' : 'pending'}`}>
                  {row.state}
                </span>
              </div>
            )) : (
              <div className="empty-state">
                <FileSpreadsheet size={32} />
                <span>还没有预览结果</span>
              </div>
            )}
          </div>
        </section>

        <section className="surface settings-panel reverse-fill-settings-panel">
          <div className="section-heading">
            <h2>反填参数</h2>
          </div>
          {settings.map((field) => (
            <SettingField key={field.id} field={field} onChange={(id, value) => onFieldChange?.(id, value)} />
          ))}
        </section>
      </div>
    </section>
  )
}

export default ReverseFillView
