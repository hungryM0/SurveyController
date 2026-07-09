import * as Slider from '@radix-ui/react-slider'
import { forwardRef, type ChangeEvent, type ComponentPropsWithoutRef, type CSSProperties } from 'react'

interface SliderBarProps extends Omit<ComponentPropsWithoutRef<typeof Slider.Root>, 'defaultValue' | 'onChange' | 'onValueChange'> {
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  width?: CSSProperties['width']
  tooltip?: string
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}

function emitSliderChange(onChange: SliderBarProps['onChange'], value: number) {
  onChange?.({ target: { value: String(value) } } as ChangeEvent<HTMLInputElement>)
}

const SliderBar = forwardRef<HTMLSpanElement, SliderBarProps>(({
  min = 0,
  max = 100,
  step = 1,
  defaultValue = 0,
  width,
  tooltip,
  onChange,
  ...props
}, ref) => {
  return (
    <Slider.Root
      className="sc-range-slider"
      min={min}
      max={max}
      step={step}
      defaultValue={[defaultValue]}
      style={{ width }}
      title={tooltip}
      onValueChange={(next) => emitSliderChange(onChange, next[0] ?? min)}
      {...props}
    >
      <Slider.Track className="sc-range-track">
        <Slider.Range className="sc-range-fill" />
      </Slider.Track>
      <Slider.Thumb ref={ref} className="sc-range-thumb" aria-label="滑块" />
    </Slider.Root>
  )
})

SliderBar.displayName = 'SliderBar'

export default SliderBar
export type { SliderBarProps }
