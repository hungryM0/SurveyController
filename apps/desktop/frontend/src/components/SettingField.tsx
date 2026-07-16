import { useId, useMemo, type ChangeEvent, type ReactElement } from 'react'
import { InputText, SelectNative, Switch, SliderBar, RangeSliderBar } from './ui'
import type { SettingField as SettingFieldType } from '../types'

interface SettingFieldProps {
  field: SettingFieldType
  onChange: (id: string, value: string | boolean) => void
}

const SelectControl = SelectNative as unknown as (props: {
  data: Array<{ label: string, value: string }>
  value?: string
  disabled?: boolean
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
}) => ReactElement

function SettingField({ field, onChange }: SettingFieldProps) {
  const options = useMemo(
    () => (field.options?.length ? field.options : [field.value]).map((option) => ({ label: option, value: option })),
    [field.options, field.value],
  )
  const [rangeStart, rangeEnd] = useMemo(() => splitRangeValue(field.value), [field.value])
  const [datetimeStart, datetimeEnd] = useMemo(() => splitDateTimeValue(field.value), [field.value])
  const numericRange = useMemo(() => [Number(rangeStart) || 0, Number(rangeEnd) || 0] as [number, number], [rangeStart, rangeEnd])
  const isConcurrency = field.id === 'threads' || field.id === 'reverse-fill-threads'

  return (
    <div className={`setting-row ${field.kind === 'textarea' ? 'textarea-setting-row' : ''}`}>
      <div className="setting-copy">
        <span>{field.label}</span>
        {field.description ? <small>{field.description}</small> : null}
      </div>

      {field.kind === 'toggle' ? (
        <Switch
          label
          labelOn="开"
          labelOff="关"
          checked={field.value === 'true'}
          onChange={(checked) => onChange(field.id, checked)}
        />
      ) : null}

      {field.kind === 'select' ? (
        <SelectControl
          data={options}
          value={field.value}
          onChange={(event) => onChange(field.id, event.target.value)}
        />
      ) : null}

      {field.kind === 'number' && isConcurrency ? (
        <div className="single-slider-field">
          <SliderBar min={1} max={32} value={Number(field.value) || 1} width="min(20rem, 100%)" tooltip={`${field.value} 路并发`} thumbLabel={field.label} onChange={(event) => onChange(field.id, event.target.value)} />
          <output>{field.value}</output>
        </div>
      ) : null}

      {field.kind === 'slider' ? (
        <div className="single-slider-field ratio-slider-field">
          <SliderBar min={0} max={100} value={Number(field.value) || 0} width="100%" tooltip={`${field.label} ${field.value}%`} thumbLabel={field.label} onChange={(event) => onChange(field.id, event.target.value)} />
          <output>{field.value}%</output>
        </div>
      ) : null}

      {field.kind === 'number' && !isConcurrency ? (
        <InputText
          value={field.value}
          width="8rem"
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(field.id, event.target.value)}
        />
      ) : null}

      {field.kind === 'range' ? (
        <div className="dual-slider-field">
          <RangeSliderBar min={0} max={field.id === 'answer-duration' ? 3600 : 1800} values={numericRange} width="min(22rem, 100%)" onChange={([start, end]) => onChange(field.id, `${start}-${end}`)} />
          <output>{formatDuration(Number(rangeStart))} 至 {formatDuration(Number(rangeEnd))}</output>
        </div>
      ) : null}

      {field.kind === 'text' ? (
        <InputText
          value={field.value}
          width="18rem"
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(field.id, event.target.value)}
        />
      ) : null}

      {field.kind === 'password' ? (
        <InputText
          value={field.value}
          width="18rem"
          type="password"
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(field.id, event.target.value)}
        />
      ) : null}

      {field.kind === 'textarea' ? (
        <textarea
          className="textarea-field"
          value={field.value}
          rows={7}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(field.id, event.target.value)}
        />
      ) : null}

      {field.kind === 'datetime-window' ? (
        <DateTimeWindowField start={datetimeStart} end={datetimeEnd} onChange={(value) => onChange(field.id, value)} />
      ) : null}

      {!['toggle', 'select', 'number', 'slider', 'range', 'text', 'password', 'textarea', 'datetime-window'].includes(field.kind) ? (
        <span className="readonly-value">{field.value}</span>
      ) : null}
    </div>
  )
}

function splitRangeValue(value: string): [string, string] {
  const parts = String(value || '').match(/\d+/g) ?? []
  return [parts[0] ?? '0', parts[1] ?? parts[0] ?? '0']
}

function splitDateTimeValue(value: string): [string, string] {
  const parts = String(value || '')
    .split(/\s*(?:\||~)\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
  return [parts[0] ?? '', parts[1] ?? '']
}

function toDateTimeLocal(value: string): string {
  return value ? value.replace(' ', 'T').slice(0, 16) : ''
}

function fromDateTimeLocal(value: string): string {
  return value ? `${value.replace('T', ' ')}:00` : ''
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0))
  const minutes = Math.floor(safe / 60)
  const remainder = safe % 60
  if (!minutes) return `${remainder}秒`
  if (!remainder) return `${minutes}分`
  return `${minutes}分${remainder}秒`
}

function DateTimeWindowField({ start, end, onChange }: { start: string; end: string; onChange: (value: string) => void }) {
  const startId = useId()
  const endId = useId()
  return (
    <div className="datetime-window-field">
      <label htmlFor={startId}>
        <span>开始时间</span>
        <InputText id={startId} type="datetime-local" value={toDateTimeLocal(start)} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(`${fromDateTimeLocal(event.target.value)} | ${end}`)} />
      </label>
      <label htmlFor={endId}>
        <span>结束时间</span>
        <InputText id={endId} type="datetime-local" value={toDateTimeLocal(end)} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(`${start} | ${fromDateTimeLocal(event.target.value)}`)} />
      </label>
    </div>
  )
}

export default SettingField
