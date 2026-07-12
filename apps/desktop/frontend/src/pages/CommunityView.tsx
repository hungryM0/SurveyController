import { BookOpen, ExternalLink, MessageCircle, PenLine, QrCode, ShieldCheck } from 'lucide-react'
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
        <PageHeader eyebrow="社区" title="交流、反馈与参与贡献" description="找到合适的渠道，获取帮助或参与项目。" />
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
          <article className="surface community-card community-card-featured">
            <div className="community-card-head">
              <MessageCircle size={18} />
              <strong>QQ 群交流</strong>
            </div>
            <p>扫码加入 QQ 交流群，获取更新、反馈问题、交流使用经验。</p>
            <img className="community-qr" src="/community_qr.png" alt="QQ 群二维码" />
            <div className="community-actions">
              <Button value="打开二维码" icon={<ExternalLink size={14} />} disabled={!qrUrl} onClick={() => void openUrl(qrUrl)} />
            </div>
          </article>

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
              <ShieldCheck size={18} />
              <strong>参与贡献</strong>
            </div>
            <p>开发、设计、测试、提 issue 都算贡献。</p>
            <div className="community-text-list">
              <span>代码提交</span>
              <span>测试用例</span>
              <span>体验反馈</span>
            </div>
            <div className="community-actions">
              <Button value="查看贡献方式" icon={<ExternalLink size={14} />} onClick={() => void openUrl('https://github.com/SurveyController/SurveyController')} />
            </div>
          </article>

          <article className="surface community-card">
            <div className="community-card-head">
              <BookOpen size={18} />
              <strong>开源许可</strong>
            </div>
            <p>GPL-3.0。改了再发，就得把源码一并给出去。</p>
            <div className="community-text-list">
              <span>GPL-3.0</span>
              <span>源码公开</span>
              <span>保留署名</span>
            </div>
            <div className="community-actions">
              <Button value="查看协议" icon={<ExternalLink size={14} />} onClick={() => void openUrl(`${COMMUNITY_REPO_URL}/blob/main/LICENSE`)} />
            </div>
          </article>
        </section>
      </div>
    </section>
  )
}

export default CommunityView
