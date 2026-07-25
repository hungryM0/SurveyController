import { useMemo } from 'react'

interface OptionPickerProps {
  title: string
  items: string[]
  selected: number[]
  onChange: (next: number[]) => void
}

export function OptionPicker({ title, items, selected, onChange }: OptionPickerProps) {
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
                if (event.target.checked) next.add(index)
                else next.delete(index)
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
