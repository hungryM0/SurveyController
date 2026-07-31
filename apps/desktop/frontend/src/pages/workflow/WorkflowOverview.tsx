import { Check, FileSpreadsheet, FileText, Globe2, ListChecks, Pause, Play, Route, Settings2, ShieldCheck, Square, SlidersHorizontal, Target } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, ProgressBar } from '../../components/ui'
import type { DashboardState } from '../../types'
import type { RunPhase } from './types'

interface WorkflowOverviewProps {
  dashboard: DashboardState
  busy: boolean
  runPhase: RunPhase
  canRun: boolean
  runBlockedReason?: string
  onOpenWizard: () => void
  onRun: () => void
  onCancelRun: () => void
  onPauseRun: () => void
  onResumeRun: () => void
  onOpenRuntime: () => void
  onOpenStrategy: () => void
  onOpenReverseFill: () => void
  onOpenLogs: () => void
}

function WorkflowOverview({
  dashboard,
  busy,
  runPhase,
  canRun,
  runBlockedReason,
  onOpenWizard,
  onRun,
  onCancelRun,
  onPauseRun,
  onResumeRun,
  onOpenRuntime,
  onOpenStrategy,
  onOpenReverseFill,
  onOpenLogs,
}: WorkflowOverviewProps) {
  const configured = Boolean(dashboard.surveyUrl.trim()) && dashboard.questionCount > 0
  const running = runPhase !== 'idle'
  const stages = workflowStages(dashboard, runPhase)
  const firstIncompleteStage = stages.findIndex((stage) => !stage.complete)
  const currentStageIndex = firstIncompleteStage < 0 ? stages.length - 1 : firstIncompleteStage

  return (
    <section className="page scroll-page workspace-page workflow-page">
      <div className="content-stack workflow-layout">
        <header className="workspace-header workflow-header">
          <div className="workspace-header-copy">
            <span className="eyebrow">任务工作区</span>
            <h1>{configured ? dashboard.surveyTitle : '准备一次问卷任务'}</h1>
            <p>{configured ? '配置已保存。检查下面的任务摘要，然后开始执行。' : '按步骤完成配置，程序会在运行前检查必要设置。'}</p>
          </div>
          <div className="workspace-header-meta">
            <span>{running ? '任务进行中' : canRun ? '配置已就绪' : '需要配置'}</span>
          </div>
          <div className="workspace-header-actions">
            <Button value={configured ? '编辑配置' : '开始配置'} type={configured ? 'subtle' : 'primary'} icon={<Settings2 size={15} />} disabled={running || busy} onClick={onOpenWizard} />
          </div>
        </header>

        <section className="surface workflow-path-card" aria-labelledby="workflow-path-title">
          <div className="workflow-section-heading">
            <div>
              <span className="workflow-kicker">当前流程</span>
              <h2 id="workflow-path-title">从配置到运行</h2>
            </div>
            <span className="workflow-step-summary">{configured ? '已完成配置' : '第 1 步开始'}</span>
          </div>
          <ol className="workflow-path-list">
            {stages.map((stage, index) => (
              <li className={`workflow-path-item ${stage.complete ? 'is-complete' : ''} ${index === currentStageIndex ? 'is-current' : ''}`.trim()} key={stage.label} aria-current={index === currentStageIndex ? 'step' : undefined}>
                <span className="workflow-path-index" aria-hidden="true">{stage.complete ? <Check size={14} strokeWidth={2.4} /> : index + 1}</span>
                <div>
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="workflow-command-grid">
          <section className="surface workflow-summary-panel" aria-labelledby="workflow-summary-title">
            <div className="workflow-section-heading">
              <div>
                <span className="workflow-kicker">配置摘要</span>
                <h2 id="workflow-summary-title">这次任务会怎么运行</h2>
              </div>
              <ListChecks size={20} aria-hidden="true" />
            </div>
            <div className="workflow-summary-grid">
              <SummaryCard icon={<FileText size={17} />} label="问卷" value={configured ? dashboard.surveyTitle : '尚未添加'} detail={configured ? `${dashboard.platformLabel} · ${dashboard.questionCount} 道题` : '需要先解析问卷'} />
              <SummaryCard icon={<Route size={17} />} label="答案" value={configured ? '初始策略' : '尚未生成'} detail={dashboard.questionCount ? `${dashboard.questionCount} 道题已生成初始策略` : '解析后生成策略'} />
              <SummaryCard icon={<Target size={17} />} label="任务" value={`${dashboard.targetCount} 份 · ${dashboard.threadCount} 路`} detail={dashboard.progressTarget ? '达到目标后自动停止' : '等待任务设置'} />
              <SummaryCard icon={<Globe2 size={17} />} label="网络" value={dashboard.proxySource || '直连'} detail={dashboard.randomIpEnabled ? '随机 IP 已启用' : '使用当前网络'} />
            </div>
            {configured ? (
              <div className="workflow-advanced-links" aria-label="高级编辑">
                <span>需要更细设置？</span>
                <Button value="题目策略" icon={<ListChecks size={14} />} disabled={running || busy} onClick={onOpenStrategy} />
                <Button value="反填数据" icon={<FileSpreadsheet size={14} />} disabled={running || busy} onClick={onOpenReverseFill} />
                <Button value="高级参数" icon={<SlidersHorizontal size={14} />} disabled={running || busy} onClick={onOpenRuntime} />
              </div>
            ) : null}
          </section>

          <section className={`surface workflow-run-panel ${canRun ? 'is-ready' : 'is-blocked'}`} aria-labelledby="workflow-run-title">
            <div className="workflow-section-heading">
              <div>
                <span className="workflow-kicker">执行控制</span>
                <h2 id="workflow-run-title">{running ? '任务状态' : canRun ? '可以开始' : '还差一步'}</h2>
              </div>
              <ShieldCheck size={20} aria-hidden="true" />
            </div>
            <div className="workflow-run-status">
              <span className={`workflow-status-dot ${running ? 'is-running' : canRun ? 'is-ready' : 'is-blocked'}`} aria-hidden="true" />
              <div>
                <strong>{dashboard.statusText}</strong>
                <span>{canRun ? '启动后可以暂停或停止任务。' : runBlockedReason || '完成配置向导后才能启动。'}</span>
              </div>
            </div>
            <div className="workflow-progress-block">
              <div><span>总体进度</span><strong>{dashboard.progressPercent}%</strong></div>
              <ProgressBar setProgress={dashboard.progressPercent} width="100%" />
              <small>{dashboard.progressCurrent} / {dashboard.progressTarget} 份</small>
            </div>
            <div className="workflow-run-actions">
              {runPhase === 'idle' ? <Button value="开始执行" type="primary" icon={<Play size={16} />} disabled={busy || !canRun} tooltip={!canRun ? runBlockedReason : undefined} onClick={onRun} /> : null}
              {runPhase === 'running' ? <><Button value="暂停" icon={<Pause size={15} />} disabled={busy} onClick={onPauseRun} /><Button value="停止" icon={<Square size={15} />} disabled={busy} onClick={onCancelRun} /></> : null}
              {runPhase === 'paused' ? <><Button value="恢复" type="primary" icon={<Play size={15} />} disabled={busy} onClick={onResumeRun} /><Button value="停止" icon={<Square size={15} />} disabled={busy} onClick={onCancelRun} /></> : null}
              {runPhase === 'canceling' ? <Button value="停止中..." icon={<Square size={15} />} disabled /> : null}
              {dashboard.progressCurrent > 0 || dashboard.statusText !== '等待配置' ? <Button value="查看日志" type="subtle" icon={<FileText size={14} />} onClick={onOpenLogs} /> : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}

function SummaryCard({ icon, label, value, detail }: { icon: ReactNode, label: string, value: string, detail: string }) {
  return (
    <article className="workflow-summary-card">
      <div className="workflow-summary-card-head"><span>{icon}</span><small>{label}</small></div>
      <strong title={value}>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function workflowStages(dashboard: DashboardState, runPhase: RunPhase) {
  const hasSurvey = Boolean(dashboard.surveyUrl.trim()) && dashboard.questionCount > 0
  const answersReady = hasSurvey
  const taskReady = answersReady && dashboard.targetCount > 0 && dashboard.threadCount > 0
  const networkReady = taskReady && Boolean(dashboard.proxySource)
  const runComplete = dashboard.progressTarget > 0 && dashboard.progressCurrent >= dashboard.progressTarget
  return [
    { label: '问卷', complete: hasSurvey, detail: hasSurvey ? `${dashboard.questionCount} 道题已解析` : '添加链接并解析结构' },
    { label: '答案', complete: answersReady, detail: hasSurvey ? '已生成初始作答策略' : '解析后自动生成' },
    { label: '任务', complete: taskReady, detail: `${dashboard.targetCount} 份 · ${dashboard.threadCount} 路并发` },
    { label: '网络', complete: networkReady, detail: dashboard.randomIpEnabled ? '随机 IP 已启用' : '使用当前网络' },
    { label: '运行', complete: runComplete, detail: runPhase === 'idle' ? '检查完成后启动' : dashboard.statusText },
  ]
}

export default WorkflowOverview
export type { WorkflowOverviewProps }
