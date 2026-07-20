import type { ChangeEvent, ReactElement } from 'react'
import type { RuntimeConfig } from '../../types'
import { InputText, SelectNative, Switch } from '../ui'

interface NetworkStepProps {
  draft: RuntimeConfig
  busy: boolean
  onChange: (draft: RuntimeConfig) => void
}

const SelectControl = SelectNative as unknown as (props: {
  data: Array<{ label: string; value: string }>
  value?: string
  disabled?: boolean
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
}) => ReactElement

const proxySources = [
  { label: '默认代理', value: 'default' },
  { label: '限时福利', value: 'benefit' },
  { label: '自定义代理', value: 'custom' },
]

function NetworkStep({ draft, busy, onChange }: NetworkStepProps) {
  const randomIP = Boolean(draft.random_ip_enabled)
  const proxySource = normalizeProxySource(draft.proxy_source)

  return (
    <section className="config-wizard-step config-wizard-network-step" aria-labelledby="config-wizard-network-title">
      <div className="config-wizard-step-heading">
        <h2 id="config-wizard-network-title">设置网络方式</h2>
        <p>不需要切换访问 IP 时，保持直连即可。</p>
      </div>

      <div className="config-wizard-form-grid">
        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">随机 IP</span>
            <small>每次提交使用独立代理会话。</small>
          </span>
          <Switch
            aria-label="随机 IP"
            checked={randomIP}
            disabled={busy}
            label
            labelOn="开"
            labelOff="关"
            onChange={(checked) => onChange({ ...draft, random_ip_enabled: checked })}
          />
        </div>

        {randomIP ? (
          <div className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">代理来源</span>
              <small>选择内置代理服务，或接入自己的代理 API。</small>
            </span>
            <SelectControl
              data={proxySources}
              value={proxySource}
              disabled={busy}
              onChange={(event) => onChange({ ...draft, proxy_source: event.target.value })}
            />
          </div>
        ) : null}

        {randomIP && proxySource === 'custom' ? (
          <label className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">代理 API</span>
              <small>填写返回代理地址的 HTTP 接口。</small>
            </span>
            <InputText
              aria-label="代理 API"
              disabled={busy}
              placeholder="https://..."
              value={draft.custom_proxy_api ?? ''}
              width="100%"
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({
                ...draft,
                custom_proxy_api: event.target.value,
              })}
            />
          </label>
        ) : null}

        {randomIP && proxySource !== 'custom' ? (
          <label className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">代理地区代码</span>
              <small>填写 6 位行政区划代码，留空表示不限地区。</small>
            </span>
            <InputText
              aria-label="代理地区代码"
              disabled={busy}
              inputMode="numeric"
              maxLength={6}
              placeholder="不限地区"
              value={draft.proxy_area_code ?? ''}
              width="10rem"
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({
                ...draft,
                proxy_area_code: event.target.value.replace(/\D/g, '').slice(0, 6) || null,
              })}
            />
          </label>
        ) : null}

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">随机访问身份</span>
            <small>混合电脑、手机和微信访问身份。</small>
          </span>
          <Switch
            aria-label="随机访问身份"
            checked={Boolean(draft.random_ua_enabled)}
            disabled={busy}
            label
            labelOn="开"
            labelOff="关"
            onChange={(checked) => onChange({ ...draft, random_ua_enabled: checked })}
          />
        </div>
      </div>
    </section>
  )
}

function normalizeProxySource(value: string | undefined): string {
  if (value === 'benefit' || value === '限时福利') {
    return 'benefit'
  }
  if (value === 'custom' || value === '自定义') {
    return 'custom'
  }
  return 'default'
}

export default NetworkStep
export type { NetworkStepProps }
