import { useState, type ChangeEvent, type CSSProperties } from 'react'
import { testCustomProxyAPI } from '../services/shell'
import { Button, InputText } from './ui'

interface CustomProxyAPIFieldProps {
  value: string
  onChange: (value: string) => void
  actionLabel?: string
  width?: CSSProperties['width']
}

function isTestFailure(message: string): boolean {
  return /失败|错误|fail|error/i.test(message)
}

function CustomProxyAPIField({ value, onChange, actionLabel = '检测', width = '18rem' }: CustomProxyAPIFieldProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function testAPI() {
    setBusy(true)
    setMessage('')
    try {
      const state = await testCustomProxyAPI(value)
      const suffix = state.success && state.proxies.length ? `，示例：${state.proxies[0]}` : ''
      setMessage(`${state.message || (state.success ? '检测通过' : '检测失败')}${suffix}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="custom-proxy-api-field">
      <InputText
        value={value}
        width={width}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          setMessage('')
          onChange(event.target.value)
        }}
      />
      <Button value={busy ? `${actionLabel}中...` : actionLabel} disabled={busy || !value.trim()} onClick={() => void testAPI()} />
      {message ? (
        <div className={`test-result-banner ${isTestFailure(message) ? 'error' : 'success'}`}>{message}</div>
      ) : null}
    </div>
  )
}

export default CustomProxyAPIField
