import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { buildWizardReviewItems } from './wizardReview'
import type { WizardDraft, WizardStepId } from './configWizardModel'
import type { WizardCheckState } from './wizardTypes'
import { Button } from '../ui'

interface ReviewStepProps {
  draft: WizardDraft
  checkState?: WizardCheckState | null
  onReturnToStep?: (step: WizardStepId) => void
}

function ReviewStep({ draft, checkState, onReturnToStep }: ReviewStepProps) {
  const reviewItems = buildWizardReviewItems(draft)
  const status = checkState?.status ?? 'warning'
  const problems = checkState?.problems ?? []
  const StatusIcon = status === 'blocked' ? AlertCircle : status === 'warning' ? AlertTriangle : CheckCircle2

  return (
    <section className="config-wizard-step config-wizard-review-step" aria-labelledby="config-wizard-review-title">
      <div className="config-wizard-step-heading">
        <h2 id="config-wizard-review-title">检查配置</h2>
      </div>

      <div className={`config-wizard-ready-card is-${status}`} role={checkState?.status === 'blocked' ? 'alert' : 'status'}>
        <StatusIcon size={20} strokeWidth={1.9} aria-hidden="true" />
        <div>
          <strong>{checkState ? status === 'blocked' ? '暂时无法启动' : status === 'warning' ? '配置需要注意' : '配置可以启动' : '尚未检查配置'}</strong>
          <span>{checkState ? status === 'blocked' ? '请按问题提示返回修改后再检查。' : '保存后可以进入运行步骤。' : '点击底部按钮检查整套配置。'}</span>
        </div>
      </div>

      {problems.length ? (
        <ul className="config-wizard-check-problems" aria-label="检查问题">
          {problems.map((problem) => (
            <li key={problem.code}>
              <span>{problem.message}</span>
              {onReturnToStep && isWizardStep(problem.step) ? (
                <Button value="返回修改" type="subtle" onClick={() => onReturnToStep(problem.step as WizardStepId)} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="config-wizard-review-grid">
        {reviewItems.map((item) => (
          <div className="config-wizard-review-item" key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="config-wizard-review-url">
        <span>问卷链接</span>
        <code>{draft.config.survey.url}</code>
      </div>
    </section>
  )
}

export default ReviewStep
export type { ReviewStepProps }

function isWizardStep(value: string): value is WizardStepId {
  return ['survey', 'answers', 'task', 'network', 'review', 'run'].includes(value)
}
