import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent, type ReactElement } from 'react'
import { Button, InputText, SelectNative, TableView } from '../components/ui'
import ConditionRuleDialog from '../components/ConditionRuleDialog'
import PageHeader from '../components/PageHeader'
import QuestionLogicPreview from '../components/QuestionLogicPreview'
import QuestionMediaPreview from '../components/QuestionMediaPreview'
import QuestionTreePreview from '../components/QuestionTreePreview'
import QuestionSelectorDialog from '../components/QuestionSelectorDialog'
import type { QuestionMeta, RuntimeConfig } from '../types'
import {
  buildDimensionQuestionRows,
  buildQuestionTreePages,
  buildQuestionSearchHits,
  addDimensionGroup,
  deleteDimensionGroup,
  deleteRuleAtIndex,
  dimensionUsageCount,
  findQuestionEntry,
  formatRuleConditions,
  formatRuleLabel,
  formatRuleTargets,
  getEligibleQuestions,
  questionLogicSummary,
  questionMediaSummary,
  questionMediaItems,
  questionLogicDetails,
  questionOptionLabels,
  questionTypeLabel,
  questionLabel,
  questionRowLabels,
  questionTitle,
  renameDimensionGroup,
  sanitizeDimensionGroups,
  moveQuestionsToDimension,
  setQuestionDimension,
  setQuestionAiEnabled,
  setQuestionAttachedOptionSelects,
  setQuestionCustomWeights,
  setQuestionFillableOptions,
  setQuestionLocationParts,
  setQuestionMultiTextBlankConfig,
  setQuestionOptionFillTexts,
  setQuestionPsychoBias,
  setQuestionTextRandomIntRange,
  setQuestionTextRandomMode,
  updateRuleAtIndex,
  normalizeRule,
  type StrategyRuleInput,
  type StrategyRuleRecord,
} from './strategyEditor'

interface StrategyViewProps {
  config: RuntimeConfig
  onConfigChange: (next: RuntimeConfig) => void
}

const TableControl = TableView as unknown as (props: {
  columns: Array<{ title: string, sortable?: boolean, showSortIcon?: boolean }>
  rows: string[][]
  rowFontSize?: number
  headerFontSize?: number
}) => ReactElement

const SelectControl = SelectNative as unknown as (props: {
  data: Array<{ label: string, value: string }>
  value?: string
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
}) => ReactElement

