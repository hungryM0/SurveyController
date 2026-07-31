import FluentDateTimePicker from './FluentDateTimePicker'

interface DateTimeWindowFieldProps {
  start: string
  end: string
  onChange: (value: string) => void
  disabled?: boolean
}

function DateTimeWindowField({ start, end, onChange, disabled = false }: DateTimeWindowFieldProps) {
  return (
    <div className="datetime-window-field">
      <label>
        <span>开始时间</span>
        <FluentDateTimePicker disabled={disabled} value={start} onChange={(value) => onChange(`${value} | ${end}`)} />
      </label>
      <label>
        <span>结束时间</span>
        <FluentDateTimePicker disabled={disabled} value={end} onChange={(value) => onChange(`${start} | ${value}`)} />
      </label>
    </div>
  )
}

export default DateTimeWindowField
export type { DateTimeWindowFieldProps }
