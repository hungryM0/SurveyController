import { useState } from 'react'
import { Button } from '../../components/ui'
import type { ConfigDocument } from '../../types'
import { DimensionsPanel } from './DimensionsPanel'
import { QuestionPanel } from './QuestionPanel'
import { RulesPanel } from './RulesPanel'

interface StrategyEditorProps {
  config: ConfigDocument
  onConfigChange: (next: ConfigDocument) => void
}

type StrategyTab = 'rules' | 'questions' | 'dimensions'

function StrategyEditor({ config, onConfigChange }: StrategyEditorProps) {
  const [tab, setTab] = useState<StrategyTab>('rules')

  return (
    <div className="strategy-editor-workspace">
      <div className="strategy-tab-bar surface" role="tablist" aria-label="策略编辑分类">
        <Button value="条件规则" type={tab === 'rules' ? 'primary' : undefined} role="tab" aria-selected={tab === 'rules'} onClick={() => setTab('rules')} />
        <Button value="逐题配置" type={tab === 'questions' ? 'primary' : undefined} role="tab" aria-selected={tab === 'questions'} onClick={() => setTab('questions')} />
        <Button value="维度分组" type={tab === 'dimensions' ? 'primary' : undefined} role="tab" aria-selected={tab === 'dimensions'} onClick={() => setTab('dimensions')} />
      </div>
      <div className="strategy-tab-content">
        {tab === 'rules' ? <RulesPanel config={config} onConfigChange={onConfigChange} /> : null}
        {tab === 'questions' ? <QuestionPanel config={config} onConfigChange={onConfigChange} /> : null}
        {tab === 'dimensions' ? <DimensionsPanel config={config} onConfigChange={onConfigChange} /> : null}
      </div>
    </div>
  )
}

export default StrategyEditor
export type { StrategyEditorProps }
