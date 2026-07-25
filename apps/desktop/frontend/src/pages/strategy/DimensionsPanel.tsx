import { useMemo, useState, type DragEvent } from 'react'
import { Button, InputText, SelectNative } from '../../components/ui'
import QuestionSelectorDialog from '../../components/QuestionSelectorDialog'
import type { ConfigDocument } from '../../types'
import {
  addDimensionGroup,
  buildDimensionQuestionRows,
  deleteDimensionGroup,
  dimensionUsageCount,
  findQuestionEntry,
  getDimensionEligibleQuestions,
  moveQuestionsToDimension,
  questionLabel,
  questionRowLabels,
  renameDimensionGroup,
  sanitizeDimensionGroups,
  setQuestionDimension,
} from '../strategy-editor'

interface DimensionsPanelProps {
  config: ConfigDocument
  onConfigChange: (config: ConfigDocument) => void
}

export function DimensionsPanel({ config, onConfigChange }: DimensionsPanelProps) {
  const questions = useMemo(() => getDimensionEligibleQuestions(config), [config])
  const groups = useMemo(() => sanitizeDimensionGroups(config), [config])
  const questionRows = useMemo(() => buildDimensionQuestionRows(config), [config])
  const [newName, setNewName] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [draggedGroup, setDraggedGroup] = useState('')
  const [selectorGroup, setSelectorGroup] = useState('')

  function addDimension() {
    onConfigChange(addDimensionGroup(config, newName))
    setNewName('')
  }

  function renameDimension(group: string) {
    onConfigChange(renameDimensionGroup(config, group, renameValue))
    if (selectedGroup === group) setSelectedGroup(renameValue.trim())
    setRenameValue('')
  }

  function deleteDimension(group: string) {
    onConfigChange(deleteDimensionGroup(config, group))
    if (selectedGroup === group) setSelectedGroup('')
  }

  function handleDrop(group: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const questionNum = Number(event.dataTransfer.getData('text/plain'))
    if (Number.isFinite(questionNum) && questionNum > 0) {
      onConfigChange(moveQuestionsToDimension(config, [questionNum], group))
    }
    setDraggedGroup('')
  }

  return (
    <>
      <section className="surface strategy-editor-panel">
        <div className="section-heading"><h2>维度分组</h2><span>{groups.length}</span></div>
        <div className="strategy-dimension-create">
          <InputText value={newName} placeholder="输入新维度名称" width="100%" onChange={(event) => setNewName(event.target.value)} />
          <Button type="primary" value="新增维度" onClick={addDimension} />
        </div>
        <div className="strategy-dimension-list strategy-dimension-board">
          {groups.map((group) => {
            const assigned = questions.filter((question) => findQuestionEntry(config, question.num)?.dimension === group)
            return (
              <div
                key={group}
                className={`strategy-dimension-item ${selectedGroup === group ? 'is-active' : ''} ${draggedGroup === group ? 'is-dragging' : ''}`}
                onClick={() => setSelectedGroup(group)}
                onDragOver={(event) => event.preventDefault()}
                onDragEnter={() => setDraggedGroup(group)}
                onDragLeave={() => setDraggedGroup('')}
                onDrop={(event) => handleDrop(group, event)}
              >
                <div className="strategy-dimension-item-head">
                  <div><strong>{group}</strong><span>{dimensionUsageCount(config, group)} 题</span></div>
                  <div className="strategy-dimension-controls">
                    <Button value="重命名" onClick={() => { setSelectedGroup(group); setRenameValue(group) }} />
                    <Button value="添加题目" onClick={() => setSelectorGroup(group)} />
                    <Button value="删除" onClick={() => deleteDimension(group)} />
                  </div>
                </div>
                <div className="strategy-dimension-board-body">
                  {assigned.map((question) => (
                    <div
                      key={question.num}
                      className="strategy-dimension-question-chip"
                      draggable
                      onDragStart={(event) => { setDraggedGroup(group); event.dataTransfer.setData('text/plain', String(question.num)) }}
                      onDragEnd={() => setDraggedGroup('')}
                    >
                      <strong>{questionLabel(question)}</strong>
                      <span>{questionRowLabels(question).join(' / ') || '单行题目'}</span>
                    </div>
                  ))}
                  {!assigned.length ? <div className="strategy-empty-inline">把题目拖到这里，或点“添加题目”。</div> : null}
                </div>
              </div>
            )
          })}
          {!groups.length ? <div className="strategy-empty">还没有维度分组。</div> : null}
        </div>
        <div className="strategy-dimension-rename">
          <InputText value={renameValue} placeholder="重命名当前维度" width="100%" onChange={(event) => setRenameValue(event.target.value)} />
          <Button value="保存名称" onClick={() => selectedGroup && renameDimension(selectedGroup)} />
        </div>
      </section>

      <section className="surface strategy-table-panel">
        <div className="section-heading"><h2>题目分组</h2><span>{questions.length}</span></div>
        <div className="strategy-question-list">
          {questions.map((question) => (
            <div key={question.num} className="strategy-question-row">
              <div><strong>{questionLabel(question)}</strong><span>{questionRowLabels(question).join(' / ') || '单行题目'}</span></div>
              <SelectNative
                data={[{ label: '未分组', value: '' }, ...groups.map((group) => ({ label: group, value: group }))]}
                value={findQuestionEntry(config, question.num)?.dimension ?? ''}
                onChange={(event) => onConfigChange(setQuestionDimension(config, question.num, event.target.value))}
              />
            </div>
          ))}
        </div>
      </section>
      <QuestionSelectorDialog
        open={Boolean(selectorGroup)}
        title={`添加题目到「${selectorGroup}」`}
        questions={questionRows.filter((row) => !row.group_name)}
        onCancel={() => setSelectorGroup('')}
        onConfirm={(indices) => {
          const numbers = indices.map((index) => questionRows[index]?.question_num).filter((value): value is number => Boolean(value))
          onConfigChange(moveQuestionsToDimension(config, numbers, selectorGroup))
          setSelectorGroup('')
        }}
      />
    </>
  )
}
