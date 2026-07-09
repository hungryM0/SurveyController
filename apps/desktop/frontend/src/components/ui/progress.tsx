import * as Progress from '@radix-ui/react-progress'
import type { CSSProperties } from 'react'

interface ProgressBarProps {
  color?: string
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  tooltip?: string
  setProgress?: number | 'hidden' | 'indeterminate'
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value))
}

function ProgressBar({
  color,
  width,
  height,
  tooltip,
  setProgress = 0,
}: ProgressBarProps) {
  const indeterminate = setProgress === 'indeterminate'
  const hidden = setProgress === 'hidden'
  const value = typeof setProgress === 'number' ? clampProgress(setProgress) : undefined

  return (
    <Progress.Root
      className={`sc-progress-bar ${hidden ? 'hide' : ''}`}
      value={value}
      title={tooltip}
      style={{ width, height }}
    >
      <Progress.Indicator
        className={`sc-progress-indicator ${indeterminate ? 'indeterminate' : ''}`}
        style={{ width: indeterminate ? undefined : `${value ?? 0}%`, backgroundColor: color }}
      />
    </Progress.Root>
  )
}

export default ProgressBar
export type { ProgressBarProps }
