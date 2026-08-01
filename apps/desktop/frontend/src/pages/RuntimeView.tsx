import { useEffect, useMemo, useState } from 'react'
import SettingField from '../components/SettingField'
import { loadProxyAreaOptions } from '../services/shell'
import type { AIConnectionTestState, ProxyAreaOptionsState, SettingsGroup } from '../types'
import CustomProxyAPIField from '../components/CustomProxyAPIField'
import PageHeader from '../components/PageHeader'
import { AIConnectionField, NoticeField, ProxyAreaField } from './runtime/RuntimeFieldControls'
import { aiModeValue, aiProviderValue, isRuntimeFieldVisible, proxySourceValue } from './runtime/runtimeFields'

interface RuntimeViewProps {
  groups: SettingsGroup[]
  onFieldChange: (id: string, value: string | boolean) => void
  onTestAIConnection: () => Promise<AIConnectionTestState>
}

function RuntimeView({ groups, onFieldChange, onTestAIConnection }: RuntimeViewProps) {
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
    setAITestBusy(true)
    setAITestMessage('')
    try {
      const state = await onTestAIConnection()
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
        <PageHeader title="运行参数" />
        <div className="settings-section-grid runtime-settings-grid">
        {groups.map((group, idx) => (
          <section className="surface settings-panel" key={group.title}>
            <div className="section-heading group-heading">
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

export default RuntimeView
