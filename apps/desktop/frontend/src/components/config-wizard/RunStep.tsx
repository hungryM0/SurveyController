import { AlertCircle, CheckCircle2, Circle, Download, Pause, Play, Square } from 'lucide-react'
import { Button } from '../ui'
import type { RunResult, RunTaskState } from '../../types'

interface RunStepProps {
  runTaskState?: RunTaskState | null
  logs?: string[]
  error?: string
  result?: RunResult | null
  busy?: boolean
  onStart?: () => void
  onPause?: () => void
  onResume?: () => void
  onStop?: () => void
  onExportResult?: () => void
}

const statusText: Record<string, string> = {
  idle: '尚未启动',
  running: '运行中',
  paused: '已暂停',
  canceling: '正在停止',
  succeeded: '已完成',
  failed: '运行失败',
  stopped: '已停止',
}

function RunStep({
  runTaskState,
  logs = [],
  error,
  result,
  busy = false,
  onStart,
  onPause,
  onResume,
  onStop,
  onExportResult,
}: RunStepProps) {
  const state = runTaskState ?? null
  const status = state?.status ?? 'idle'
  const currentEvent = state?.events?.at(-1)?.event
  const displayedResult = result ?? state?.result ?? null
  const displayedError = error || state?.error || ''
  const eventLogs = state?.events?.map((item) => item.event.message).filter(Boolean) ?? []
  const displayedLogs = logs.length ? logs : eventLogs
  const StatusIcon = status === 'failed' ? AlertCircle : status === 'succeeded' ? CheckCircle2 : Circle

  return (
    <section className="config-wizard-step config-wizard-run-step" aria-labelledby="config-wizard-run-title">
      <div className="config-wizard-step-heading">
        <h2 id="config-wizard-run-title">运行任务</h2>
        <p>任务状态、进度、日志和结果都保留在当前流程。</p>
      </div>

      <div className={`config-wizard-run-status is-${status}`} role={displayedError ? 'alert' : 'status'}>
        <StatusIcon size={21} strokeWidth={1.9} aria-hidden="true" />
        <div>
          <strong>{statusText[status] ?? status}</strong>
          <span>{currentEvent?.message || (status === 'idle' ? '尚未启动任务。' : '等待任务状态更新。')}</span>
        </div>
      </div>

      {currentEvent && currentEvent.total > 0 ? (
        <div className="config-wizard-run-progress" aria-label="任务进度">
          <div className="config-wizard-run-progress-label">
            <span>当前进度</span>
            <strong>{currentEvent.current} / {currentEvent.total}</strong>
          </div>
          <progress max={currentEvent.total} value={Math.min(currentEvent.current, currentEvent.total)} />
        </div>
      ) : null}

      {displayedError ? <p className="config-wizard-error" role="alert">{displayedError}</p> : null}

      {displayedResult ? (
        <div className="config-wizard-run-result" role="status">
          <strong>任务结果</strong>
          <dl>
            <div><dt>成功</dt><dd>{displayedResult.success}</dd></div>
            <div><dt>失败</dt><dd>{displayedResult.fail}</dd></div>
            <div><dt>状态</dt><dd>{displayedResult.stopped ? '已停止' : '已完成'}</dd></div>
          </dl>
        </div>
      ) : null}

      <div className="config-wizard-run-actions">
        {status === 'idle' || status === 'stopped' || status === 'failed' ? (
          <Button value="启动" type="primary" icon={<Play size={16} />} disabled={busy || !onStart} onClick={onStart} />
        ) : null}
        {status === 'running' ? (
          <Button value="暂停" type="subtle" icon={<Pause size={16} />} disabled={busy || !onPause} onClick={onPause} />
        ) : null}
        {status === 'paused' ? (
          <Button value="继续" type="primary" icon={<Play size={16} />} disabled={busy || !onResume} onClick={onResume} />
        ) : null}
        {status === 'running' || status === 'paused' || status === 'canceling' ? (
          <Button value="停止" type="danger" icon={<Square size={16} />} disabled={busy || status === 'canceling' || !onStop} onClick={onStop} />
        ) : null}
        {displayedResult ? (
          <Button value="导出结果" type="subtle" icon={<Download size={16} />} disabled={busy || !onExportResult} onClick={onExportResult} />
        ) : null}
      </div>

      {displayedLogs.length ? (
        <div className="config-wizard-run-logs">
          <h3>实时日志</h3>
          <ol aria-live="polite">
            {displayedLogs.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
          </ol>
        </div>
      ) : null}
    </section>
  )
}

export default RunStep
export type { RunStepProps }
