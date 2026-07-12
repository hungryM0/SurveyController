import { Eye, FileSpreadsheet, FolderOpen } from 'lucide-react'
import { Button } from '../components/ui'
import type { ReverseFillRow } from '../types'
import PageHeader from '../components/PageHeader'

interface ReverseFillViewProps {
  reverseFill: ReverseFillRow[]
  reverseFillPath?: string
  busy?: boolean
  onChooseReverseFill: () => void
  onPreviewReverseFill: () => void
}

function ReverseFillView({
  reverseFill,
  reverseFillPath,
  busy = false,
  onChooseReverseFill,
  onPreviewReverseFill,
}: ReverseFillViewProps) {
  const matchedCount = reverseFill.filter((row) => row.state.startsWith('已匹配')).length

  return (
    <section className="page scroll-page workspace-page">
      <div className="content-stack reverse-fill-stack">
        <PageHeader eyebrow="数据反填" title="从 Excel 映射问卷答案" description="选择数据文件，预览题目与列的匹配结果。" meta={<span>{matchedCount}/{reverseFill.length} 已匹配</span>} />
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
      </div>
    </section>
  )
}

export default ReverseFillView
