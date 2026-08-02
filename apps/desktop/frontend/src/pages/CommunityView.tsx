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
          <div className="community-hero-copy"><h2>QQ 群交流</h2></div>
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
            <div className="community-text-list">
              <p>请通过 GitHub Issues 提交可复现的问题，并附上必要的运行环境、操作步骤与错误信息。</p>
            </div>
            <div className="community-actions">
              <Button value="提交 Issue" icon={<ExternalLink size={14} />} onClick={() => void openUrl(buildCommunityIssueUrl(COMMUNITY_REPO_URL))} />
            </div>
          </article>

          <article className="surface community-card">
            <div className="community-card-head">
              <BookOpen size={18} />
              <strong>开源许可</strong>
            </div>
            <div className="community-text-list">
              <p>本程序依据 GNU 通用公共许可证第 3 版发布。分发本程序或其修改版本时，应遵守该许可证的条款，并提供相应源代码及保留适用的版权与许可声明。</p>
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
