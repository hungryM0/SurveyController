import { CheckCircle2 } from 'lucide-react'
import type { RuntimeConfig } from '../../types'
import { buildWizardReviewItems } from './wizardReview'

interface ReviewStepProps {
  draft: RuntimeConfig
}

function ReviewStep({ draft }: ReviewStepProps) {
  const reviewItems = buildWizardReviewItems(draft)

  return (
    <section className="config-wizard-step config-wizard-review-step" aria-labelledby="config-wizard-review-title">
      <div className="config-wizard-step-heading">
        <h2 id="config-wizard-review-title">检查配置</h2>
        <p>保存后会回到概览页。任务不会自动启动。</p>
      </div>

      <div className="config-wizard-ready-card" role="status">
        <CheckCircle2 size={20} strokeWidth={1.9} aria-hidden="true" />
        <div>
          <strong>配置可以保存</strong>
          <span>保存完成后，仍可在各设置页继续调整。</span>
        </div>
      </div>

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
        <code>{draft.url}</code>
      </div>
    </section>
  )
}

export default ReviewStep
export type { ReviewStepProps }