function StrategyView({ config, onConfigChange }: StrategyViewProps) {
  const questions = useMemo(() => getEligibleQuestions(config), [config])
  const rules = useMemo(() => (config.answer_rules ?? []).map((rule) => normalizeRule(rule)), [config.answer_rules])
  const dimensionGroups = useMemo(() => sanitizeDimensionGroups(config), [config])
  const treePages = useMemo(() => buildQuestionTreePages(config), [config])
  const [tab, setTab] = useState<'rules' | 'dimensions' | 'questions'>('rules')
  const [dimensionName, setDimensionName] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [selectedDimension, setSelectedDimension] = useState('')
  const [selectedQuestionNum, setSelectedQuestionNum] = useState<number>(questions[0]?.num ?? 0)
  const [questionDimensionDraft, setQuestionDimensionDraft] = useState('')
  const [locationDraft, setLocationDraft] = useState(['', '', ''])
  const [optionFillDraft, setOptionFillDraft] = useState('')
  const [fillableOptionsDraft, setFillableOptionsDraft] = useState<number[]>([])
  const [attachedOptionSelectsDraft, setAttachedOptionSelectsDraft] = useState('')
  const [multiTextBlankModesDraft, setMultiTextBlankModesDraft] = useState<string[]>([])
  const [multiTextBlankAiFlagsDraft, setMultiTextBlankAiFlagsDraft] = useState<boolean[]>([])
  const [multiTextBlankIntRangesDraft, setMultiTextBlankIntRangesDraft] = useState<string[]>([])
  const [customWeightsDraft, setCustomWeightsDraft] = useState('')
  const [searchText, setSearchText] = useState('')
  const [wizardView, setWizardView] = useState<'tree' | 'detail'>('tree')
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [ruleDialogIndex, setRuleDialogIndex] = useState(-1)
  const [ruleDialogRule, setRuleDialogRule] = useState<StrategyRuleRecord | null>(null)
  const [questionSelectorOpen, setQuestionSelectorOpen] = useState(false)
  const [questionSelectorGroup, setQuestionSelectorGroup] = useState('')
  const [dimensionDraggedGroup, setDimensionDraggedGroup] = useState('')

  const questionOptions = questions.map((question) => ({
    label: `${question.num} · ${questionTitle(question)}`,
    value: String(question.num),
  }))
  const selectedQuestion = questions.find((question) => question.num === selectedQuestionNum) ?? questions[0] ?? null
  const selectedQuestionEntry = selectedQuestion ? findQuestionEntry(config, selectedQuestion.num) : undefined
  const selectedQuestionDimension = selectedQuestionEntry?.dimension ?? ''
  const selectedQuestionTextMode = selectedQuestionEntry?.text_random_mode ?? ''
  const selectedQuestionTextRange = selectedQuestionEntry?.text_random_int_range ?? []
  const selectedQuestionOptionLabels = useMemo(() => questionOptionLabels(selectedQuestion), [selectedQuestion])
  const multiTextBlankCount = Math.max(
    1,
    selectedQuestion?.text_inputs ?? 0,
    selectedQuestionEntry?.multi_text_blank_modes?.length ?? 0,
    selectedQuestionEntry?.multi_text_blank_ai_flags?.length ?? 0,
    selectedQuestionEntry?.multi_text_blank_int_ranges?.length ?? 0,
  )
  const searchHits = useMemo(() => buildQuestionSearchHits(config, searchText), [config, searchText])
  const dimensionRows = useMemo(() => buildDimensionQuestionRows(config), [config])

  useEffect(() => {
    if (!questions.length) {
      setSelectedQuestionNum(0)
      setQuestionDimensionDraft('')
      return
    }
    if (!questions.some((question) => question.num === selectedQuestionNum)) {
      setSelectedQuestionNum(questions[0].num)
    }
  }, [questions, selectedQuestionNum])

  useEffect(() => {
    setQuestionDimensionDraft(selectedQuestionDimension)
  }, [selectedQuestionDimension, selectedQuestionNum])

  useEffect(() => {
    setLocationDraft([
      selectedQuestionEntry?.location_parts?.[0] ?? '',
      selectedQuestionEntry?.location_parts?.[1] ?? '',
      selectedQuestionEntry?.location_parts?.[2] ?? '',
    ])
    setFillableOptionsDraft((selectedQuestionEntry?.fillable_option_indices ?? selectedQuestion?.fillable_options ?? []).filter((value) => Number.isFinite(value)))
    setOptionFillDraft((selectedQuestionEntry?.option_fill_texts ?? []).map((item) => item ?? '').join(' | '))
    setAttachedOptionSelectsDraft(formatAttachedOptionSelects(selectedQuestionEntry?.attached_option_selects ?? selectedQuestion?.attached_option_selects))
    setMultiTextBlankModesDraft(fillTextArray(selectedQuestionEntry?.multi_text_blank_modes, multiTextBlankCount))
    setMultiTextBlankAiFlagsDraft(fillBoolArray(selectedQuestionEntry?.multi_text_blank_ai_flags, multiTextBlankCount))
    setMultiTextBlankIntRangesDraft(fillRangeArray(selectedQuestionEntry?.multi_text_blank_int_ranges, multiTextBlankCount))
    setCustomWeightsDraft(formatCustomWeights(selectedQuestionEntry?.custom_weights))
  }, [multiTextBlankCount, selectedQuestion, selectedQuestionEntry, selectedQuestionNum])

  function applyConfig(next: RuntimeConfig) {
    onConfigChange({
      ...next,
      dimension_groups: sanitizeDimensionGroups(next),
    })
  }

  function openNewRuleDialog() {
    setRuleDialogIndex(-1)
    setRuleDialogRule(null)
    setRuleDialogOpen(true)
  }

  function openEditRuleDialog(index: number) {
    const next = rules[index]
    if (!next) {
      return
    }
    setRuleDialogIndex(index)
    setRuleDialogRule(next)
    setRuleDialogOpen(true)
  }

  function saveRule(nextRule: StrategyRuleRecord) {
    const next = updateRuleAtIndex(config, ruleDialogIndex, nextRule as unknown as StrategyRuleInput)
    applyConfig(next)
    setRuleDialogOpen(false)
    setRuleDialogRule(null)
    setRuleDialogIndex(-1)
  }

  function removeRule(index: number) {
    applyConfig(deleteRuleAtIndex(config, index))
  }

  function addDimension() {
    const next = addDimensionGroup(config, dimensionName)
    applyConfig(next)
    setDimensionName('')
  }

  function renameDimension(group: string) {
    const next = renameDimensionGroup(config, group, renameValue)
    applyConfig(next)
    if (selectedDimension === group) {
      setSelectedDimension(renameValue.trim())
    }
    setRenameValue('')
  }

  function removeDimension(group: string) {
    applyConfig(deleteDimensionGroup(config, group))
    if (selectedDimension === group) {
      setSelectedDimension('')
    }
  }

  function openQuestionSelector(group: string) {
    setQuestionSelectorGroup(group)
    setQuestionSelectorOpen(true)
  }

  function assignDimension(questionNum: number, dimension: string) {
    applyConfig(setQuestionDimension(config, questionNum, dimension))
  }

  function assignSelectedQuestionDimension() {
    if (!selectedQuestion) {
      return
    }
    applyConfig(setQuestionDimension(config, selectedQuestion.num, questionDimensionDraft))
  }

  function updateSelectedQuestionAi(enabled: boolean) {
    if (!selectedQuestion) {
      return
    }
    applyConfig(setQuestionAiEnabled(config, selectedQuestion.num, enabled))
  }

  function updateSelectedQuestionPsychoBias(value: string) {
    if (!selectedQuestion) {
      return
    }
    applyConfig(setQuestionPsychoBias(config, selectedQuestion.num, value))
  }

  function updateSelectedQuestionCustomWeights(value: string) {
    if (!selectedQuestion) {
      return
    }
    setCustomWeightsDraft(value)
  }

  function saveSelectedQuestionCustomWeights() {
    if (!selectedQuestion) {
      return
    }
    applyConfig(setQuestionCustomWeights(config, selectedQuestion.num, customWeightsDraft))
  }

  function updateSelectedQuestionTextMode(mode: string) {
    if (!selectedQuestion) {
      return
    }
    applyConfig(setQuestionTextRandomMode(config, selectedQuestion.num, mode))
  }

  function updateSelectedQuestionTextRange(value: string) {
    if (!selectedQuestion) {
      return
    }
    applyConfig(setQuestionTextRandomIntRange(config, selectedQuestion.num, value))
  }

  function updateSelectedQuestionLocationPart(index: number, value: string) {
    setLocationDraft((current) => {
      const next = [...current]
      next[index] = value
      return next
    })
  }

  function saveSelectedQuestionLocation() {
    if (!selectedQuestion) {
      return
    }
    applyConfig(setQuestionLocationParts(config, selectedQuestion.num, locationDraft))
  }

  function saveSelectedQuestionOptionFillTexts() {
    if (!selectedQuestion) {
      return
    }
    applyConfig(setQuestionOptionFillTexts(config, selectedQuestion.num, optionFillDraft.split('|').map((item) => item.trim())))
  }

  function saveSelectedQuestionFillableOptions() {
    if (!selectedQuestion) {
      return
    }
    applyConfig(setQuestionFillableOptions(config, selectedQuestion.num, fillableOptionsDraft))
  }

  function saveSelectedQuestionAttachedOptionSelects() {
    if (!selectedQuestion) {
      return
    }
    applyConfig(setQuestionAttachedOptionSelects(config, selectedQuestion.num, parseAttachedOptionSelects(attachedOptionSelectsDraft)))
  }

  function updateMultiTextBlankMode(index: number, value: string) {
    setMultiTextBlankModesDraft((current) => {
      const next = [...current]
      next[index] = value
      return next
    })
  }

  function updateMultiTextBlankAiFlag(index: number, checked: boolean) {
    setMultiTextBlankAiFlagsDraft((current) => {
      const next = [...current]
      next[index] = checked
      return next
    })
  }

  function updateMultiTextBlankIntRange(index: number, value: string) {
    setMultiTextBlankIntRangesDraft((current) => {
      const next = [...current]
      next[index] = value
      return next
    })
  }

  function saveMultiTextBlankConfig() {
    if (!selectedQuestion) {
      return
    }
    applyConfig(
      setQuestionMultiTextBlankConfig(
        config,
        selectedQuestion.num,
        multiTextBlankModesDraft,
        multiTextBlankAiFlagsDraft,
        multiTextBlankIntRangesDraft,
      ),
    )
  }

  function addQuestionsToDimension(indices: number[]) {
    if (!indices.length) {
      setQuestionSelectorOpen(false)
      setQuestionSelectorGroup('')
      return
    }
    const selectedRows = dimensionRows.filter((row) => indices.includes(row.index))
    if (!selectedRows.length) {
      setQuestionSelectorOpen(false)
      setQuestionSelectorGroup('')
      return
    }
    const next = moveQuestionsToDimension(config, selectedRows.map((row) => row.question_num), questionSelectorGroup)
    applyConfig(next)
    setQuestionSelectorOpen(false)
    setQuestionSelectorGroup('')
  }

  function handleDimensionDrop(group: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const text = event.dataTransfer.getData('text/plain')
    const raw = text.split(',').map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
    if (!raw.length) {
      return
    }
    applyConfig(moveQuestionsToDimension(config, raw, group))
    setDimensionDraggedGroup('')
  }

  return (
    <section className="page scroll-page strategy-scroll workspace-page" style={{ overflow: 'hidden' }}>
      <PageHeader eyebrow="策略编辑" title="定义题目规则与答案策略" description="集中管理条件规则、维度分组和逐题配置。" meta={<span>{questions.length} 道题目</span>} />
      <div className="strategy-tab-bar surface" role="tablist" aria-label="策略编辑分类">
        <Button value="条件规则" type={tab === 'rules' ? 'primary' : undefined} onClick={() => setTab('rules')} />
        <Button value="维度分组" type={tab === 'dimensions' ? 'primary' : undefined} onClick={() => setTab('dimensions')} />
        <Button value="题目编辑" type={tab === 'questions' ? 'primary' : undefined} onClick={() => setTab('questions')} />
      </div>

      <div className="strategy-tab-content">
      {tab === 'rules' ? (
        <>
          <section className="surface strategy-table-panel">
            <div className="section-heading">
              <h2>条件规则</h2>
              <span>{rules.length}</span>
              <Button type="primary" value="新增条件规则" onClick={openNewRuleDialog} />
            </div>
            <TableControl
              columns={[
                { title: '条件', showSortIcon: false },
                { title: '动作', showSortIcon: false },
                { title: '目标', showSortIcon: false },
                { title: '操作', showSortIcon: false },
              ]}
              rows={rules.map((rule, index) => [
                formatRuleLabel(rule, index),
                `${String(rule.condition_mode || 'selected') === 'not_selected' ? '未选中' : '选中'} / ${formatRuleConditions(rule)}`,
                `${String(rule.action_mode || 'must_select') === 'must_not_select' ? '不得选择' : '必须选择'} / ${formatRuleTargets(rule)}`,
                `编辑 / 删除`,
              ])}
              rowFontSize={13}
              headerFontSize={13}
            />
            <div className="strategy-row-actions">
              {rules.map((rule, index) => (
                <div key={`${index}-${rule.condition_question_num}-${rule.target_question_num}`} className="strategy-row-action">
                  <span>{formatRuleLabel(rule, index)}</span>
                  <div>
                    <Button value="编辑" onClick={() => openEditRuleDialog(index)} />
                    <Button value="删除" onClick={() => removeRule(index)} />
                  </div>
                </div>
              ))}
              {!rules.length ? <div className="strategy-empty">还没有条件规则。</div> : null}
            </div>
          </section>
          <ConditionRuleDialog
            open={ruleDialogOpen}
            config={config}
            initialRule={ruleDialogRule}
            onCancel={() => {
              setRuleDialogOpen(false)
              setRuleDialogRule(null)
              setRuleDialogIndex(-1)
            }}
            onConfirm={saveRule}
          />
        </>
      ) : tab === 'questions' ? (
        <>
          <section className="surface strategy-editor-panel">
            <div className="section-heading">
              <h2>题目编辑</h2>
              <span>{questions.length}</span>
            </div>
            <div className="strategy-tabs strategy-inline-tabs">
              <Button value="题目树" type={wizardView === 'tree' ? 'primary' : undefined} onClick={() => setWizardView('tree')} />
              <Button value="题目详情" type={wizardView === 'detail' ? 'primary' : undefined} onClick={() => setWizardView('detail')} />
            </div>
            <div className="strategy-search-row">
              <InputText
                value={searchText}
                placeholder="搜索题干、选项、维度、逻辑"
                width="100%"
                clearButton
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value)}
                onClearButtonClick={() => setSearchText('')}
              />
            </div>
            {searchText.trim() ? (
              <div className="question-search-panel">
                {searchHits.slice(0, 8).map((hit) => {
                  const question = questions[hit.index]
                  if (!question) {
                    return null
                  }
                  return (
                    <button
                      key={question.num}
                      type="button"
                      className="question-search-hit"
                      onClick={() => {
                        setWizardView('detail')
                        setSelectedQuestionNum(question.num)
                        setQuestionDimensionDraft(findQuestionEntry(config, question.num)?.dimension ?? '')
                      }}
                    >
                      <strong>{hit.title}</strong>
                      <span>{hit.detail}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
            {wizardView === 'tree' ? (
              <QuestionTreePreview pages={treePages} onNodeSelect={(index) => {
                const selected = questions[index]
                if (!selected) {
                  return
                }
                setWizardView('detail')
                setSelectedQuestionNum(selected.num)
                setQuestionDimensionDraft(findQuestionEntry(config, selected.num)?.dimension ?? '')
              }} />
            ) : (
              <div className="strategy-question-editor-grid">
              <div className="strategy-question-list">
                {searchHits.map((hit) => {
                  const question = questions[hit.index]
                  const entry = findQuestionEntry(config, question?.num ?? 0)
                  if (!question) {
                    return null
                  }
                  return (
                    <div
                      key={question.num}
                      className={`strategy-question-row ${selectedQuestionNum === question.num ? 'is-active' : ''}`}
                      onClick={() => {
                        setSelectedQuestionNum(question.num)
                        setQuestionDimensionDraft(entry?.dimension ?? '')
                      }}
                      >
                        <div>
                          <strong>{questionLabel(question)}</strong>
                        <span>{hit.detail || questionRowLabels(question).join(' / ') || `${questionTypeLabel(question)} · ${questionMediaSummary(question)}`}</span>
                      </div>
                      <div>
                        <span>{entry?.dimension || '未分组'} · {questionLogicSummary(question)}</span>
                      </div>
                    </div>
                  )
                })}
                {!searchHits.length ? <div className="strategy-empty">没有匹配的题目。</div> : null}
              </div>

              <div className="strategy-question-detail">
                {selectedQuestion ? (
                  <>
                    <div className="section-heading">
                      <h2>{questionTitle(selectedQuestion)}</h2>
                      <span>{questionTypeLabel(selectedQuestion)}</span>
                    </div>
                    <div className="strategy-question-detail-body">
                      <div className="strategy-field">
                        <span>逻辑概览</span>
                        <div className="strategy-summary-pill">{questionLogicSummary(selectedQuestion)}</div>
                      </div>
                      <QuestionLogicPreview
                        title="逻辑明细"
                        summary={questionLogicSummary(selectedQuestion)}
                        details={questionLogicDetails(selectedQuestion, questions)}
                      />
                      <div className="strategy-field">
                        <span>媒体概览</span>
                        <div className="strategy-summary-pill">{questionMediaSummary(selectedQuestion)}</div>
                      </div>
                      <QuestionMediaPreview
                        title="媒体预览"
                        items={questionMediaItems(selectedQuestion)}
                      />
                      <div className="strategy-field">
                        <span>题目维度</span>
                        <InputText
                          value={questionDimensionDraft || selectedQuestionDimension}
                          placeholder="输入维度名称"
                          width="100%"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setQuestionDimensionDraft(event.target.value)}
                        />
                      </div>
                      <div className="strategy-action-row">
                        <Button type="primary" value="写入维度" onClick={assignSelectedQuestionDimension} />
                        <Button value="清空维度" onClick={() => {
                          setQuestionDimensionDraft('')
                          assignDimension(selectedQuestion.num, '')
                        }} />
                      </div>

                      <div className="strategy-field">
                        <span>倾向预设</span>
                        <SelectControl
                          data={[
                            { label: '自定义', value: 'custom' },
                            { label: '偏左', value: 'left' },
                            { label: '居中', value: 'center' },
                            { label: '偏右', value: 'right' },
                          ]}
                          value={selectedQuestionEntry?.psycho_bias ?? 'custom'}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) => updateSelectedQuestionPsychoBias(event.target.value)}
                        />
                      </div>

                      {selectedQuestion ? (
                        <>
                          <OptionPicker
                            title="可填选项"
                            items={selectedQuestionOptionLabels}
                            selected={fillableOptionsDraft}
                            onChange={setFillableOptionsDraft}
                          />
                          <div className="strategy-action-row">
                            <Button value="保存可填选项" onClick={saveSelectedQuestionFillableOptions} />
                          </div>
                        </>
                      ) : null}

                      <div className="strategy-field">
                        <span>自定义权重</span>
                        <InputText
                          value={customWeightsDraft}
                          placeholder="用逗号或空格分隔"
                          width="100%"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => updateSelectedQuestionCustomWeights(event.target.value)}
                        />
                        <div className="strategy-action-row">
                          <Button value="保存权重" onClick={saveSelectedQuestionCustomWeights} />
                        </div>
                      </div>

                      <div className="strategy-field">
                        <span>AI 填空</span>
                        <Button
                          value={selectedQuestionEntry?.ai_enabled ? '已启用' : '未启用'}
                          type={selectedQuestionEntry?.ai_enabled ? 'primary' : undefined}
                          onClick={() => updateSelectedQuestionAi(!selectedQuestionEntry?.ai_enabled)}
                        />
                      </div>

                      {selectedQuestion?.is_multi_text || (selectedQuestion?.text_inputs ?? 0) > 1 ? (
                        <div className="strategy-field">
                          <span>多项填空</span>
                          <div className="strategy-multi-text-blanks">
                            {multiTextBlankModesDraft.map((mode, index) => (
                              <div key={`multi-text-blank-${index}`} className="strategy-multi-text-blank-row">
                                <strong>填空 {index + 1}</strong>
                                <SelectControl
                                  data={[
                                    { label: '默认答案', value: '' },
                                    { label: '随机姓名', value: 'name' },
                                    { label: '随机手机号', value: 'mobile' },
                                    { label: '随机身份证号', value: 'id_card' },
                                    { label: '随机整数', value: 'integer' },
                                  ]}
                                  value={mode}
                                  onChange={(event: ChangeEvent<HTMLSelectElement>) => updateMultiTextBlankMode(index, event.target.value)}
                                />
                                <label className="strategy-inline-toggle">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(multiTextBlankAiFlagsDraft[index])}
                                    onChange={(event) => updateMultiTextBlankAiFlag(index, event.target.checked)}
                                  />
                                  <span>AI</span>
                                </label>
                                <InputText
                                  value={multiTextBlankIntRangesDraft[index] ?? ''}
                                  placeholder="最小值 - 最大值"
                                  width="100%"
                                  onChange={(event: ChangeEvent<HTMLInputElement>) => updateMultiTextBlankIntRange(index, event.target.value)}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="strategy-action-row">
                            <Button value="保存多项填空" onClick={saveMultiTextBlankConfig} />
                          </div>
                        </div>
                      ) : null}

                      {(selectedQuestion?.provider_type === 'text' || selectedQuestion?.is_text_like || selectedQuestionEntry?.text_random_mode) ? (
                        <div className="strategy-field">
                          <span>随机文本模式</span>
                          <SelectControl
                            data={[
                              { label: '默认答案', value: '' },
                              { label: '随机姓名', value: 'name' },
                              { label: '随机手机号', value: 'mobile' },
                              { label: '随机身份证号', value: 'id_card' },
                              { label: '随机整数', value: 'integer' },
                            ]}
                            value={selectedQuestionTextMode}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) => updateSelectedQuestionTextMode(event.target.value)}
                          />
                        </div>
                      ) : null}

                      {selectedQuestionTextMode === 'integer' ? (
                        <div className="strategy-field">
                          <span>随机整数范围</span>
                          <InputText
                            value={selectedQuestionTextRange.join(' - ')}
                            placeholder="最小值 - 最大值"
                            width="100%"
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateSelectedQuestionTextRange(event.target.value)}
                          />
                        </div>
                      ) : null}

                      <div className="strategy-field">
                        <span>地区选择</span>
                        <div className="strategy-location-grid">
                          {locationDraft.map((value, index) => (
                            <InputText
                              key={`location-${index}`}
                              value={value}
                              placeholder={['省份', '城市', '区县'][index]}
                              width="100%"
                              onChange={(event: ChangeEvent<HTMLInputElement>) => updateSelectedQuestionLocationPart(index, event.target.value)}
                            />
                          ))}
                        </div>
                        <div className="strategy-action-row">
                          <Button value="保存地区" onClick={saveSelectedQuestionLocation} />
                        </div>
                      </div>

                      <div className="strategy-field">
                        <span>附加填空</span>
                        <InputText
                          value={optionFillDraft}
                          placeholder="用 | 分隔多个答案"
                          width="100%"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setOptionFillDraft(event.target.value)}
                        />
                        <div className="strategy-action-row">
                          <Button value="保存填空" onClick={saveSelectedQuestionOptionFillTexts} />
                        </div>
                      </div>

                      {selectedQuestion?.has_attached_option_select || (selectedQuestionEntry?.attached_option_selects?.length ?? 0) > 0 ? (
                        <div className="strategy-field">
                          <span>嵌入式下拉</span>
                          <InputText
                            value={attachedOptionSelectsDraft}
                            placeholder="JSON 数组，每项包含 option_index、option_text、select_options"
                            width="100%"
                            onChange={(event: ChangeEvent<HTMLInputElement>) => setAttachedOptionSelectsDraft(event.target.value)}
                          />
                          <div className="strategy-action-row">
                            <Button value="保存嵌入式下拉" onClick={saveSelectedQuestionAttachedOptionSelects} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="strategy-empty">没有可编辑的题目。</div>
                )}
              </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="surface strategy-editor-panel">
            <div className="section-heading">
              <h2>维度分组</h2>
              <span>{dimensionGroups.length}</span>
            </div>
            <div className="strategy-dimension-create">
              <InputText value={dimensionName} placeholder="输入新维度名称" width="100%" onChange={(event: ChangeEvent<HTMLInputElement>) => setDimensionName(event.target.value)} />
              <Button type="primary" value="新增维度" onClick={addDimension} />
            </div>
            <div className="strategy-dimension-list strategy-dimension-board">
              {dimensionGroups.map((group) => (
                <div
                  key={group}
                  className={`strategy-dimension-item ${selectedDimension === group ? 'is-active' : ''} ${dimensionDraggedGroup === group ? 'is-dragging' : ''}`}
                  onClick={() => setSelectedDimension(group)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={() => setDimensionDraggedGroup(group)}
                  onDragLeave={() => setDimensionDraggedGroup('')}
                  onDrop={(event) => handleDimensionDrop(group, event)}
                >
                  <div className="strategy-dimension-item-head">
                    <div>
                      <strong>{group}</strong>
                      <span>{dimensionUsageCount(config, group)} 题</span>
                    </div>
                    <div className="strategy-dimension-controls">
                      <Button value="重命名" onClick={() => {
                        setSelectedDimension(group)
                        setRenameValue(group)
                      }} />
                      <Button value="添加题目" onClick={() => openQuestionSelector(group)} />
                      <Button value="删除" onClick={() => removeDimension(group)} />
                    </div>
                  </div>
                  <div className="strategy-dimension-board-body">
                    {questions.filter((question) => findQuestionEntry(config, question.num)?.dimension === group).map((question) => (
                      <div
                        key={question.num}
                        className="strategy-dimension-question-chip"
                        draggable
                        onDragStart={(event) => {
                          setDimensionDraggedGroup(group)
                          event.dataTransfer.setData('text/plain', String(question.num))
                        }}
                        onDragEnd={() => setDimensionDraggedGroup('')}
                      >
                        <strong>{questionLabel(question)}</strong>
                        <span>{questionRowLabels(question).length ? questionRowLabels(question).join(' / ') : '单行题目'}</span>
                      </div>
                    ))}
                    {!questions.some((question) => findQuestionEntry(config, question.num)?.dimension === group) ? (
                      <div className="strategy-empty-inline">把题目拖到这里，或点“添加题目”。</div>
                    ) : null}
                  </div>
                </div>
              ))}
              {!dimensionGroups.length ? <div className="strategy-empty">还没有维度分组。</div> : null}
            </div>
            <div className="strategy-dimension-rename">
              <InputText value={renameValue} placeholder="重命名当前维度" width="100%" onChange={(event: ChangeEvent<HTMLInputElement>) => setRenameValue(event.target.value)} />
              <Button value="保存名称" onClick={() => selectedDimension && renameDimension(selectedDimension)} />
            </div>
          </section>

          <section className="surface strategy-table-panel">
            <div className="section-heading">
              <h2>题目分组</h2>
              <span>{questions.length}</span>
            </div>
            <div className="strategy-question-list">
              {questions.map((question) => {
                const current = findQuestionEntry(config, question.num)?.dimension ?? ''
                return (
                  <div key={question.num} className="strategy-question-row">
                    <div>
                      <strong>{questionLabel(question)}</strong>
                      <span>{questionRowLabels(question).length ? questionRowLabels(question).join(' / ') : '单行题目'}</span>
                    </div>
                    <SelectControl
                      data={[
                        { label: '未分组', value: '' },
                        ...dimensionGroups.map((group) => ({ label: group, value: group })),
                      ]}
                      value={current}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => assignDimension(question.num, event.target.value)}
                    />
                  </div>
                )
              })}
            </div>
          </section>
          <QuestionSelectorDialog
            open={questionSelectorOpen}
            title={`添加题目到「${questionSelectorGroup}」`}
            questions={dimensionRows.filter((row) => !row.group_name)}
            onCancel={() => {
              setQuestionSelectorOpen(false)
              setQuestionSelectorGroup('')
            }}
            onConfirm={addQuestionsToDimension}
          />
        </>
      )}
      </div>
    </section>
  )
}

function OptionPicker({
  title,
  items,
  selected,
  onChange,
}: {
  title: string
  items: string[]
  selected: number[]
  onChange: (next: number[]) => void
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected])
  return (
    <div className="strategy-field strategy-field-options">
      <span>{title}</span>
      <div className="strategy-option-list">
        {items.length ? items.map((item, index) => (
          <label key={`${title}-${index}`} className="strategy-option-item">
            <input
              type="checkbox"
              checked={selectedSet.has(index)}
              onChange={(event) => {
                const next = new Set(selectedSet)
                if (event.target.checked) {
                  next.add(index)
                } else {
                  next.delete(index)
                }
                onChange([...next].sort((left, right) => left - right))
              }}
            />
            <span>{index + 1}. {item}</span>
          </label>
        )) : <span className="strategy-empty-inline">没有可选项。</span>}
      </div>
    </div>
  )
}

function formatCustomWeights(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ')
  }
  if (value && typeof value === 'object') {
    const list = Object.values(value as Record<string, unknown>)
    return list.map((item) => String(item)).join(', ')
  }
  return String(value ?? '')
}

