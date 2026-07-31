import PageHeader from '../components/PageHeader'
import type { ConfigDocument } from '../types'
import StrategyEditor from './strategy/StrategyEditor'

interface StrategyViewProps {
  config: ConfigDocument
  onConfigChange: (next: ConfigDocument) => void
}

function StrategyView({ config, onConfigChange }: StrategyViewProps) {
  return (
    <section className="page scroll-page strategy-scroll workspace-page" style={{ overflow: 'hidden' }}>
      <PageHeader title="题目策略" />
      <StrategyEditor config={config} onConfigChange={onConfigChange} />
    </section>
  )
}

export default StrategyView
