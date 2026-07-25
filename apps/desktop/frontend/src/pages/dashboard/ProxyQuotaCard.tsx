import { type ChangeEvent, useState } from 'react'
import { ArrowLeft, CreditCard, Globe, Save } from 'lucide-react'
import { Button, InputText } from '../../components/ui'
import type { DashboardViewProps } from './types'

type ProxyQuotaCardProps = Pick<
  DashboardViewProps,
  'dashboard' | 'busy' | 'onSyncProxyStatus' | 'onRedeemProxyCard'
>

function ProxyQuotaCard({
  dashboard,
  busy = false,
  onSyncProxyStatus,
  onRedeemProxyCard,
}: ProxyQuotaCardProps) {
  const [proxyCardCode, setProxyCardCode] = useState('')
  const [quotaPage, setQuotaPage] = useState<'summary' | 'redeem'>('summary')
  const proxyUserId = dashboard.proxyUserKnown ? String(dashboard.proxyUserId ?? 0) : '-'
  const proxyPoolRemaining = dashboard.proxyPoolRemainingKnown ? String(dashboard.proxyPoolRemainingIp ?? 0) : '-'
  const accountRemaining = dashboard.proxyRemainingQuota ?? '0'
  const accountTotalValue = quotaNumber(dashboard.proxyTotalQuota)
  const accountBalancePercent = dashboard.proxyQuotaKnown && accountTotalValue > 0
    ? clampPercent(Math.round((quotaNumber(accountRemaining) / accountTotalValue) * 100))
    : 0

  function redeemProxyCard() {
    const cardCode = proxyCardCode.trim()
    if (!cardCode || busy) {
      return
    }
    onRedeemProxyCard(cardCode)
    setProxyCardCode('')
    setQuotaPage('summary')
  }

  return (
    <section className="surface quota-side-panel">
      <div className="panel-header quota-panel-head">
        <div className="panel-title-group">
          <CreditCard size={18} />
          <h4>IP 额度</h4>
        </div>
        <Button value="同步" icon={<Globe size={14} />} disabled={busy} onClick={onSyncProxyStatus} />
      </div>

      <div className="quota-vertical-body">
        <div className="quota-progress-ring" aria-label={`账号 IP 余额 ${accountRemaining}`}>
          <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
            <circle className="quota-ring-track" cx="60" cy="60" r="48" pathLength="100" />
            <circle
              className={`quota-ring-value ${accountBalancePercent === 0 ? 'is-empty' : ''}`}
              cx="60"
              cy="60"
              r="48"
              pathLength="100"
              strokeDasharray={`${accountBalancePercent} ${100 - accountBalancePercent}`}
            />
          </svg>
          <div className="quota-ring-center">
            <strong>{dashboard.proxyQuotaKnown ? accountRemaining : '-'}</strong>
            <span>账号余额</span>
          </div>
        </div>

        <div className="quota-count-grid">
          <div>
            <span>用户ID</span>
            <strong>{proxyUserId}</strong>
          </div>
          <div>
            <span>IP池总剩余</span>
            <strong>{proxyPoolRemaining}个</strong>
          </div>
        </div>
      </div>

      {quotaPage === 'summary' ? (
        <div className="quota-subpage quota-subpage-summary quota-side-actions">
          <Button
            value="兑换卡密"
            icon={<Save size={14} />}
            disabled={busy}
            onClick={() => setQuotaPage('redeem')}
          />
        </div>
      ) : (
        <div className="quota-subpage quota-subpage-redeem quota-redeem-section">
          <div className="panel-header quota-panel-head quota-page-head">
            <Button value="返回" icon={<ArrowLeft size={14} />} onClick={() => setQuotaPage('summary')} />
            <strong>兑换卡密</strong>
          </div>
          <div className="quota-redeem-form">
            <InputText
              value={proxyCardCode}
              placeholder="额度卡密"
              clearButton
              width="100%"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setProxyCardCode(event.target.value)}
              onClearButtonClick={() => setProxyCardCode('')}
            />
            <Button
              value="兑换"
              icon={<Save size={14} />}
              disabled={busy || !proxyCardCode.trim()}
              onClick={redeemProxyCard}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function quotaNumber(value: string | undefined): number {
  const parsed = Number(String(value ?? '0').trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(100, Math.max(0, value))
}

export default ProxyQuotaCard
