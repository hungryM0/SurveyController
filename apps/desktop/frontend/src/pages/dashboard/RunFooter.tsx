import { Pause, Play, Square } from 'lucide-react'
import { Button, ProgressBar } from '../../components/ui'
import type { DashboardViewProps } from './types'

type RunFooterProps = Pick<
  DashboardViewProps,
  | 'dashboard'
  | 'busy'
  | 'runPhase'
  | 'canRun'
  | 'runBlockedReason'
  | 'onRun'
  | 'onCancelRun'
  | 'onPauseRun'
  | 'onResumeRun'
>

function RunFooter({
  dashboard,
  busy = false,
  runPhase = 'idle',
  canRun = Boolean(dashboard.surveyUrl.trim()),
  runBlockedReason,
  onRun,
  onCancelRun,
  onPauseRun,
  onResumeRun,
}: RunFooterProps) {
  return (
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
        {runPhase === 'idle' && (
          <Button
            value="开始执行"
            type="primary"
            icon={<Play size={16} />}
            disabled={busy || !canRun}
            tooltip={!canRun ? runBlockedReason : undefined}
            onClick={onRun}
          />
        )}
        {runPhase === 'running' && (
          <>
            <Button value="暂停" icon={<Pause size={14} />} disabled={busy} onClick={onPauseRun} />
            <Button value="停止" icon={<Square size={14} />} disabled={busy} onClick={onCancelRun} />
          </>
        )}
        {runPhase === 'paused' && (
          <>
            <Button
              value="恢复"
              type="primary"
              icon={<Play size={14} />}
              disabled={busy}
              onClick={onResumeRun}
            />
            <Button value="停止" icon={<Square size={14} />} disabled={busy} onClick={onCancelRun} />
          </>
        )}
        {runPhase === 'canceling' && <Button value="停止中..." icon={<Square size={14} />} disabled />}
      </div>
    </footer>
  )
}

export default RunFooter
