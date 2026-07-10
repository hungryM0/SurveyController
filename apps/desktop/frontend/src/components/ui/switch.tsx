import * as RadixSwitch from '@radix-ui/react-switch'
import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'

interface SwitchProps extends Omit<ComponentPropsWithoutRef<typeof RadixSwitch.Root>, 'onChange'> {
  tooltip?: string
  label?: boolean | ReactNode
  labelOn?: string
  labelOff?: string
  labelFixedWidth?: string
  labelPosition?: 'start' | 'end'
  onChange?: (checked: boolean) => void
}

const Switch = forwardRef<HTMLButtonElement, SwitchProps>(({
  tooltip,
  label = true,
  labelOn = 'On',
  labelOff = 'Off',
  labelFixedWidth,
  labelPosition = 'end',
  onChange = () => undefined,
  defaultChecked,
  checked,
  ...props
}, ref) => {
  const [uncontrolledChecked, setUncontrolledChecked] = useState(Boolean(defaultChecked))
  const active = checked ?? uncontrolledChecked
  const labelNode = (
    <span className="sc-switch-label" data-on={labelOn} data-off={labelOff} style={{ width: labelFixedWidth }}>
      {active ? labelOn : labelOff}
    </span>
  )

  return (
    <label className="sc-switch-container" title={tooltip}>
      {label && labelPosition === 'start' ? labelNode : null}
      <RadixSwitch.Root
        ref={ref}
        className="sc-switch"
        defaultChecked={defaultChecked}
        checked={checked}
        onCheckedChange={(next) => {
          setUncontrolledChecked(next)
          onChange(next)
        }}
        {...props}
      >
        <RadixSwitch.Thumb className="sc-switch-thumb" />
      </RadixSwitch.Root>
      {label && labelPosition === 'end' ? labelNode : null}
    </label>
  )
})

Switch.displayName = 'Switch'

export default Switch
export type { SwitchProps }
