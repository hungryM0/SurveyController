import { type ChangeEvent, type ClipboardEvent, type DragEvent, type ReactElement, useState } from 'react'
import {
  Activity,
  Download,
  Globe,
  Pause,
  Play,
  QrCode,
  Save,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Target,
  Terminal,
  Upload,
  Zap,
} from 'lucide-react'
import { Button, InputText, ProgressBar, SelectNative, SliderBar, Switch, TableView } from 'react-windows-ui'
import type { DashboardState } from '../types'

interface DashboardViewProps {
  dashboard: DashboardState
  logs: string[]
  busy?: boolean
  onUpdateUrl: (value: string) => void
  onAutoConfig: () => void
  onLoadQRCode: () => void
  onDecodeQRCodeImage: (file: File) => void
  onLoadConfig: () => void
  onSaveConfig: () => void
  onOpenRuntime: () => void
  onTargetChange: (value: number) => void
  onThreadsChange: (value: number) => void
  onRandomIpChange: (value: boolean) => void
  onProxySourceChange: (value: string) => void
  onSyncProxyStatus: () => void
  onRedeemProxyCard: (cardCode: string) => void
  onRun: () => void
  onCancelRun: () => void
  onPauseRun: () => void
  onResumeRun: () => void
}

const SelectControl = SelectNative as unknown as (props: {
  data: Array<{ label: string, value: string }>
  value?: string
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
}) => ReactElement

const TableControl = TableView as unknown as (props: {
  columns: Array<{ title: string, sortable?: boolean, showSortIcon?: boolean }>
  rows: string[][]
  rowFontSize?: number
  headerFontSize?: number
}) => ReactElement

const SliderControl = SliderBar as unknown as (props: {
  min: number
  max: number
  defaultValue: number
  width?: string
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}) => ReactElement

