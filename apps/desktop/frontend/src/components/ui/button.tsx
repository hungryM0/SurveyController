import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type FormEventHandler, type ReactNode } from 'react'
import LoaderBusy from './loader'

type ButtonVariant = 'primary' | 'danger' | 'success' | 'subtle' | 'primary-outline' | 'danger-outline' | 'success-outline'
type ButtonType = ButtonVariant | 'button' | 'submit' | 'reset'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'value'> {
  type?: ButtonType
  icon?: ReactNode
  value?: ReactNode
  tooltip?: string
  isLoading?: boolean
  justifyContent?: CSSProperties['justifyContent']
  width?: CSSProperties['width']
  onSubmit?: FormEventHandler<HTMLButtonElement>
}

const variants = new Set<string>([
  'primary',
  'danger',
  'success',
  'subtle',
  'primary-outline',
  'danger-outline',
  'success-outline',
])

function htmlButtonType(type: ButtonType | undefined): 'button' | 'submit' | 'reset' {
  if (type === 'submit' || type === 'reset') {
    return type
  }
  return 'button'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  type,
  icon,
  value,
  tooltip,
  isLoading = false,
  justifyContent,
  width,
  style,
  className,
  children,
  disabled,
  ...props
}, ref) => {
  const variant = type && variants.has(type) ? type : ''
  const classes = [
    'sc-button',
    variant ? `sc-button-${variant}` : '',
    isLoading ? 'sc-button-loading' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      ref={ref}
      className={classes}
      style={{ justifyContent, width, ...style }}
      type={htmlButtonType(type)}
      title={tooltip}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <LoaderBusy size="small" isLoading /> : null}
      {icon}
      {value ? <span>{value}</span> : children}
    </button>
  )
})

Button.displayName = 'Button'

export default Button
export type { ButtonProps }
