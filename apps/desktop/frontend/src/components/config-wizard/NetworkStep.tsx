import { CheckCircle2, CircleHelp, CircleX, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { loadProxyStatus, syncProxyStatus, testCustomProxyAPI, testFixedProxy } from '../../services/shell'
import { isHttpProxyAddress } from '../../services/configDocumentValues'
import type { ProxyStatus } from '../../types'
import { Button, InputText, SelectNative, Switch } from '../ui'
import { cloneWizardDraft, type WizardDraft } from './configWizardModel'
import {
  buildCustomProxyTestView,
  buildFixedProxyStatusView,
  buildProxyStatusView,
  errorMessage,
  normalizeProxySource,
  networkMode,
  type CustomProxyTestPhase,
  type FixedProxyTestPhase,
  type NetworkStatusIcon,
  type NetworkStatusTone,
} from './networkStepModel'

interface NetworkStepProps {
  draft: WizardDraft
  busy: boolean
  onChange: (draft: WizardDraft) => void
  onProxyStatusChange?: (status: ProxyStatus | null) => void
}

type ProxyReadPhase = 'idle' | 'loading' | 'success' | 'failure'

interface ProxyReadState {
  phase: ProxyReadPhase
  status: ProxyStatus | null
  error: string
  source: string
}

interface CustomProxyTestState {
  phase: CustomProxyTestPhase
  targetURL: string
  message: string
  proxyCount: number
}

interface FixedProxyTestState {
  phase: FixedProxyTestPhase
  targetAddress: string
  message: string
}

const proxySources = [
  { label: '默认代理', value: 'default' },
  { label: '限时福利', value: 'benefit' },
  { label: '自定义代理', value: 'custom' },
]

export function isProxyStatusForSource(
  status: Pick<ProxyStatus, 'source'> | null | undefined,
  source: string,
): boolean {
  const expectedSource = normalizeProxySource(source)
  const receivedSource = status?.source?.trim().toLowerCase() ?? ''
  if (!receivedSource) return false
  if (receivedSource === '福利' || receivedSource === '限时福利') return expectedSource === 'benefit'
  if (receivedSource === '自定义') return expectedSource === 'custom'
  return receivedSource === expectedSource
}

function NetworkStep({ draft, busy, onChange, onProxyStatusChange }: NetworkStepProps) {
  const network = draft.config.network
  const mode = networkMode(network)
  const randomIP = mode === 'random'
  const fixedProxyAddress = (network.fixedProxyAddress ?? '').trim()
  const proxySource = normalizeProxySource(network.proxySource)
  const customProxyURL = (network.customProxyApi ?? '').trim()
  const proxyRequestRef = useRef(0)
  const customTestRequestRef = useRef(0)
  const fixedTestRequestRef = useRef(0)
  const [proxyState, setProxyState] = useState<ProxyReadState>(() => ({
    phase: randomIP ? 'loading' : 'idle',
    status: null,
    error: '',
    source: proxySource,
  }))
  const [customTest, setCustomTest] = useState<CustomProxyTestState>({
    phase: 'idle',
    targetURL: '',
    message: '',
    proxyCount: 0,
  })
  const [fixedTest, setFixedTest] = useState<FixedProxyTestState>({
    phase: 'idle',
    targetAddress: '',
    message: '',
  })

  function updateNetwork(values: Partial<typeof network>) {
    const next = cloneWizardDraft(draft)
    next.config.network = { ...next.config.network, ...values }
    onChange(next)
  }

  function updateMode(nextMode: string) {
    if (nextMode === 'fixed') {
      updateNetwork({ proxyMode: 'fixed', randomProxyEnabled: false })
      return
    }
    if (nextMode === 'random') {
      updateNetwork({ proxyMode: 'random', randomProxyEnabled: true, fixedProxyAddress: '' })
      return
    }
    updateNetwork({ proxyMode: 'direct', randomProxyEnabled: false, fixedProxyAddress: '' })
  }

  const refreshProxyStatus = useCallback(async (sync: boolean) => {
    const requestID = proxyRequestRef.current + 1
    proxyRequestRef.current = requestID
    const currentSource = proxySource
    setProxyState({ phase: 'loading', status: null, error: '', source: currentSource })
    onProxyStatusChange?.(null)

    try {
      const status = sync && randomIP && proxySource !== 'custom'
        ? await syncProxyStatus(proxySource)
        : await loadProxyStatus()
      if (requestID !== proxyRequestRef.current) return
      if (!isProxyStatusForSource(status, currentSource)) {
        setProxyState({ phase: 'success', status: null, error: '', source: currentSource })
        onProxyStatusChange?.(null)
        return
      }
      setProxyState({ phase: 'success', status, error: '', source: currentSource })
      onProxyStatusChange?.(status)
    } catch (error) {
      if (requestID !== proxyRequestRef.current) return
      setProxyState({ phase: 'failure', status: null, error: errorMessage(error), source: currentSource })
      onProxyStatusChange?.(null)
    }
  }, [onProxyStatusChange, proxySource, randomIP])

  useEffect(() => {
    if (!randomIP) {
      proxyRequestRef.current += 1
      setProxyState({ phase: 'idle', status: null, error: '', source: proxySource })
      onProxyStatusChange?.(null)
      return
    }

    void refreshProxyStatus(false)
    return () => {
      proxyRequestRef.current += 1
    }
  }, [onProxyStatusChange, proxySource, randomIP, refreshProxyStatus])

  async function testCustomAPI() {
    const requestID = customTestRequestRef.current + 1
    customTestRequestRef.current = requestID
    if (!customProxyURL) {
      setCustomTest({ phase: 'missing', targetURL: '', message: '', proxyCount: 0 })
      return
    }

    setCustomTest({ phase: 'loading', targetURL: customProxyURL, message: '', proxyCount: 0 })
    onProxyStatusChange?.(null)
    try {
      const result = await testCustomProxyAPI(customProxyURL)
      if (requestID !== customTestRequestRef.current) return
      const success = Boolean(result.success)
      if (success) {
        try {
          const status = await loadProxyStatus()
          if (requestID === customTestRequestRef.current && isProxyStatusForSource(status, 'custom')) {
            onProxyStatusChange?.(status)
          }
        } catch {
          onProxyStatusChange?.(null)
        }
      }
      setCustomTest({
        phase: success ? 'success' : 'failure',
        targetURL: customProxyURL,
        message: result.message.trim() || (success ? '服务返回连接成功' : '服务返回失败，但没有提供原因。'),
        proxyCount: result.proxies?.length ?? 0,
      })
    } catch (error) {
      if (requestID !== customTestRequestRef.current) return
      setCustomTest({
        phase: 'failure',
        targetURL: customProxyURL,
        message: errorMessage(error),
        proxyCount: 0,
      })
    }
  }

  useEffect(() => {
    if (randomIP && proxySource === 'custom') onProxyStatusChange?.(null)
  }, [customProxyURL, onProxyStatusChange, proxySource, randomIP])

  async function testFixedConnection() {
    const requestID = fixedTestRequestRef.current + 1
    fixedTestRequestRef.current = requestID
    const requestAddress = fixedProxyAddress
    if (!requestAddress) {
      setFixedTest({ phase: 'missing', targetAddress: '', message: '' })
      return
    }
    if (!isHttpProxyAddress(requestAddress)) {
      setFixedTest({ phase: 'invalid', targetAddress: requestAddress, message: '' })
      return
    }

    setFixedTest({ phase: 'loading', targetAddress: requestAddress, message: '' })
    try {
      const result = await testFixedProxy(requestAddress)
      if (requestID !== fixedTestRequestRef.current) return
      setFixedTest({
        phase: result.success ? 'success' : 'failure',
        targetAddress: requestAddress,
        message: result.message.trim() || (result.success ? '检测通过' : '连接失败'),
      })
    } catch (error) {
      if (requestID !== fixedTestRequestRef.current) return
      setFixedTest({ phase: 'failure', targetAddress: requestAddress, message: errorMessage(error) })
    }
  }

  const statusLoading = proxyState.phase === 'loading'
    || (randomIP && (proxyState.source !== proxySource || proxyState.phase === 'idle'))
  const currentProxyStatus = statusLoading || !isProxyStatusForSource(proxyState.status, proxySource)
    ? null
    : proxyState.status
  const fixedTestPhase = !fixedProxyAddress
    ? 'missing'
    : !isHttpProxyAddress(fixedProxyAddress)
      ? 'invalid'
    : fixedTest.targetAddress === fixedProxyAddress
      ? fixedTest.phase
      : 'idle'
  const statusView = mode === 'fixed'
    ? buildFixedProxyStatusView(fixedTestPhase, fixedTest.message)
    : buildProxyStatusView({
        randomIPEnabled: randomIP,
        source: proxySource,
        status: currentProxyStatus,
        loading: statusLoading,
        error: statusLoading ? '' : proxyState.error,
      })
  const customTestView = customProxyURL
    ? customTest.targetURL === customProxyURL
      ? buildCustomProxyTestView(customTest.phase, customTest.message, customTest.proxyCount)
      : buildCustomProxyTestView('idle')
    : buildCustomProxyTestView('missing')
  const customTestLoading = customTest.phase === 'loading' && customTest.targetURL === customProxyURL
  const customInputStatus = customTestLoading
    ? 'loading'
    : customTest.targetURL === customProxyURL && customTest.phase === 'success'
      ? 'success'
      : customTest.targetURL === customProxyURL && customTest.phase === 'failure'
        ? 'danger'
        : 'default'
  const statusActionLabel = randomIP && proxySource !== 'custom' ? '同步额度' : '刷新状态'

  return (
    <section className="config-wizard-step config-wizard-network-step" aria-labelledby="config-wizard-network-title">
      <div className="config-wizard-step-heading">
        <h2 id="config-wizard-network-title">设置网络方式</h2>
      </div>

      <StatusBanner
        detail={statusView.detail}
        icon={statusView.icon}
        title={statusView.title}
        tone={statusView.tone}
      />

      <dl className="config-wizard-review-grid" aria-label="代理状态详情">
        <div className="config-wizard-review-item">
          <dt>代理来源</dt>
          <dd>{statusView.sourceLabel}</dd>
        </div>
        <div className="config-wizard-review-item">
          <dt>额度</dt>
          <dd>{statusView.quotaLabel}</dd>
        </div>
        <div className="config-wizard-review-item">
          <dt>代理 IP 池</dt>
          <dd>{statusView.poolLabel}</dd>
        </div>
      </dl>

      {mode !== 'fixed' ? (
        <div className="config-wizard-inline-actions">
          <Button
            type="subtle"
            icon={statusLoading ? undefined : <RefreshCw size={16} strokeWidth={1.9} />}
            value={statusLoading ? '正在读取' : statusActionLabel}
            disabled={busy || statusLoading}
            isLoading={statusLoading}
            onClick={() => void refreshProxyStatus(true)}
          />
        </div>
      ) : null}

      <div className="config-wizard-form-grid">
        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">访问方式</span>
          </span>
          <SelectNative
            aria-label="访问方式"
            data={[
              { label: '直连', value: 'direct' },
              { label: '固定代理', value: 'fixed' },
              { label: '随机 IP', value: 'random' },
            ]}
            value={mode}
            disabled={busy}
            onChange={(event) => updateMode(event.target.value)}
          />
        </div>

        {mode === 'fixed' ? (
          <div className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">固定代理地址</span>
            </span>
            <div className="config-wizard-custom-proxy-controls">
              <div className="config-wizard-custom-proxy-row">
                <div className="config-wizard-custom-proxy-input">
                  <InputText
                    aria-label="固定代理地址"
                    disabled={busy}
                    placeholder="http://127.0.0.1:8080"
                    setStatus={fixedTestPhase === 'loading' ? 'loading' : fixedTestPhase === 'success' ? 'success' : fixedTestPhase === 'failure' || fixedTestPhase === 'invalid' ? 'danger' : 'default'}
                    value={network.fixedProxyAddress ?? ''}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNetwork({ fixedProxyAddress: event.target.value })}
                  />
                </div>
                <Button
                  type="subtle"
                  icon={fixedTestPhase === 'loading' ? undefined : <RefreshCw size={16} strokeWidth={1.9} />}
                  value={fixedTestPhase === 'loading' ? '测试中' : '测试连接'}
                  disabled={busy || fixedTestPhase === 'loading' || fixedTestPhase === 'invalid' || !fixedProxyAddress}
                  isLoading={fixedTestPhase === 'loading'}
                  onClick={() => void testFixedConnection()}
                />
              </div>
            </div>
          </div>
        ) : null}

        {mode === 'random' ? (
          <div className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">代理来源</span>
            </span>
            <SelectNative
              data={proxySources}
              value={proxySource}
              disabled={busy}
              onChange={(event) => updateNetwork({ proxySource: event.target.value })}
            />
          </div>
        ) : null}

        {randomIP && proxySource === 'custom' ? (
          <div className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">代理 API</span>
            </span>
            <div className="config-wizard-custom-proxy-controls">
              <div className="config-wizard-custom-proxy-row">
                <div className="config-wizard-custom-proxy-input">
                  <InputText
                    aria-label="代理 API"
                    disabled={busy}
                    placeholder="https://..."
                    setStatus={customInputStatus}
                    value={network.customProxyApi ?? ''}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNetwork({ customProxyApi: event.target.value })}
                  />
                </div>
                <Button
                  type="subtle"
                  icon={customTestLoading ? undefined : <RefreshCw size={16} strokeWidth={1.9} />}
                  value={customTestLoading ? '测试中' : '测试连接'}
                  disabled={busy || customTestLoading || !customProxyURL}
                  isLoading={customTestLoading}
                  onClick={() => void testCustomAPI()}
                />
              </div>
              {customTestView.visible ? (
                <StatusBanner
                  detail={customTestView.detail}
                  icon={customTestView.icon}
                  title={customTestView.title}
                  tone={customTestView.tone}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {randomIP && proxySource !== 'custom' ? (
          <label className="config-wizard-field config-wizard-reveal">
            <span className="config-wizard-field-copy">
              <span className="config-wizard-field-label">代理地区代码</span>
            </span>
            <InputText
              aria-label="代理地区代码"
              disabled={busy}
              inputMode="numeric"
              maxLength={6}
              placeholder="不限地区"
              value={network.proxyAreaCode ?? ''}
              width="10rem"
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateNetwork({
                proxyAreaCode: event.target.value.replace(/\D/g, '').slice(0, 6) || undefined,
              })}
            />
          </label>
        ) : null}

        <div className="config-wizard-field">
          <span className="config-wizard-field-copy">
            <span className="config-wizard-field-label">随机访问身份</span>
          </span>
          <Switch
            aria-label="随机访问身份"
            checked={network.randomUaEnabled}
            disabled={busy}
            label
            labelOn="开"
            labelOff="关"
            onChange={(checked) => updateNetwork({ randomUaEnabled: checked })}
          />
        </div>
      </div>
    </section>
  )
}

function StatusBanner({
  detail,
  icon,
  title,
  tone,
}: {
  detail: string
  icon: NetworkStatusIcon
  title: string
  tone: NetworkStatusTone
}) {
  return (
    <div
      className={`config-wizard-ready-card ${tone === 'warning' ? 'is-warning' : tone === 'danger' ? 'is-blocked' : ''}`.trim()}
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <StatusIcon icon={icon} />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  )
}

function StatusIcon({ icon }: { icon: NetworkStatusIcon }) {
  const props = { size: 19, strokeWidth: 1.9, 'aria-hidden': true as const }
  switch (icon) {
    case 'direct':
    case 'connected':
      return <CheckCircle2 {...props} />
    case 'loading':
      return <LoaderCircle {...props} />
    case 'error':
      return <CircleX {...props} />
    default:
      return icon === 'unknown' ? <CircleHelp {...props} /> : <TriangleAlert {...props} />
  }
}

export default NetworkStep
export type { NetworkStepProps }
