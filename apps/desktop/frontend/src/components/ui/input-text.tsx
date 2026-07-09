import { forwardRef, useState, type ChangeEvent, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react'
import LoaderBusy from './loader'

interface InputTextProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'width'> {
  clearButton?: boolean
  label?: ReactNode
  onClearButtonClick?: () => void
  setStatus?: 'default' | 'success' | 'danger' | 'loading' | string
  tooltip?: string
  width?: CSSProperties['width']
}

function emitInputValue(
  onChange: InputTextProps['onChange'] | undefined,
  value: string,
) {
  onChange?.({ target: { value } } as ChangeEvent<HTMLInputElement>)
}

const InputText = forwardRef<HTMLInputElement, InputTextProps>(({
  clearButton = false,
  label,
  onClearButtonClick = () => undefined,
  setStatus = 'default',
  tooltip,
  width,
  style,
  className,
  onChange,
  type = 'text',
  value,
  ...props
}, ref) => {
  const [passwordVisible, setPasswordVisible] = useState(false)
  const normalizedValue = value ?? ''
  const hasValue = String(normalizedValue).length > 0
  const statusClass = setStatus && setStatus !== 'default' ? `input-${setStatus}` : ''
  const inputType = type === 'password' && passwordVisible ? 'text' : type

  return (
    <div className={`sc-input-container ${statusClass}`} title={tooltip}>
      {label ? <span className="sc-input-label">{label}</span> : null}
      <input
        ref={ref}
        className={`sc-input ${className ?? ''}`.trim()}
        type={inputType}
        value={value}
        onChange={onChange}
        style={{ width, ...style }}
        {...props}
      />
      {(clearButton || setStatus === 'loading' || type === 'password') ? (
        <div className="sc-input-end-content">
          {clearButton ? (
            <button
              className={`sc-input-clear ${hasValue ? 'show' : ''}`}
              type="button"
              aria-label="清空"
              onClick={() => {
                emitInputValue(onChange, '')
                onClearButtonClick()
              }}
            />
          ) : null}
          {setStatus === 'loading' ? <LoaderBusy size="small" isLoading /> : null}
          {type === 'password' ? (
            <button
              className="sc-input-password"
              type="button"
              aria-label={passwordVisible ? '隐藏密码' : '显示密码'}
              onClick={() => setPasswordVisible((current) => !current)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

InputText.displayName = 'InputText'

export default InputText
export type { InputTextProps }
