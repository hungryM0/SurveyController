import { useEffect, useState } from 'react'
import { GitBranch, Globe, HeartHandshake, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Browser } from '@wailsio/runtime'
import { Button } from '../components/ui'
import type { PageMetric } from '../types'
import TermsDialog from '../components/TermsDialog'
import PageHeader from '../components/PageHeader'
import {
  buildStableReleaseInfo,
  buildVelopackFeedReleaseInfo,
  checkingReleaseInfo,
  emptyReleaseInfo,
  errorReleaseInfo,
  MORE_RELEASES_URL,
  MORE_REPO_URL,
  releaseStatusText,
  shouldAutoCheckRelease,
  WINDOWS_STABLE_FEED_URL,
  WINDOWS_STABLE_MANIFEST_URL,
  type StableReleaseManifest,
  type VelopackFeedPayload,
  type ReleaseInfo,
} from './moreViewModel'

interface MoreViewProps {
  version: string
  aboutItems: PageMetric[]
  // ponytail: declared but never rendered in JSX; kept to avoid breaking callers
  donateItems?: PageMetric[]
  busy?: boolean
  autoCheckUpdate?: boolean
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

function MoreView({
  version,
  aboutItems,
  busy = false,
  autoCheckUpdate = true,
}: MoreViewProps) {
  const [release, setRelease] = useState<ReleaseInfo>(() => emptyReleaseInfo(version))
  const [refreshTick, setRefreshTick] = useState(0)
  const [termsOpen, setTermsOpen] = useState(false)

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

  return (
    <section className="page scroll-page workspace-page">
      <div className="content-stack more-layout">
        <PageHeader eyebrow="关于应用" title="SurveyController" description="版本、更新、项目资源与开源信息。" meta={<div className="more-version-card">
            <span>当前版本</span>
            <strong>{version}</strong>
            <small>{release.message}</small>
          </div>} />
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

          <article className="surface more-card more-card-update">
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
      <TermsDialog open={termsOpen} onClose={() => setTermsOpen(false)} />
    </section>
  )
}

export default MoreView
