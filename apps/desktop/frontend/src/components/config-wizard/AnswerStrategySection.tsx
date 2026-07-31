import { ListTree } from 'lucide-react'
import { useState } from 'react'
import StrategyEditor from '../../pages/strategy/StrategyEditor'
import { Button } from '../ui'
import { cloneWizardDraft, type WizardDraft } from './configWizardModel'

interface AnswerStrategySectionProps {
  draft: WizardDraft
  busy: boolean
  onChange: (draft: WizardDraft) => void
}

function AnswerStrategySection({ draft, busy, onChange }: AnswerStrategySectionProps) {
  const [open, setOpen] = useState(false)

  function updateConfig(config: WizardDraft['config']) {
    const next = cloneWizardDraft(draft)
    next.config = config
    onChange(next)
  }

  return (
    <section className="config-wizard-strategy-section">
      <div className="config-wizard-inline-actions">
        <Button
          value={open ? '收起逐题设置' : '逐题调整答案'}
          type="subtle"
          icon={<ListTree size={16} strokeWidth={1.9} />}
          aria-expanded={open}
          disabled={busy}
          onClick={() => setOpen((current) => !current)}
        />
      </div>
      {open ? (
        <div className="config-wizard-strategy-editor config-wizard-reveal">
          <StrategyEditor config={draft.config} onConfigChange={updateConfig} />
        </div>
      ) : null}
    </section>
  )
}

export default AnswerStrategySection
