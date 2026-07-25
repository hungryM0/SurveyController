import { useState } from 'react'
import { Button } from '../components/ui'
import PageHeader from '../components/PageHeader'
import type { ConfigDocument } from '../types'
import { DimensionsPanel } from './strategy/DimensionsPanel'
import { QuestionPanel } from './strategy/QuestionPanel'
import { RulesPanel } from './strategy/RulesPanel'

interface StrategyViewProps {
  config: ConfigDocument
  onConfigChange: (next: ConfigDocument) => void
}

type StrategyTab = 'rules' | 'questions' | 'dimensions'

function StrategyView({ config, onConfigChange }: StrategyViewProps) {
  const [tab, setTab] = useState<StrategyTab>('rules')

  return (
    <section className="page scroll-page strategy-scroll workspace-page" style={{ overflow: 'hidden' }}>
      <PageHeader title="题目策略" />
      <div className="strategy-tab-bar surface" role="tablist" aria-label="策略编辑分类">
        <Button value="条件规则" type={tab === 'rules' ? 'primary' : undefined} onClick={() => setTab('rules')} />
        <Button value="逐题配置" type={tab === 'questions' ? 'primary' : undefined} onClick={() => setTab('questions')} />
        <Button value="维度分组" type={tab === 'dimensions' ? 'primary' : undefined} onClick={() => setTab('dimensions')} />
      </div>
      <div className="strategy-tab-content">
        {tab === 'rules' ? <RulesPanel config={config} onConfigChange={onConfigChange} /> : null}
        {tab === 'questions' ? <QuestionPanel config={config} onConfigChange={onConfigChange} /> : null}
        {tab === 'dimensions' ? <DimensionsPanel config={config} onConfigChange={onConfigChange} /> : null}
      </div>
    </section>
  )
}

export default StrategyView
