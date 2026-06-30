import { type ChangeEvent, type ClipboardEvent, type DragEvent, type ReactElement, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Cpu,
  FolderOpen,
  Gauge,
  Globe,
  HelpCircle,
  Play,
  QrCode,
  Save,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Target,
  Terminal,
  Zap,
} from 'lucide-react'
import { Button, ButtonGroup, InputText, ProgressBar, SelectNative, SliderBar, Switch, TableView } from 'react-windows-ui'
import type { DashboardState, QuickAction } from '../types'

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

const getMetricIcon = (label: string) => {
  if (label.includes('成功') || label.includes('率')) return <CheckCircle2 size={16} />
  if (label.includes('提交') || label.includes('份')) return <Send size={16} />
  if (label.includes('速度') || label.includes('效率') || label.includes('并发')) return <Gauge size={16} />
  if (label.includes('代理') || label.includes('IP') || label.includes('网络')) return <Globe size={16} />
  return <Activity size={16} />
}

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
  const recentLogs = getRecentLogLines(logs, 5)
  const [qrDropActive, setQrDropActive] = useState(false)

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
      <div className="dashboard-scroll">
        {/* 1. TOP HERO SECTION: URL Input and Analysis */}
        <section
          className={`surface survey-hero-card ${qrDropActive ? 'qr-drop-active' : ''}`}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="hero-layout">
            <div className="card-header-with-icon">
              <div className="card-icon-accent">
                <Cpu size={24} />
              </div>
              <div className="card-title-block">
                <h3>智能问卷主控台</h3>
                <p>粘贴问卷星、腾讯问卷或 Credamo 链接，解析题目结构并生成答题任务</p>
              </div>
            </div>

            <div className="hero-command-area">
              <div className="hero-primary-row">
                <div className="url-input-wrapper">
                  <InputText
                    value={dashboard.surveyUrl}
                    placeholder="在此粘贴问卷网络链接..."
                    clearButton
                    width="100%"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdateUrl(event.target.value)}
                    onClearButtonClick={() => onUpdateUrl('')}
                  />
                </div>
                <Button
                  type="primary"
                  value="智能解析问卷"
                  icon={<Play size={15} />}
                  disabled={busy || !dashboard.surveyUrl}
                  isLoading={busy}
                  onClick={onAutoConfig}
                />
              </div>
              <div className="hero-secondary-row">
                <ButtonGroup>
                  <Button value="识别二维码" icon={<QrCode size={15} />} disabled={busy} onClick={onLoadQRCode} />
                  <Button value="载入配置" icon={<FolderOpen size={15} />} onClick={onLoadConfig} />
                  <Button value="保存配置" icon={<Save size={15} />} onClick={onSaveConfig} />
                </ButtonGroup>
              </div>
              {dashboard.quickActions.length ? (
                <div className="quick-action-strip">
                  {dashboard.quickActions.map((action) => (
                    <QuickActionButton
                      key={action.id}
                      action={action}
                      disabled={busy}
                      onParse={onAutoConfig}
                      onLoadConfig={onLoadConfig}
                      onSaveConfig={onSaveConfig}
                      onOpenRuntime={onOpenRuntime}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* 2. MAIN WORKSPACE GRID: Left configurations, Right structure details */}
        <div className="dashboard-main-grid">
          {/* LEFT COLUMN */}
          <div className="dashboard-left-column">
            <section className="surface control-panel">
              <div className="panel-header">
                <div className="panel-title-group">
                  <Settings size={18} />
                  <h4>快捷设置</h4>
                </div>
                <span className="platform-tag">{dashboard.platformLabel || '无运行配置'}</span>
              </div>

              <div className="control-items-list">
                <div className="control-item">
                  <div className="item-label-group">
                    <Target size={15} />
                    <span>目标份数</span>
                  </div>
                  <div className="item-input-area">
                    <InputText
                      value={String(dashboard.targetCount)}
                      width="8rem"
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
                      defaultValue={Math.max(1, Math.min(dashboard.threadCount, 32))}
                      width="10rem"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => onThreadsChange(Number(event.target.value))}
                    />
                    <strong className="slider-value">{Math.max(1, Math.min(dashboard.threadCount, 32))}</strong>
                  </div>
                </div>

                <div className="control-item">
                  <div className="item-label-group">
                    <ShieldCheck size={15} />
                    <span>随机 IP 机制</span>
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

                <div className="control-item">
                  <div className="item-label-group">
                    <Globe size={15} />
                    <span>网络代理源</span>
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

                <div className="control-item">
                  <div className="item-label-group">
                    <Terminal size={15} />
                    <span>运行提示</span>
                  </div>
                  <div className="item-input-area">
                    <span className="dashboard-note">{dashboard.runtimeHint}</span>
                  </div>
                </div>

                <div className="control-item">
                  <div className="item-label-group">
                    <ShieldCheck size={15} />
                    <span>代理提示</span>
                  </div>
                  <div className="item-input-area">
                    <span className="dashboard-note">{dashboard.proxyHint}</span>
                  </div>
                </div>

                {/* ADVANCED PARAMETERS BUTTON CARD */}
                <div className="advanced-options-card" onClick={onOpenRuntime}>
                  <div className="card-content">
                    <SlidersHorizontal size={16} />
                    <div className="text-group">
                      <h5>配置高级作答参数</h5>
                      <p>调整防关联规则与随机延时模型</p>
                    </div>
                  </div>
                  <span className="arrow-indicator">→</span>
                </div>
              </div>
            </section>

            <section className="surface terminal-logs-card">
              <div className="terminal-header">
                <div className="dots-group">
                  <span className="dot red" />
                  <span className="dot yellow" />
                  <span className="dot green" />
                </div>
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
                    <span className="line-number">1</span>
                    <span className="line-content">等待任务输出...</span>
                  </div>
                )}
              </div>
            </section>

          </div>

          {/* RIGHT COLUMN */}
          <div className="dashboard-right-column">
            {/* 2*2 METRICS GRID WIDGET */}
            <div className="dashboard-metrics-grid-2x2">
              {dashboard.metrics.map((metric) => {
                const toneClass = metric.tone ? `tone-${metric.tone}` : ''
                return (
                  <div key={metric.label} className={`metric-stat-card ${toneClass}`}>
                    <div className="stat-icon-wrapper">
                      {getMetricIcon(metric.label)}
                    </div>
                    <div className="stat-content">
                      <span className="stat-label">{metric.label}</span>
                      <strong className="stat-value">{metric.value}</strong>
                    </div>
                  </div>
                )
              })}
            </div>

            <section className="surface quota-panel dashboard-quota-card">
              <div className="quota-panel-head">
                <div className="panel-title-group">
                  <Globe size={18} />
                  <h4>随机 IP 额度</h4>
                </div>
                <span className="platform-tag">{dashboard.randomIpEnabled ? '已启用' : '未启用'}</span>
              </div>
              <div className="quota-panel-body">
                <div className="quota-panel-summary">
                  <strong>{dashboard.randomIpQuotaLabel}</strong>
                  <span>{dashboard.randomIpStatus}</span>
                </div>
                <div className="quota-panel-row">
                  <span>可用</span>
                  <strong>{dashboard.proxyAvailable ?? 0}</strong>
                  <span>占用</span>
                  <strong>{dashboard.proxyInUse ?? 0}</strong>
                </div>
                <div className="quota-panel-actions">
                  <Button
                    value="同步额度"
                    icon={<Globe size={14} />}
                    disabled={busy}
                    onClick={onSyncProxyStatus}
                  />
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
                    icon={<QrCode size={14} />}
                    disabled={busy || !proxyCardCode.trim()}
                    onClick={() => onRedeemProxyCard(proxyCardCode)}
                  />
                </div>
              </div>
            </section>

            <section className="surface thread-switch-card">
              <div className="panel-header">
                <div className="panel-title-group">
                  <Activity size={18} />
                  <h4>题目清单与会话进度</h4>
                </div>
              </div>
              <div className="thread-switch-row">
                <Button
                  value="题目清单"
                  type={threadView === 'questions' ? 'primary' : undefined}
                  onClick={() => setThreadView('questions')}
                />
                <Button
                  value="会话进度"
                  type={threadView === 'progress' ? 'primary' : undefined}
                  onClick={() => setThreadView('progress')}
                />
              </div>
            </section>

            <section className="surface table-panel thread-table-panel">
              <div className="panel-header">
                <div className="panel-title-group">
                  <HelpCircle size={18} />
                  <h4>{threadView === 'questions' ? `已配置的问卷结构 (${dashboard.questionRows.length} 题)` : `会话进度 (${sessionRows.length} 路)`}</h4>
                </div>
              </div>
              <div className="table-wrapper-scroll question-table-scroll">
                {threadView === 'questions' ? (
                  dashboard.questionRows.length === 0 ? (
                    <div className="table-empty-state">
                      <HelpCircle size={28} className="empty-icon" />
                      <h5>暂无已解析的问卷</h5>
                      <p>请粘贴问卷网络链接并点击“智能解析问卷”，系统会自动提取题目结构与作答维度。</p>
                      <div className="platform-badges">
                        <span className="badge wjx">问卷星</span>
                        <span className="badge tencent">腾讯问卷</span>
                        <span className="badge credamo">Credamo 见数</span>
                      </div>
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
                    <Activity size={28} className="empty-icon" />
                    <h5>暂无会话进度</h5>
                    <p>开始运行后，这里会显示每条线程的状态和进度。</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* 4. FOOTER: MODERN RUN STATUS BAR */}
      <footer className="run-footer-modern">
        <div className="footer-status-info">
          <div className="status-indicator-ping">
            <span className={`ping-dot ${busy ? 'active' : ''}`}></span>
          </div>
          <div className="status-text-block">
            <span className="label">状态信息</span>
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
            value="同步额度"
            icon={<Globe size={14} />}
            disabled={busy}
            onClick={onSyncProxyStatus}
          />
          <Button
            value="兑换"
            icon={<QrCode size={14} />}
            disabled={busy || !proxyCardCode.trim()}
            onClick={() => onRedeemProxyCard(proxyCardCode)}
          />
          <Button
            type="primary"
            value="开始执行"
            icon={<Play size={16} />}
            disabled={busy || !dashboard.surveyUrl}
            onClick={onRun}
          />
          <Button
            value="暂停"
            icon={<Square size={14} />}
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

function QuickActionButton({
  action,
  disabled,
  onParse,
  onLoadConfig,
  onSaveConfig,
  onOpenRuntime,
}: {
  action: QuickAction
  disabled: boolean
  onParse: () => void
  onLoadConfig: () => void
  onSaveConfig: () => void
  onOpenRuntime: () => void
}) {
  const icon = quickActionIcon(action.icon)
  const onClick = quickActionHandler(action.id, onParse, onLoadConfig, onSaveConfig, onOpenRuntime)
  return (
    <Button
      value={action.label}
      type={action.emphasis === 'primary' ? 'primary' : undefined}
      icon={icon}
      disabled={disabled}
      onClick={onClick}
    />
  )
}

function quickActionHandler(
  id: string,
  onParse: () => void,
  onLoadConfig: () => void,
  onSaveConfig: () => void,
  onOpenRuntime: () => void,
) {
  switch (id) {
    case 'parse':
      return onParse
    case 'load-config':
      return onLoadConfig
    case 'save-config':
      return onSaveConfig
    case 'open-runtime':
      return onOpenRuntime
    default:
      return onOpenRuntime
  }
}

function quickActionIcon(icon: string) {
  switch (icon) {
    case 'scan':
      return <Play size={15} />
    case 'folder':
      return <FolderOpen size={15} />
    case 'save':
      return <Save size={15} />
    case 'tune':
      return <SlidersHorizontal size={15} />
    default:
      return <Terminal size={15} />
  }
}

function buildThreadProgressRows(rows: DashboardState['sessionRows']): string[][] {
  return rows.map((row) => [row.thread, row.status, `${row.progress}%`])
}

