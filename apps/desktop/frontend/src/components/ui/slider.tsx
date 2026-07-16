import * as Slider from '@radix-ui/react-slider'
import { forwardRef, type ChangeEvent, type ComponentPropsWithoutRef, type CSSProperties } from 'react'

interface SliderBarProps extends Omit<ComponentPropsWithoutRef<typeof Slider.Root>, 'defaultValue' | 'value' | 'onChange' | 'onValueChange'> {
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  value?: number
  width?: CSSProperties['width']
  tooltip?: string
  thumbLabel?: string
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}

interface RangeSliderBarProps extends Omit<SliderBarProps, 'defaultValue' | 'value' | 'onChange'> {
  values: [number, number]
  onChange?: (values: [number, number]) => void
}

function emitSliderChange(onChange: SliderBarProps['onChange'], value: number) {
  onChange?.({ target: { value: String(value) } } as ChangeEvent<HTMLInputElement>)
}

const SliderBar = forwardRef<HTMLSpanElement, SliderBarProps>(({
  min = 0,
  max = 100,
  step = 1,
  defaultValue = 0,
  value,
  width,
  tooltip,
  thumbLabel = '滑块',
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
      value={value === undefined ? undefined : [value]}
      style={{ width }}
      title={tooltip}
      onValueChange={(next) => emitSliderChange(onChange, next[0] ?? min)}
      {...props}
    >
      <Slider.Track className="sc-range-track">
        <Slider.Range className="sc-range-fill" />
      </Slider.Track>
      <Slider.Thumb ref={ref} className="sc-range-thumb" aria-label={thumbLabel} />
    </Slider.Root>
  )
})

SliderBar.displayName = 'SliderBar'

export default SliderBar
export type { SliderBarProps }

export function RangeSliderBar({ values, onChange, min = 0, max = 100, step = 1, width, ...props }: RangeSliderBarProps) {
  return (
    <Slider.Root
      className="sc-range-slider"
      min={min}
      max={max}
      step={step}
      value={values}
      style={{ width }}
      onValueChange={(next) => onChange?.([next[0] ?? min, next[1] ?? max])}
      {...props}
    >
      <Slider.Track className="sc-range-track"><Slider.Range className="sc-range-fill" /></Slider.Track>
      <Slider.Thumb className="sc-range-thumb" aria-label="范围起点" />
      <Slider.Thumb className="sc-range-thumb" aria-label="范围终点" />
    </Slider.Root>
  )
}
