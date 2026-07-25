import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button, SelectNative } from './ui'
import type { ConfigDocument } from '../types'
import {
  buildRuleOptionLabels,
  buildRuleQuestionOptions,
  buildRuleRowOptions,
  createConditionRuleDraft,
  validateConditionRuleDraft,
} from '../pages/conditionRuleDialogModel'
import {
  isMatrixQuestion,
  questionLabel,
  type RuleDraft,
  type StrategyRuleRecord,
} from '../pages/strategy-editor'

interface ConditionRuleDialogProps {
  open: boolean
  config: ConfigDocument
  initialRule?: StrategyRuleRecord | null
  onCancel: () => void
  onConfirm: (nextRule: StrategyRuleRecord) => void
}

function ConditionRuleDialog({ open, config, initialRule, onCancel, onConfirm }: ConditionRuleDialogProps) {
  const questions = useMemo(() => config.survey.definition.questions ?? [], [config.survey.definition.questions])
  const questionOptions = useMemo(() => buildRuleQuestionOptions(config), [config])
  const [draft, setDraft] = useState<RuleDraft>(() => createConditionRuleDraft(config, initialRule))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }
    setDraft(createConditionRuleDraft(config, initialRule))
    setError('')
  }, [config, initialRule, open])

  if (!open) {
    return null
  }

  const conditionQuestion = questions.find((question) => question.num === draft.condition_question_num)
  const targetQuestion = questions.find((question) => question.num === draft.target_question_num)
  const conditionQuestionLabel = conditionQuestion ? questionLabel(conditionQuestion) : '请选择题目'
  const targetQuestionLabel = targetQuestion ? questionLabel(targetQuestion) : '请选择题目'

  function updateDraftField<K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function saveRule() {
    const nextError = validateConditionRuleDraft(draft, questions)
    if (nextError) {
      setError(nextError)
      return
    }
    const normalized: StrategyRuleRecord = {
      condition_question_num: draft.condition_question_num,
      condition_mode: draft.condition_mode,
      condition_option_indices: [...draft.condition_option_indices],
      target_question_num: draft.target_question_num,
      action_mode: draft.action_mode,
      target_option_indices: [...draft.target_option_indices],
    }
    if (draft.condition_row_index !== undefined) {
      normalized.condition_row_index = draft.condition_row_index
    }
    if (draft.target_row_index !== undefined) {
      normalized.target_row_index = draft.target_row_index
    }
    onConfirm(normalized)
  }

  function toggleOption(kind: 'condition' | 'target', index: number, checked: boolean) {
    const key = kind === 'condition' ? 'condition_option_indices' : 'target_option_indices'
    setDraft((current) => {
      const currentList = new Set(current[key])
      if (checked) {
        currentList.add(index)
      } else {
        currentList.delete(index)
      }
      return {
        ...current,
        [key]: [...currentList].sort((left, right) => left - right),
      } as RuleDraft
    })
  }

  const conditionOptionLabels = buildRuleOptionLabels(conditionQuestion)
  const targetOptionLabels = buildRuleOptionLabels(targetQuestion)

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="condition-rule-dialog-backdrop" />
        <Dialog.Content className="condition-rule-dialog surface">
        <div className="condition-rule-dialog-head">
          <div>
            <Dialog.Title asChild>
              <h2>{initialRule ? '编辑条件规则' : '新增条件规则'}</h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <span>前置条件 · 题号必须递增</span>
            </Dialog.Description>
          </div>
          <Button value="关闭" onClick={onCancel} />
        </div>

        <div className="condition-rule-dialog-body">
          {error ? <div className="condition-rule-dialog-error">{error}</div> : null}

          <div className="condition-rule-section">
            <div className="section-heading">
              <h3>条件设置</h3>
              <span>{conditionQuestionLabel}</span>
            </div>
            <div className="condition-rule-grid">
              <label className="strategy-field">
                <span>条件题目</span>
                <SelectNative
                  data={questionOptions}
                  value={String(draft.condition_question_num || '')}
                  onChange={(event) => updateDraftField('condition_question_num', Number(event.target.value))}
                />
              </label>
              <label className="strategy-field">
                <span>条件模式</span>
                <SelectNative
                  data={[
                    { label: '选择了以下选项', value: 'selected' },
                    { label: '未选择以下选项', value: 'not_selected' },
                  ]}
                  value={draft.condition_mode}
                  onChange={(event) => updateDraftField('condition_mode', event.target.value === 'not_selected' ? 'not_selected' : 'selected')}
                />
              </label>
              {isMatrixQuestion(conditionQuestion) ? (
                <label className="strategy-field">
                  <span>条件行</span>
                  <SelectNative
                    data={[{ label: '请选择行', value: '' }, ...buildRuleRowOptions(conditionQuestion)]}
                    value={String(draft.condition_row_index ?? '')}
                    onChange={(event) => updateDraftField('condition_row_index', event.target.value === '' ? undefined : Number(event.target.value))}
                  />
                </label>
              ) : null}
            </div>
            <OptionPicker title="条件选项" labels={conditionOptionLabels} selected={draft.condition_option_indices} onChange={(index, checked) => toggleOption('condition', index, checked)} />
          </div>

          <div className="condition-rule-section">
            <div className="section-heading">
              <h3>动作设置</h3>
              <span>{targetQuestionLabel}</span>
            </div>
            <div className="condition-rule-grid">
              <label className="strategy-field">
                <span>目标题目</span>
                <SelectNative
                  data={questionOptions}
                  value={String(draft.target_question_num || '')}
                  onChange={(event) => updateDraftField('target_question_num', Number(event.target.value))}
                />
              </label>
              <label className="strategy-field">
                <span>动作模式</span>
                <SelectNative
                  data={[
                    { label: '一定选择以下选项', value: 'must_select' },
                    { label: '一定不选择以下选项', value: 'must_not_select' },
                  ]}
                  value={draft.action_mode}
                  onChange={(event) => updateDraftField('action_mode', event.target.value === 'must_not_select' ? 'must_not_select' : 'must_select')}
                />
              </label>
              {isMatrixQuestion(targetQuestion) ? (
                <label className="strategy-field">
                  <span>目标行</span>
                  <SelectNative
                    data={[{ label: '请选择行', value: '' }, ...buildRuleRowOptions(targetQuestion)]}
                    value={String(draft.target_row_index ?? '')}
                    onChange={(event) => updateDraftField('target_row_index', event.target.value === '' ? undefined : Number(event.target.value))}
                  />
                </label>
              ) : null}
            </div>
            <OptionPicker title="目标选项" labels={targetOptionLabels} selected={draft.target_option_indices} onChange={(index, checked) => toggleOption('target', index, checked)} />
          </div>
        </div>

        <div className="condition-rule-dialog-foot">
          <Button value="取消" onClick={onCancel} />
          <Button type="primary" value="保存规则" onClick={saveRule} />
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function OptionPicker({
  title,
  labels,
  selected,
  onChange,
}: {
  title: string
  labels: string[]
  selected: number[]
  onChange: (index: number, checked: boolean) => void
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected])
  return (
    <div className="condition-rule-option-block">
      <span>{title}</span>
      <div className="condition-rule-option-list">
        {labels.length ? labels.map((label, index) => (
          <label key={`${title}-${index}`} className="condition-rule-option-item">
            <input
              type="checkbox"
              checked={selectedSet.has(index)}
              onChange={(event) => onChange(index, event.target.checked)}
            />
            <span>{index + 1}. {label || `选项 ${index + 1}`}</span>
          </label>
        )) : <div className="strategy-empty-inline">没有可选项。</div>}
      </div>
    </div>
  )
}

export default ConditionRuleDialog
