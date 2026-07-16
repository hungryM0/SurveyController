import { useEffect, useMemo, useState, type ChangeEvent, type ReactElement } from 'react'
import { Activity, Globe, Settings, SlidersHorizontal, Zap } from 'lucide-react'
import { Button, SelectNative } from '../components/ui'
import SettingField from '../components/SettingField'
import { loadProxyAreaOptions, testAIConnection } from '../services/shell'
import type { ProxyAreaOptionsState, RuntimeConfig, SettingField as SettingFieldType, SettingsGroup } from '../types'
import CustomProxyAPIField from '../components/CustomProxyAPIField'
import PageHeader from '../components/PageHeader'

interface RuntimeViewProps {
  groups: SettingsGroup[]
  config?: RuntimeConfig | null
  onFieldChange: (id: string, value: string | boolean) => void
}

const SelectControl = SelectNative as unknown as (props: {
  data: Array<{ label: string, value: string }>
  value?: string
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
}) => ReactElement

function groupIcon(title: string) {
  switch (title) {
    case '基础设置': return <Settings size={14} />
    case '代理设置': return <Globe size={14} />
    case 'AI 设置': return <Zap size={14} />
    case '提交行为': return <Activity size={14} />
    default: return <SlidersHorizontal size={14} />
  }
}

function isTestFailure(message: string): boolean {
  return /失败|错误|fail|error/i.test(message)
}

function RuntimeView({ groups, config, onFieldChange }: RuntimeViewProps) {
  const fields = useMemo(() => groups.flatMap((group) => group.fields), [groups])
  const proxySource = proxySourceValue(fields.find((field) => field.id === 'proxy-source')?.value)
  const aiMode = aiModeValue(fields.find((field) => field.id === 'ai-mode')?.value)
  const aiProvider = aiProviderValue(fields.find((field) => field.id === 'ai-provider')?.value)
  const areaCode = fields.find((field) => field.id === 'proxy-area-code')?.value ?? ''
  const [areaOptions, setAreaOptions] = useState<ProxyAreaOptionsState | null>(null)
  const [aiTestBusy, setAITestBusy] = useState(false)
  const [aiTestMessage, setAITestMessage] = useState('')

  useEffect(() => {
    let ignore = false
    void loadProxyAreaOptions(proxySource)
      .then((state) => {
        if (!ignore) {
          setAreaOptions(state)
        }
      })
      .catch(() => {
        if (!ignore) {
          setAreaOptions(null)
        }
      })
    return () => {
      ignore = true
    }
  }, [proxySource])

  function handleAreaChange(code: string) {
    onFieldChange('proxy-area-code', code)
  }

  async function runAITest() {
    if (!config) {
      setAITestMessage('请先载入运行配置')
      return
    }
    setAITestBusy(true)
    setAITestMessage('')
    try {
      const state = await testAIConnection(config)
      setAITestMessage(state.message || (state.success ? '连接成功' : '连接失败'))
    } catch (err) {
      setAITestMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setAITestBusy(false)
    }
  }

  return (
    <section className="page scroll-page workspace-page">
      <div className="content-stack form-workspace runtime-workspace">
        <PageHeader title="运行参数" meta={<span>{groups.length} 组设置</span>} />
        <div className="settings-section-grid runtime-settings-grid">
        {groups.map((group, idx) => (
          <section className="surface settings-panel" key={group.title}>
            <div className="section-heading group-heading">
              <span className="group-icon">{groupIcon(group.title)}</span>
              <h2>{group.title}</h2>
            </div>
            {group.fields.map((field) => {
              if (!isRuntimeFieldVisible(field, proxySource, aiMode, aiProvider)) {
                return null
              }
              return (
              field.id === 'proxy-area-code'
                ? (
                    <ProxyAreaField
                      key={field.id}
                      source={proxySource}
                      value={areaCode}
                      options={areaOptions}
                      onChange={handleAreaChange}
                    />
                  )
                : field.id === 'custom-proxy-api'
                  ? (
                      <div className="setting-row" key={field.id}>
                        <div className="setting-copy">
                          <span>自定义代理 API</span>
                          <small>仅支持 JSON 或纯文本返回代理地址。</small>
                        </div>
                        <CustomProxyAPIField value={field.value} onChange={(value) => onFieldChange(field.id, value)} />
                      </div>
                    )
                : field.id === 'ai-test-connection'
                  ? (
                      <AIConnectionField
                        key={field.id}
                        busy={aiTestBusy}
                        message={aiTestMessage}
                        onTest={runAITest}
                      />
                    )
                : field.kind === 'notice'
                  ? <NoticeField key={field.id} field={field} />
                  : <SettingField key={field.id} field={field} onChange={onFieldChange} />
              )
            })}
            {idx === groups.length - 1 && <div className="page-bottom-spacer" />}
          </section>
        ))}
        </div>
      </div>
    </section>
  )
}

