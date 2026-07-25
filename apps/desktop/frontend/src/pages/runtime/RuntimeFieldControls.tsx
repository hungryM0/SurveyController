import { Button, SelectNative } from '../../components/ui'
import type { ProxyAreaOptionsState, SettingField } from '../../types'

interface NoticeFieldProps {
  field: SettingField
}

export function NoticeField({ field }: NoticeFieldProps) {
  return (
    <div className="setting-row notice-setting-row">
      <div className="setting-copy">
        <span>{field.label}</span>
        {field.description ? <small>{field.description}</small> : null}
      </div>
    </div>
  )
}

interface AIConnectionFieldProps {
  busy: boolean
  message: string
  onTest: () => void
}

export function AIConnectionField({ busy, message, onTest }: AIConnectionFieldProps) {
  const failed = /失败|错误|fail|error/i.test(message)
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <span>测试 AI 连接</span>
        <small>验证 API 配置是否正确。</small>
      </div>
      <div className="custom-proxy-api-field">
        <Button value={busy ? '测试中...' : '测试'} disabled={busy} onClick={onTest} />
        {message ? <div className={`test-result-banner ${failed ? 'error' : 'success'}`}>{message}</div> : null}
      </div>
    </div>
  )
}

interface ProxyAreaFieldProps {
  source: string
  value: string
  options: ProxyAreaOptionsState | null
  onChange: (code: string) => void
}

export function ProxyAreaField({ source, value, options, onChange }: ProxyAreaFieldProps) {
  const provinces = options?.provinces ?? []
  const selected = resolveSelectedArea(provinces, value)
  const selectedProvince = provinces.find((province) => province.code === selected.provinceCode) ?? null
  const provinceItems = [
    { label: source === 'benefit' ? '请选择省份' : '不限制', value: '' },
    ...provinces.map((province) => ({ label: province.name, value: province.code })),
  ]
  const cityItems = selectedProvince
    ? [
        ...(source === 'benefit' ? [{ label: '请选择城市', value: '' }] : [{ label: '全省/全市', value: selectedProvince.code }]),
        ...(selectedProvince.cities ?? []).map((city) => ({ label: city.name, value: city.code })),
      ]
    : [{ label: '不限制', value: '' }]

  if (source === 'custom') {
    return (
      <div className="setting-row">
        <div className="setting-copy">
          <span>指定地区</span>
          <small>自定义代理源不使用地区筛选。</small>
        </div>
        <span className="readonly-value">不适用</span>
      </div>
    )
  }

  return (
    <div className="setting-row">
      <div className="setting-copy">
        <span>指定地区</span>
        <small>{source === 'benefit' ? '限时福利源只支持部分城市。' : '选择省份或城市，留空则不限地区。'}</small>
      </div>
      <div className="range-field proxy-area-field">
        <SelectNative data={provinceItems} value={selected.provinceCode} onChange={(event) => onChange(event.target.value)} />
        <SelectNative data={cityItems} value={selected.cityCode} onChange={(event) => onChange(event.target.value)} />
      </div>
    </div>
  )
}

function resolveSelectedArea(provinces: NonNullable<ProxyAreaOptionsState['provinces']>, code: string) {
  const normalized = /^\d{6}$/.test(code) ? code : ''
  if (!normalized) return { provinceCode: '', cityCode: '' }
  for (const province of provinces) {
    if (province.code === normalized) return { provinceCode: province.code, cityCode: province.code }
    const city = province.cities?.find((item) => item.code === normalized)
    if (city) return { provinceCode: province.code, cityCode: city.code }
  }
  return { provinceCode: '', cityCode: '' }
}
