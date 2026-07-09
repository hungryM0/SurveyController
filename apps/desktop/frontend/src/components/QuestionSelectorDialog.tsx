import { useMemo, useState, type ChangeEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button, InputText } from './ui'
import type { DimensionQuestionRow } from '../pages/strategyEditor'

interface QuestionSelectorDialogProps {
  open: boolean
  title: string
  questions: DimensionQuestionRow[]
  onCancel: () => void
  onConfirm: (indices: number[]) => void
}

function QuestionSelectorDialog({ open, title, questions, onCancel, onConfirm }: QuestionSelectorDialogProps) {
  const [searchText, setSearchText] = useState('')
  const [selected, setSelected] = useState<number[]>([])

  const filtered = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    if (!keyword) {
      return questions
    }
    return questions.filter((item) => {
      return [item.question_num, item.title, item.type_label, item.group_name]
        .map((value) => String(value ?? '').toLowerCase())
        .some((value) => value.includes(keyword))
    })
  }, [questions, searchText])

  if (!open) {
    return null
  }

  function toggle(index: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(index)
      } else {
        next.delete(index)
      }
      return [...next].sort((left, right) => left - right)
    })
  }

  function confirm() {
    onConfirm(selected)
    setSelected([])
    setSearchText('')
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="question-selector-backdrop" />
        <Dialog.Content className="question-selector-dialog surface">
        <div className="question-selector-head">
          <div>
            <Dialog.Title asChild>
              <h2>{title}</h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <span>支持搜索和多选</span>
            </Dialog.Description>
          </div>
          <Button value="关闭" onClick={onCancel} />
        </div>

        <div className="question-selector-toolbar">
          <InputText
            value={searchText}
            placeholder="搜索题号、题干、题型、维度"
            width="100%"
            clearButton
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value)}
            onClearButtonClick={() => setSearchText('')}
          />
          <Button value="全选" onClick={() => setSelected(filtered.map((item) => item.index))} />
          <Button value="清空" onClick={() => setSelected([])} />
        </div>

        <div className="question-selector-list">
          {filtered.map((item) => (
            <label key={item.question_num} className="question-selector-row">
              <input
                type="checkbox"
                checked={selected.includes(item.index)}
                onChange={(event) => toggle(item.index, event.target.checked)}
              />
              <span>{item.question_num}. {item.title}</span>
              <small>{item.type_label}</small>
              <strong>{item.group_name || '未分组'}</strong>
            </label>
          ))}
          {!filtered.length ? <div className="strategy-empty">没有可选题目。</div> : null}
        </div>

        <div className="question-selector-foot">
          <Button value="取消" onClick={onCancel} />
          <Button type="primary" value="确定" onClick={confirm} />
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default QuestionSelectorDialog