function fillTextArray(value: unknown, count: number): string[] {
  const source = Array.isArray(value) ? value : []
  const normalized = source.map((item) => String(item ?? '').trim())
  while (normalized.length < count) {
    normalized.push('')
  }
  return normalized.slice(0, count)
}

function fillBoolArray(value: unknown, count: number): boolean[] {
  const source = Array.isArray(value) ? value : []
  const normalized = source.map((item) => Boolean(item))
  while (normalized.length < count) {
    normalized.push(false)
  }
  return normalized.slice(0, count)
}

function fillRangeArray(value: unknown, count: number): string[] {
  const source = Array.isArray(value) ? value : []
  const normalized = source.map((item) => {
    if (!Array.isArray(item) || item.length < 2) {
      return ''
    }
    const left = Number(item[0])
    const right = Number(item[1])
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return ''
    }
    return `${Math.trunc(left)} - ${Math.trunc(right)}`
  })
  while (normalized.length < count) {
    normalized.push('')
  }
  return normalized.slice(0, count)
}

function formatAttachedOptionSelects(value: unknown): string {
  if (!Array.isArray(value) || !value.length) {
    return ''
  }
  return JSON.stringify(value, null, 2)
}

function parseAttachedOptionSelects(value: string): Array<Record<string, unknown>> {
  const text = value.trim()
  if (!text) {
    return []
  }
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
  } catch {
    return []
  }
}

function isFillableOptionQuestion(question: QuestionMeta | null): boolean {
  if (!question) {
    return false
  }
  const type = String(question.provider_type || question.type_code || '').trim().toLowerCase()
  return type === 'single' || type === 'radio' || type === '3' || type === 'multiple' || type === 'checkbox' || type === '4' || type === 'dropdown' || type === 'select' || type === '7'
}

export default StrategyView
