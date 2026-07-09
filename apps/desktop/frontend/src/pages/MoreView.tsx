import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from 'react'
import { ChartColumn, GitBranch, Globe, HeartHandshake, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Browser } from '@wailsio/runtime'
import { Button } from '../components/ui'
import type { IPUsageSummary, PageMetric } from '../types'
import TermsDialog from '../components/TermsDialog'
import { claimRandomIPBonus } from '../services/shell'
import { buildBonusMessage, formatQuotaValue } from './moreBonusViewModel'
import {
  buildStableReleaseInfo,
  buildVelopackFeedReleaseInfo,
  buildIPUsageChartModel,
  checkingReleaseInfo,
  emptyReleaseInfo,
  errorReleaseInfo,
  IP_USAGE_CHART_HEIGHT,
  IP_USAGE_CHART_WIDTH,
  MORE_RELEASES_URL,
  MORE_REPO_URL,
  releaseStatusText,
  shouldAutoCheckRelease,
  WINDOWS_STABLE_FEED_URL,
  WINDOWS_STABLE_MANIFEST_URL,
  type StableReleaseManifest,
  type VelopackFeedPayload,
  type IPUsageChartPoint,
  type ReleaseInfo,
} from './moreViewModel'

interface MoreViewProps {
  version: string
  summary: IPUsageSummary | null
  aboutItems: PageMetric[]
  // ponytail: declared but never rendered in JSX; kept to avoid breaking callers
  donateItems?: PageMetric[]
  ipUsageItems: PageMetric[]
  randomIpBonusPlayed?: boolean
  busy?: boolean
  autoCheckUpdate?: boolean
  onRefreshSummary: () => void
  onRandomIpBonusPlayed?: (played: boolean) => void
}

const DOC_URL = 'https://surveydoc.hungrym0.com/'
const COPYRIGHT_TEXT = 'Copyright © 2026 HUNGRY_M0. All rights reserved.'
const CONTRIBUTORS = [
  { label: '@HUNGRY_M0', url: 'https://github.com/hungryM0' },
  { label: '@shiahonb777', url: 'https://github.com/shiahonb777' },
  { label: '@BingBuLiang', url: 'https://github.com/BingBuLiang' },
  { label: '@dAwn-Rebirth', url: 'https://github.com/dAwn-Rebirth' },
  { label: '@Moyuin-aka', url: 'https://github.com/Moyuin-aka' },
  { label: '@qintaiyang', url: 'https://github.com/qintaiyang' },
]

async function openUrl(url: string) {
  try {
    await Browser.OpenURL(url)
  } catch {
    return
  }
}

function closestChartPoint(event: PointerEvent<SVGSVGElement>, points: IPUsageChartPoint[]): IPUsageChartPoint | null {
  if (!points.length) {
    return null
  }
  const rect = event.currentTarget.getBoundingClientRect()
  const scale = IP_USAGE_CHART_WIDTH / Math.max(1, rect.width)
  const x = (event.clientX - rect.left) * scale
  return points.reduce((closest, point) => (
    Math.abs(point.x - x) < Math.abs(closest.x - x) ? point : closest
  ), points[0])
}

