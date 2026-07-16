import { BookOpen, ExternalLink, PenLine, QrCode } from 'lucide-react'
import { Browser } from '@wailsio/runtime'
import { Button } from '../components/ui'
import { buildCommunityIssueUrl, COMMUNITY_REPO_URL, resolveCommunityQrUrl } from './communityViewModel'
import PageHeader from '../components/PageHeader'

async function openUrl(url: string) {
  try {
    await Browser.OpenURL(url)
  } catch {
    return
  }
}

function CommunityView() {
  const qrUrl = typeof window === 'undefined' ? '' : resolveCommunityQrUrl(window.location.origin, window.location.protocol)

  return (
    <section className="page scroll-page workspace-page">
      <div className="content-stack community-layout">
        <PageHeader title="社区" />
        <section className="surface community-hero">
          <div className="community-hero-copy"><h2>QQ 群交流</h2><p className="community-hero-desc">扫码加入交流群，获取更新并交流使用经验。</p></div>
          <div className="qr-image-wrapper">
            {qrUrl ? (
              <img className="community-hero-qr" src="/community_qr.png" alt="QQ 群二维码" />
            ) : (
              <div className="qr-placeholder"><QrCode size={48} /></div>
            )}
          </div>
        </section>

        <section className="community-grid">
          <article className="surface community-card">
            <div className="community-card-head">
              <PenLine size={18} />
              <strong>问题反馈</strong>
            </div>
            <p>问题、建议、报错，统一走 GitHub issue。</p>
            <div className="community-text-list">
              <span>GitHub Issues</span>
              <span>仓库讨论</span>
              <span>问题跟踪</span>
            </div>
            <div className="community-actions">
              <Button value="打开仓库" icon={<ExternalLink size={14} />} onClick={() => void openUrl(COMMUNITY_REPO_URL)} />
              <Button value="提交 issue" icon={<ExternalLink size={14} />} onClick={() => void openUrl(buildCommunityIssueUrl(COMMUNITY_REPO_URL))} />
            </div>
          </article>

          <article className="surface community-card">
            <div className="community-card-head">
              <BookOpen size={18} />
              <strong>开源许可</strong>
            </div>
            <p>本项目采用 GPL-3.0 许可证。修改并再发布时，应同时公开相应源代码。</p>
            <div className="community-text-list">
              <span>GPL-3.0 许可证</span>
              <span>公开相应源代码</span>
              <span>保留版权声明</span>
            </div>
            <div className="community-actions">
              <Button value="查看许可证" icon={<ExternalLink size={14} />} onClick={() => void openUrl(`${COMMUNITY_REPO_URL}/blob/main/LICENSE`)} />
            </div>
          </article>
        </section>
      </div>
    </section>
  )
}

export default CommunityView
