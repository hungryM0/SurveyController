import type { HTMLAttributes } from 'react'

interface LoaderBusyProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'small' | 'large'
  setTheme?: 'light' | string
  isLoading?: boolean
}

function LoaderBusy({
  size,
  setTheme,
  isLoading = true,
  className,
  ...props
}: LoaderBusyProps) {
  const classes = [
    'sc-loader-busy',
    setTheme === 'light' ? 'light' : '',
    size === 'large' ? 'loader-lg' : '',
    size === 'small' ? 'loader-sm' : '',
    isLoading ? 'animate' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} {...props}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle className="sc-ldr-busy" cx="8" cy="8" r="7" />
      </svg>
    </div>
  )
}

export default LoaderBusy