function DashboardView({
  dashboard,
  logs,
  busy = false,
  onUpdateUrl,
  onAutoConfig,
  onLoadQRCode,
  onDecodeQRCodeImage,
  onLoadConfig,
  onSaveConfig,
  onOpenRuntime,
  onTargetChange,
  onThreadsChange,
  onRandomIpChange,
  onProxySourceChange,
  onSyncProxyStatus,
  onRedeemProxyCard,
  onRun,
  onCancelRun,
  onPauseRun,
  onResumeRun,
}: DashboardViewProps) {
  const [proxyCardCode, setProxyCardCode] = useState('')
  const [threadView, setThreadView] = useState<'questions' | 'progress'>('questions')
  const questionRows = dashboard.questionRows.map((row) => [
    String(row.index),
    row.type,
    row.dimension || '-',
    row.strategy || '-',
  ])
  const sessionRows = buildThreadProgressRows(dashboard.sessionRows)
  const recentLogs = getRecentLogLines(logs, 3)
  const [qrDropActive, setQrDropActive] = useState(false)
  const normalizedThreads = Math.max(1, Math.min(dashboard.threadCount, 32))

  function handleQRImageFile(file?: File | null) {
    if (!file || busy || !isSupportedQRImage(file)) {
      return
    }
    onDecodeQRCodeImage(file)
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    const file = firstSupportedQRImageFile(event.clipboardData?.files)
    if (!file) {
      return
    }
    event.preventDefault()
    handleQRImageFile(file)
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!firstSupportedQRImageFile(event.dataTransfer?.files)) {
      return
    }
    event.preventDefault()
    setQrDropActive(true)
  }

  function handleDragLeave() {
    setQrDropActive(false)
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    const file = firstSupportedQRImageFile(event.dataTransfer?.files)
    if (!file) {
      setQrDropActive(false)
      return
    }
    event.preventDefault()
    setQrDropActive(false)
    handleQRImageFile(file)
  }

  return (
    <section className="page dashboard-page">
      <div className="dashboard-scroll dashboard-shell">
        <section
          className={`surface dashboard-command ${qrDropActive ? 'qr-drop-active' : ''}`}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="command-main">
            <div className="command-row">
              <div className="url-input-wrapper">
                <InputText
                  value={dashboard.surveyUrl}
                  placeholder="粘贴问卷链接"
                  clearButton
                  width="100%"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdateUrl(event.target.value)}
                  onClearButtonClick={() => onUpdateUrl('')}
                />
              </div>
              <Button
                value="解析"
                icon={<QrCode size={15} />}
                disabled={busy || !dashboard.surveyUrl}
                isLoading={busy}
                onClick={onAutoConfig}
              />
              <Button
                type="primary"
                value="开始执行"
                icon={<Play size={16} />}
                disabled={busy || !dashboard.surveyUrl}
                onClick={onRun}
              />
            </div>
            <div className="command-meta">
              <span>{dashboard.platformLabel || '未配置平台'}</span>
              <span>{dashboard.statusText}</span>
              <span>{dashboard.questionCount} 题</span>
              <strong>{dashboard.progressCurrent}/{dashboard.progressTarget}</strong>
            </div>
          </div>

          <div className="command-actions">
            <Button value="扫码" icon={<QrCode size={15} />} disabled={busy} onClick={onLoadQRCode} />
            <Button value="导入" icon={<Upload size={15} />} onClick={onLoadConfig} />
            <Button value="导出" icon={<Download size={15} />} onClick={onSaveConfig} />
          </div>
        </section>

        <div className="dashboard-work-grid">
          <section className="surface control-panel">
            <div className="panel-header">
              <div className="panel-title-group">
                <Settings size={18} />
                <h4>任务设置</h4>
              </div>
              <Button value="高级参数" icon={<SlidersHorizontal size={15} />} onClick={onOpenRuntime} />
            </div>

            <div className="control-items-list">
              <div className="control-item primary-control-item">
                <div className="item-label-group">
                  <Target size={15} />
                  <span>目标份数</span>
                </div>
                <div className="item-input-area">
                  <InputText
                    value={String(dashboard.targetCount)}
                    width="7rem"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onTargetChange(Number(event.target.value))}
                  />
                </div>
              </div>

              <div className="control-item">
                <div className="item-label-group">
                  <Zap size={15} />
                  <span>并发线程</span>
                </div>
                <div className="item-slider-area">
                  <SliderControl
                    key={`threads-${dashboard.threadCount}`}
                    min={1}
                    max={32}
                    defaultValue={normalizedThreads}
                    width="9rem"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onThreadsChange(Number(event.target.value))}
                  />
                  <strong className="slider-value">{normalizedThreads}</strong>
                </div>
              </div>

              <div className="control-item switch-control-item">
                <div className="item-label-group">
                  <ShieldCheck size={15} />
                  <span>随机 IP</span>
                </div>
                <div className="item-switch-area">
                  <Switch
                    key={`random-ip-${dashboard.randomIpEnabled}`}
                    label
                    labelOn="已开启"
                    labelOff="已关闭"
                    defaultChecked={dashboard.randomIpEnabled}
                    onChange={() => onRandomIpChange(!dashboard.randomIpEnabled)}
                  />
                </div>
              </div>

              <div className="control-item proxy-source-item">
                <div className="item-label-group">
                  <Globe size={15} />
                  <span>代理源</span>
                </div>
                <div className="item-select-area">
                  <SelectControl
                    data={[
                      { label: '默认代理源', value: '默认' },
                      { label: '限时福利源', value: '限时福利' },
                      { label: '自定义代理', value: '自定义' },
                    ]}
                    value={dashboard.proxySource}
                    onChange={(event) => onProxySourceChange(event.target.value)}
                  />
                </div>
              </div>

              <div className="control-item quota-control-item">
                <div className="item-label-group">
                  <Globe size={15} />
                  <span>IP 额度</span>
                </div>
                <div className="quota-inline-area">
                  <strong>{dashboard.randomIpQuotaLabel}</strong>
                  <span>可用 {dashboard.proxyAvailable ?? 0} / 占用 {dashboard.proxyInUse ?? 0}</span>
                  <Button
                    value="同步"
                    icon={<Globe size={14} />}
                    disabled={busy}
                    onClick={onSyncProxyStatus}
                  />
                </div>
              </div>

              <div className="proxy-card-row">
                <InputText
                  value={proxyCardCode}
                  placeholder="额度卡密"
                  clearButton
                  width="100%"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setProxyCardCode(event.target.value)}
                  onClearButtonClick={() => setProxyCardCode('')}
                />
                <Button
                  value="兑换"
                  icon={<Save size={14} />}
                  disabled={busy || !proxyCardCode.trim()}
                  onClick={() => onRedeemProxyCard(proxyCardCode)}
                />
              </div>

              <div className="control-note-list">
                <div>
                  <span>运行</span>
                  <strong>{dashboard.runtimeHint}</strong>
                </div>
                <div>
                  <span>代理</span>
                  <strong>{dashboard.proxyHint}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="surface table-panel thread-table-panel">
            <div className="panel-header table-panel-head">
              <div className="panel-title-group">
                <Activity size={18} />
                <h4>{threadView === 'questions' ? `题目清单 (${dashboard.questionRows.length})` : `会话进度 (${sessionRows.length})`}</h4>
              </div>
              <div className="thread-switch-row">
                <Button
                  value="题目"
                  type={threadView === 'questions' ? 'primary' : undefined}
                  onClick={() => setThreadView('questions')}
                />
                <Button
                  value="会话"
                  type={threadView === 'progress' ? 'primary' : undefined}
                  onClick={() => setThreadView('progress')}
                />
              </div>
            </div>
            <div className="table-wrapper-scroll question-table-scroll">
              {threadView === 'questions' ? (
                dashboard.questionRows.length === 0 ? (
                  <div className="table-empty-state">
                    <h5>未解析</h5>
                    <p>粘贴链接后解析题目结构。</p>
                  </div>
                ) : (
                  <TableControl
                    columns={[
                      { title: '序号', showSortIcon: false },
                      { title: '类型', showSortIcon: false },
                      { title: '映射维度', showSortIcon: false },
                      { title: '作答策略', showSortIcon: false },
                    ]}
                    rows={questionRows}
                    rowFontSize={13}
                    headerFontSize={13}
                  />
                )
              ) : sessionRows.length ? (
                <TableControl
                  columns={[
                    { title: '线程', showSortIcon: false },
                    { title: '状态', showSortIcon: false },
                    { title: '进度', showSortIcon: false },
                  ]}
                  rows={sessionRows}
                  rowFontSize={13}
                  headerFontSize={13}
                />
              ) : (
                <div className="table-empty-state">
                  <h5>未运行</h5>
                  <p>任务启动后显示线程进度。</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="surface terminal-logs-card dashboard-log-strip">
          <div className="terminal-header">
            <div className="terminal-title">
              <Terminal size={14} />
              <span>运行日志</span>
            </div>
          </div>
          <div className="terminal-body">
            {recentLogs.length ? (
              recentLogs.map((line, index) => (
                <div key={`${index}-${line}`} className="terminal-line">
                  <span className="line-number">{index + 1}</span>
                  <span className="line-content">{line}</span>
                </div>
              ))
            ) : (
              <div className="terminal-cursor-line">
                <span className="line-content">暂无日志</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="run-footer-modern">
        <div className="footer-status-info">
          <div className="status-indicator-ping">
            <span className={`ping-dot ${busy ? 'active' : ''}`}></span>
          </div>
          <div className="status-text-block">
            <span className="label">状态</span>
            <strong className="status-desc">{dashboard.statusText}</strong>
          </div>
        </div>
        
        <div className="footer-progress-wrapper">
          <div className="progress-label-bar">
            <span>总体进度</span>
            <strong>{dashboard.progressPercent}%</strong>
          </div>
          <ProgressBar setProgress={dashboard.progressPercent} width="100%" />
        </div>

        <div className="footer-actions-group">
          <Button
            value="开始执行"
            icon={<Play size={16} />}
            disabled={busy || !dashboard.surveyUrl}
            onClick={onRun}
          />
          <Button
            value="暂停"
            icon={<Pause size={14} />}
            disabled={!busy}
            onClick={onPauseRun}
          />
          <Button
            value="恢复"
            icon={<Play size={14} />}
            disabled={!busy}
            onClick={onResumeRun}
          />
          <Button
            value="停止"
            icon={<Square size={14} />}
            disabled={!busy}
            onClick={onCancelRun}
          />
        </div>
      </footer>
    </section>
  )
}

export default DashboardView

export function getRecentLogLines(logs: string[], limit = 5): string[] {
  if (!Array.isArray(logs) || limit <= 0) {
    return []
  }
  return logs.slice(Math.max(0, logs.length - limit))
}

export function firstSupportedQRImageFile(files?: FileList | File[] | null): File | null {
  if (!files?.length) {
    return null
  }
  for (const file of Array.from(files)) {
    if (isSupportedQRImage(file)) {
      return file
    }
  }
  return null
}

export function isSupportedQRImage(file: File): boolean {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp)$/.test(name)
}

function buildThreadProgressRows(rows: DashboardState['sessionRows']): string[][] {
  return rows.map((row) => [row.thread, row.status, `${row.progress}%`])
}