interface NoticeFieldProps {
  field: SettingFieldType
}

function NoticeField({ field }: NoticeFieldProps) {
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

function AIConnectionField({ busy, message, onTest }: AIConnectionFieldProps) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <span>测试 AI 连接</span>
        <small>验证 API 配置是否正确。</small>
      </div>
      <div className="custom-proxy-api-field">
        <Button value={busy ? '测试中...' : '测试'} disabled={busy} onClick={onTest} />
        {message ? (
          <div className={`test-result-banner ${isTestFailure(message) ? 'error' : 'success'}`}>
            {message}
          </div>
        ) : null}
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

function ProxyAreaField({ source, value, options, onChange }: ProxyAreaFieldProps) {
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
        ...selectedProvince.cities.map((city) => ({ label: city.name, value: city.code })),
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
        <SelectControl
          data={provinceItems}
          value={selected.provinceCode}
          onChange={(event) => {
            const code = event.target.value
            onChange(code)
          }}
        />
        <SelectControl
          data={cityItems}
          value={selected.cityCode}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  )
}

function proxySourceValue(value: string | undefined): string {
  switch (value) {
    case '限时福利':
    case 'benefit':
      return 'benefit'
    case '自定义':
    case 'custom':
      return 'custom'
    default:
      return 'default'
  }
}

function aiModeValue(value: string | undefined): string {
  switch (value) {
    case '自定义服务商':
    case 'provider':
      return 'provider'
    default:
      return 'free'
  }
}

function aiProviderValue(value: string | undefined): string {
  switch (value) {
    case 'OpenAI 兼容':
    case 'custom':
      return 'custom'
    default:
      return 'deepseek'
  }
}

function isRuntimeFieldVisible(field: SettingFieldType, proxySource: string, aiMode: string, aiProvider: string): boolean {
  if (field.id === 'custom-proxy-api') {
    return proxySource === 'custom'
  }
  if (field.id === 'ai-free-notice') {
    return aiMode === 'free'
  }
  if (field.id === 'ai-privacy-notice') {
    return aiMode !== 'free'
  }
  if (field.id.startsWith('ai-') && field.id !== 'ai-mode' && field.id !== 'ai-free-notice' && field.id !== 'ai-privacy-notice') {
    if (aiMode === 'free') {
      return field.id === 'ai-test-connection' || field.id === 'ai-system-prompt'
    }
    if (field.id === 'ai-base-url' || field.id === 'ai-api-protocol') {
      return aiProvider === 'custom'
    }
  }
  return true
}

function resolveSelectedArea(provinces: ProxyAreaOptionsState['provinces'], code: string) {
  const normalized = /^\d{6}$/.test(code) ? code : ''
  if (!normalized) {
    return { provinceCode: '', cityCode: '' }
  }
  for (const province of provinces) {
    if (province.code === normalized) {
      return { provinceCode: province.code, cityCode: province.code }
    }
    const city = province.cities.find((item) => item.code === normalized)
    if (city) {
      return { provinceCode: province.code, cityCode: city.code }
    }
  }
  return { provinceCode: '', cityCode: '' }
}

export default RuntimeView