function MoreView({
  version,
  summary,
  aboutItems,
  ipUsageItems,
  randomIpBonusPlayed = false,
  busy = false,
  autoCheckUpdate = true,
  onRefreshSummary,
  onRandomIpBonusPlayed,
}: MoreViewProps) {
  const [release, setRelease] = useState<ReleaseInfo>(() => emptyReleaseInfo(version))
  const [refreshTick, setRefreshTick] = useState(0)
  const [termsOpen, setTermsOpen] = useState(false)
  const [bonusPlayed, setBonusPlayed] = useState(randomIpBonusPlayed)
  const [bonusBusy, setBonusBusy] = useState(false)
  const [bonusMessage, setBonusMessage] = useState('')
  const [confettiActive, setConfettiActive] = useState(false)
  const [hoverPoint, setHoverPoint] = useState<IPUsageChartPoint | null>(null)
  const chart = useMemo(() => buildIPUsageChartModel(summary?.records ?? []), [summary?.records])

  useEffect(() => {
    setBonusPlayed(randomIpBonusPlayed)
  }, [randomIpBonusPlayed])

  useEffect(() => {
    let ignore = false

    async function loadRelease() {
      setRelease((current) => checkingReleaseInfo(current))
      try {
        const response = await fetch(WINDOWS_STABLE_MANIFEST_URL, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`更新源返回 ${response.status}`)
        }
        const data = await response.json() as StableReleaseManifest
        if (ignore) {
          return
        }
        setRelease(buildStableReleaseInfo(data, version))
      } catch (err) {
        try {
          const response = await fetch(WINDOWS_STABLE_FEED_URL, { cache: 'no-store' })
          if (!response.ok) {
            throw err
          }
          const data = await response.json() as VelopackFeedPayload
          if (!ignore) {
            setRelease(buildVelopackFeedReleaseInfo(data, version))
          }
        } catch {
          if (!ignore) {
            setRelease((current) => errorReleaseInfo(current, err))
          }
        }
      }
    }

    if (shouldAutoCheckRelease(autoCheckUpdate, refreshTick)) {
      void loadRelease()
    }
    return () => {
      ignore = true
    }
  }, [autoCheckUpdate, version, refreshTick])

  async function claimBonus() {
    if (bonusBusy || bonusPlayed) {
      return
    }
    setBonusBusy(true)
    try {
      const result = await claimRandomIPBonus()
      const claimed = result.claimed || result.detail === 'bonus_already_claimed' || result.detail === 'easter_egg_already_claimed'
      const message = buildBonusMessage(result)
      setBonusMessage(message)
      if (claimed) {
        setBonusPlayed(true)
        onRandomIpBonusPlayed?.(true)
      }
      if (result.playConfetti && !bonusPlayed) {
        setConfettiActive(true)
        window.setTimeout(() => setConfettiActive(false), 1800)
      }
      await onRefreshSummary()
    } catch (err) {
      setBonusMessage(`领取彩蛋奖励失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBonusBusy(false)
    }
  }

  return (
    <section className="page scroll-page">
      <div className="content-stack more-layout">
        <section className="surface more-hero">
          <div className="more-hero-copy">
            <span className="eyebrow">更多</span>
            <h2>SurveyController</h2>
            <p>高效的自动化问卷填写工具。</p>
          </div>
          <div className="more-version-card">
            <span>当前版本</span>
            <strong>{version}</strong>
            <small>{release.message}</small>
          </div>
        </section>
        <section className="more-warning-bar">
          <TriangleAlert size={17} />
          <span>本项目仅供学习交流使用，开源以供研究软件原理，禁止用于任何恶意滥用行为。</span>
        </section>

        <section className="more-grid">
          <article className="surface more-card">
            <div className="more-card-head">
              <Globe size={18} />
              <strong>更新检查</strong>
            </div>
            <p>{releaseStatusText(release)}</p>
            {release.releaseNotes && release.releaseNotes !== '暂无更新说明' ? (
              <small className="more-release-notes">{release.releaseNotes}</small>
            ) : null}
            <div className="more-actions">
              <Button value="下载安装包" icon={<Globe size={14} />} onClick={() => void openUrl(release.htmlUrl || MORE_RELEASES_URL)} />
              <Button value="重新检查" icon={<RotateCcw size={14} />} disabled={busy || release.status === 'checking'} onClick={() => setRefreshTick((value) => value + 1)} />
            </div>
          </article>

          <article className="surface more-card">
            <div className="more-card-head">
              <GitBranch size={18} />
              <strong>项目仓库</strong>
            </div>
            <p>主仓库、贡献、提交、问题都在这。</p>
            <div className="more-actions">
              <Button value="打开仓库" icon={<GitBranch size={14} />} onClick={() => void openUrl(MORE_REPO_URL)} />
            </div>
          </article>

          <article className="surface more-card">
            <div className="more-card-head">
              <HeartHandshake size={18} />
              <strong>赞助支持</strong>
            </div>
            <p>如果这个项目对你有帮助，欢迎请作者喝杯奶茶。</p>
            <div className="more-donate-row">
              <div className="more-donate-card more-donate-wechat">
                <strong>微信赞赏</strong>
                <img src="/WeDonate.png" alt="微信赞赏" />
                <span>微信扫一扫</span>
              </div>
              <div className="more-donate-card more-donate-alipay">
                <strong>支付宝</strong>
                <img src="/AliDonate.jpg" alt="支付宝赞助" />
                <span>支付宝扫一扫</span>
              </div>
            </div>
            <small className="more-thanks-text">感谢每一位支持者，你们的鼓励是持续更新的动力。</small>
          </article>

          <article className="surface more-card more-summary-card">
            <div className="more-card-head">
              <ChartColumn size={18} />
              <strong>IP 使用记录</strong>
            </div>
            <div className="more-bonus-row">
              <div className="more-bonus-copy">
                <strong>彩蛋奖励</strong>
                <span>{bonusPlayed ? '已触发过' : '激活随机 IP 后可领取隐藏福利'}</span>
              </div>
              <Button value={bonusBusy ? '领取中...' : '领取彩蛋奖励'} disabled={busy || bonusBusy || bonusPlayed} onClick={() => void claimBonus()} />
            </div>
            <div className="surface ip-usage-chart-card">
              <div className="ip-usage-chart-head">
                <div>
                  <strong>每日提取 IP 数</strong>
                  <span>{chart.rangeLabel}</span>
                </div>
                <div className="ip-usage-chart-stats">
                  <span>合计 {chart.total}</span>
                  <span>日均 {chart.average}</span>
                  <span>峰值 {chart.peakTotal}</span>
                </div>
              </div>
              <div className="ip-usage-chart-frame">
                <svg
                  className="ip-usage-chart"
                  viewBox={`0 0 ${IP_USAGE_CHART_WIDTH} ${IP_USAGE_CHART_HEIGHT}`}
                  role="img"
                  aria-label="每日提取 IP 数折线图"
                  onPointerMove={(event) => setHoverPoint(closestChartPoint(event, chart.points))}
                  onPointerLeave={() => setHoverPoint(null)}
                >
                  <defs>
                    <linearGradient id="ip-usage-gradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.24" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {chart.yTicks.map((tick) => (
                    <g key={tick.value}>
                      <line className="ip-usage-grid-line" x1="52" x2="616" y1={tick.y} y2={tick.y} />
                      <text className="ip-usage-axis-text" x="42" y={tick.y + 4} textAnchor="end">{tick.value}</text>
                    </g>
                  ))}
                  {chart.xLabels.map((item) => (
                    <text key={`${item.label}-${item.x}`} className="ip-usage-axis-text" x={item.x} y="244" textAnchor="middle">{item.label}</text>
                  ))}
                  {chart.areaPath ? <path className="ip-usage-area" d={chart.areaPath} /> : null}
                  {chart.linePath ? <path className="ip-usage-line" d={chart.linePath} /> : null}
                  {chart.points.map((point) => (
                    <circle key={point.label} className="ip-usage-point" cx={point.x} cy={point.y} r={hoverPoint?.label === point.label ? 5 : 3.5} />
                  ))}
                  {hoverPoint ? (
                    <g className="ip-usage-hover">
                      <line x1={hoverPoint.x} x2={hoverPoint.x} y1="22" y2="218" />
                      <circle cx={hoverPoint.x} cy={hoverPoint.y} r="6" />
                    </g>
                  ) : null}
                </svg>
                {!chart.hasData ? <div className="ip-usage-chart-empty">暂无数据</div> : null}
                {hoverPoint ? (
                  <div className="ip-usage-tooltip" style={{ left: `${(hoverPoint.x / IP_USAGE_CHART_WIDTH) * 100}%`, top: `${(hoverPoint.y / IP_USAGE_CHART_HEIGHT) * 100}%` }}>
                    <span>{hoverPoint.label}</span>
                    <strong>提取数量：{hoverPoint.total}</strong>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="more-summary-list">
              {ipUsageItems.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="more-summary-line">
              <span>剩余额度</span>
              <strong>{summary?.remainingQuota || '0'}</strong>
            </div>
            <div className="more-summary-line">
              <span>总额度</span>
              <strong>{summary?.totalQuota || '0'}</strong>
            </div>
            <div className="more-summary-line">
              <span>可用 / 占用</span>
              <strong>{summary ? `${summary.available} / ${summary.inUse}` : '0 / 0'}</strong>
            </div>
            <div className="more-summary-line">
              <span>状态</span>
              <strong>{summary?.message || '未同步'}</strong>
            </div>
            <div className="more-summary-line">
              <span>数据源</span>
              <strong>{summary?.source || '-'}</strong>
            </div>
            <div className="more-summary-line">
              <span>更新时间</span>
              <strong>{summary?.updatedAt || '-'}</strong>
            </div>
            <div className="more-actions">
              <Button value="同步额度" icon={<RotateCcw size={14} />} disabled={busy} onClick={onRefreshSummary} />
            </div>
            {bonusMessage ? <div className="more-bonus-message">{bonusMessage}</div> : null}
            <div className="more-summary-list">
              {summary?.records?.length ? summary.records.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.total}</strong>
                </div>
              )) : <span className="more-empty">还没有使用记录。</span>}
            </div>
          </article>

          <article className="surface more-card">
            <div className="more-card-head">
              <ShieldCheck size={18} />
              <strong>关于</strong>
            </div>
            <p>Wails v3 + React + Go。当前只维护 Windows 桌面端。</p>
            <div className="more-summary-list">
              {aboutItems.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
              <div>
                <span>License</span>
                <strong>GPL-3.0 License</strong>
              </div>
            </div>
            <div className="more-text-list">
              {CONTRIBUTORS.map((item) => (
                <Button key={item.label} value={item.label} onClick={() => void openUrl(item.url)} />
              ))}
            </div>
            <small className="more-copyright">{COPYRIGHT_TEXT}</small>
            <div className="more-actions">
              <Button value="查看文档" icon={<Globe size={14} />} onClick={() => void openUrl(DOC_URL)} />
              <Button value="查看协议" icon={<ShieldCheck size={14} />} onClick={() => setTermsOpen(true)} />
            </div>
          </article>
        </section>
      </div>
      {confettiActive ? (
        <div className="bonus-confetti-layer" aria-hidden="true">
          {Array.from({ length: 24 }).map((_, index) => (
            <span key={index} style={{ '--delay': `${index * 18}ms`, '--x': `${(index % 6) * 16}px` } as CSSProperties} />
          ))}
        </div>
      ) : null}
      <TermsDialog open={termsOpen} onClose={() => setTermsOpen(false)} />
    </section>
  )
}

export default MoreView
