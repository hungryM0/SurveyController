import { useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import { Button, TableView } from '../../components/ui'
import ConditionRuleDialog from '../../components/ConditionRuleDialog'
import type { ConfigDocument } from '../../types'
import {
  deleteRuleAtIndex,
  formatRuleConditions,
  formatRuleLabel,
  formatRuleTargets,
  normalizeRule,
  updateRuleAtIndex,
  type StrategyRuleRecord,
} from '../strategy-editor'

interface RulesPanelProps {
  config: ConfigDocument
  onConfigChange: (config: ConfigDocument) => void
}

export function RulesPanel({ config, onConfigChange }: RulesPanelProps) {
  const rules = useMemo(() => (config.answers.rules ?? []).map(normalizeRule), [config.answers.rules])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogIndex, setDialogIndex] = useState(-1)
  const [dialogRule, setDialogRule] = useState<StrategyRuleRecord | null>(null)

  function closeDialog() {
    setDialogOpen(false)
    setDialogRule(null)
    setDialogIndex(-1)
  }

  function openNewRule() {
    setDialogIndex(-1)
    setDialogRule(null)
    setDialogOpen(true)
  }

  function openRule(index: number) {
    if (!rules[index]) return
    setDialogIndex(index)
    setDialogRule(rules[index])
    setDialogOpen(true)
  }

  function saveRule(rule: StrategyRuleRecord) {
    onConfigChange(updateRuleAtIndex(config, dialogIndex, rule))
    closeDialog()
  }

  return (
    <>
      <section className="surface strategy-table-panel">
        <div className="section-heading">
          <h2>条件规则</h2>
          <span>{rules.length}</span>
          <Button type="primary" value="新增条件规则" onClick={openNewRule} />
        </div>
        <TableView
          columns={[
            { title: '条件', showSortIcon: false },
            { title: '动作', showSortIcon: false },
            { title: '目标', showSortIcon: false },
            { title: '操作', showSortIcon: false },
          ]}
          rows={rules.map((rule, index) => [
            formatRuleLabel(rule, index),
            `${rule.condition_mode === 'not_selected' ? '未选中' : '选中'} / ${formatRuleConditions(rule)}`,
            `${rule.action_mode === 'must_not_select' ? '不得选择' : '必须选择'} / ${formatRuleTargets(rule)}`,
            '编辑 / 删除',
          ])}
          rowFontSize={13}
          headerFontSize={13}
        />
        <div className="strategy-row-actions">
          {rules.map((rule, index) => (
            <div key={`${index}-${rule.condition_question_num}-${rule.target_question_num}`} className="strategy-row-action">
              <span>{formatRuleLabel(rule, index)}</span>
              <div>
                <Button value="编辑" onClick={() => openRule(index)} />
                <Button value="删除" onClick={() => onConfigChange(deleteRuleAtIndex(config, index))} />
              </div>
            </div>
          ))}
          {!rules.length ? (
            <div className="strategy-empty-state" role="status">
              <div className="strategy-empty-icon" aria-hidden="true"><Activity size={22} /></div>
              <h3>暂无条件规则</h3>
            </div>
          ) : null}
        </div>
      </section>
      <ConditionRuleDialog
        open={dialogOpen}
        config={config}
        initialRule={dialogRule}
        onCancel={closeDialog}
        onConfirm={saveRule}
      />
    </>
  )
}
