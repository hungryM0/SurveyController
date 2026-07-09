import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import type { ChangeEvent } from 'react'

const EMPTY_VALUE = '__sc_empty_value__'

interface SelectOption {
  label: string
  value: string
}

interface SelectNativeProps {
  data?: SelectOption[]
  value?: string
  name?: string
  tooltip?: string
  disabled?: boolean
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
  onClick?: () => void
}

function encodeValue(value: string | undefined) {
  return value === '' || value === undefined ? EMPTY_VALUE : value
}

function decodeValue(value: string) {
  return value === EMPTY_VALUE ? '' : value
}

function emitSelectChange(
  onChange: SelectNativeProps['onChange'] | undefined,
  value: string,
) {
  onChange?.({ target: { value } } as ChangeEvent<HTMLSelectElement>)
}

function SelectNative({
  data = [],
  value,
  name,
  tooltip,
  disabled,
  onChange,
  onClick,
}: SelectNativeProps) {
  const selected = data.find((item) => item.value === value)
  const encodedValue = value === undefined ? undefined : encodeValue(value)

  return (
    <Select.Root
      value={encodedValue}
      name={name}
      disabled={disabled}
      onValueChange={(next) => emitSelectChange(onChange, decodeValue(next))}
    >
      <Select.Trigger className="sc-select-trigger" title={tooltip} onClick={onClick} aria-label={selected?.label ?? '选择'}>
        <Select.Value>{selected?.label ?? data.find((item) => item.value === '')?.label ?? '请选择'}</Select.Value>
        <Select.Icon className="sc-select-icon">
          <ChevronDown size={14} strokeWidth={2.2} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="sc-select-content" position="popper" sideOffset={4}>
          <Select.Viewport className="sc-select-viewport">
            {data.map((item, index) => (
              <Select.Item className="sc-select-item" value={encodeValue(item.value)} key={`${encodeValue(item.value)}-${index}`}>
                <Select.ItemText>{item.label}</Select.ItemText>
                <Select.ItemIndicator className="sc-select-item-indicator">
                  <Check size={13} strokeWidth={2.4} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

export default SelectNative
export type { SelectNativeProps, SelectOption }
