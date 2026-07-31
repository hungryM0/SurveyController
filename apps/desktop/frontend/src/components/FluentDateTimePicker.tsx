import { createPortal } from 'react-dom'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './ui'

interface FluentDateTimePickerProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

type DateParts = { year: number; month: number; day: number; hour: number; minute: number }
type PopoverPosition = { top: number; left: number; maxHeight: number }

function FluentDateTimePicker({ value, onChange, disabled = false }: FluentDateTimePickerProps) {
  const triggerId = useId()
  const pickerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null)
  const parsed = parseDateTime(value)
  const [month, setMonth] = useState(() => new Date(parsed.year, parsed.month - 1, 1))
  const days = useMemo(() => calendarDays(month), [month])

  useEffect(() => {
    setMonth(new Date(parsed.year, parsed.month - 1, 1))
  }, [parsed.year, parsed.month])

  useEffect(() => {
    if (!open) {
      setPopoverPosition(null)
      return undefined
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!pickerRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return undefined
    function updatePopoverPosition() {
      const trigger = triggerRef.current
      const popover = popoverRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const gap = 4
      const viewportPadding = 8
      const popupHeight = popover?.offsetHeight ?? 340
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
      const spaceAbove = rect.top - viewportPadding
      const showAbove = spaceBelow < popupHeight + gap && spaceAbove > spaceBelow
      const maxHeight = Math.max(220, Math.min(popupHeight, (showAbove ? spaceAbove : spaceBelow) - gap))
      const width = Math.min(296, window.innerWidth - viewportPadding * 2)
      const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding)
      const top = showAbove
        ? Math.max(viewportPadding, rect.top - Math.min(popupHeight, maxHeight) - gap)
        : rect.bottom + gap
      setPopoverPosition({ top, left, maxHeight })
    }
    updatePopoverPosition()
    window.addEventListener('resize', updatePopoverPosition)
    document.addEventListener('scroll', updatePopoverPosition, true)
    return () => {
      window.removeEventListener('resize', updatePopoverPosition)
      document.removeEventListener('scroll', updatePopoverPosition, true)
    }
  }, [open, month, days.length])

  function chooseDay(day: number) {
    onChange(formatDateTime({ ...parsed, year: month.getFullYear(), month: month.getMonth() + 1, day }))
  }

  function chooseTime(event: ChangeEvent<HTMLSelectElement>) {
    const [hour, minute] = event.target.value.split(':').map(Number)
    onChange(formatDateTime({ ...parsed, hour, minute }))
  }

  function chooseToday() {
    const now = new Date()
    const today = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: parsed.hour, minute: parsed.minute }
    onChange(formatDateTime(today))
    setMonth(new Date(today.year, today.month - 1, 1))
  }

  function handlePopoverKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setOpen(false)
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const delta = event.key === 'PageUp' ? -1 : 1
      setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1))
    }
  }

  const display = value
    ? `${parsed.year}年${String(parsed.month).padStart(2, '0')}月${String(parsed.day).padStart(2, '0')}日 ${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
    : '选择日期和时间'

  return (
    <div ref={pickerRef} className="fluent-datetime-picker">
      <button
        id={triggerId}
        type="button"
        className={`sc-select-trigger fluent-datetime-trigger ${open ? 'is-open' : ''} ${value ? 'has-value' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={value ? `提交时间 ${display}` : '选择提交日期和时间'}
        disabled={disabled}
        ref={triggerRef}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="fluent-datetime-trigger-copy">
          <CalendarDays size={17} aria-hidden="true" />
          <span>{display}</span>
        </span>
        <ChevronDown className={`fluent-datetime-trigger-chevron ${open ? 'is-open' : ''}`} size={16} aria-hidden="true" />
      </button>

      {open && typeof document !== 'undefined' ? createPortal((
        <div ref={popoverRef} className="sc-select-content fluent-datetime-popover" role="dialog" aria-labelledby={triggerId} onKeyDown={handlePopoverKeyDown} style={{ top: popoverPosition?.top ?? 0, left: popoverPosition?.left ?? 0, maxHeight: popoverPosition?.maxHeight, visibility: popoverPosition ? 'visible' : 'hidden' }}>
          <div className="fluent-calendar-toolbar">
            <strong>{month.getFullYear()}年{month.getMonth() + 1}月</strong>
            <div className="fluent-calendar-nav" role="group" aria-label="切换月份">
              <button type="button" aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
              <button type="button" aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
            </div>
          </div>

          <div className="fluent-calendar-week" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="fluent-calendar-grid" role="grid" aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月`}>
            {days.map((day, index) => day ? (
              <button
                type="button"
                role="gridcell"
                key={`${day}-${index}`}
                aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月${day}日`}
                aria-selected={day === parsed.day && month.getMonth() + 1 === parsed.month && month.getFullYear() === parsed.year}
                className={day === parsed.day && month.getMonth() + 1 === parsed.month && month.getFullYear() === parsed.year ? 'is-selected' : ''}
                onClick={() => chooseDay(day)}
              >{day}</button>
            ) : <span key={`empty-${index}`} aria-hidden="true" />)}
          </div>

          <div className="fluent-time-section">
            <label htmlFor={`${triggerId}-time`}>时间</label>
            <select id={`${triggerId}-time`} aria-label="选择时间" value={`${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`} onChange={chooseTime}>{timeOptions().map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </div>

          <div className="fluent-datetime-footer">
            <button type="button" className="fluent-text-button" onClick={() => onChange('')}>清除</button>
            <button type="button" className="fluent-text-button" onClick={chooseToday}>今天</button>
            <Button className="fluent-datetime-done" value="完成" onClick={() => setOpen(false)} />
          </div>
        </div>
      ), document.body) : null}
    </div>
  )
}

function parseDateTime(value: string): DateParts {
  const match = value.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]) }
  }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: 0, minute: 0 }
}

function formatDateTime(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:00`
}

function calendarDays(month: Date): Array<number | null> {
  const first = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  return [...Array(first).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)]
}

function timeOptions(): string[] {
  return Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`)
}

export default FluentDateTimePicker
