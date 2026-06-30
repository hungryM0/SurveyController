import { useEffect, useState } from 'react'
import { ExternalLink, MessageCircle, PenLine, ShieldCheck } from 'lucide-react'
import { Browser } from '@wailsio/runtime'
import { Button } from 'react-windows-ui'
import ContactDialog from '../components/ContactDialog'
import { buildCommunityIssueUrl, COMMUNITY_REPO_URL, resolveCommunityQrUrl } from './communityViewModel'
import { loadContactStatus, submitContactMessage } from '../services/shell'
import type { ContactRequest, ContactStatus, RuntimeConfig } from '../types'

async function openUrl(url: string) {
  try {
    await Browser.OpenURL(url)
  } catch {
    return
  }
}

interface CommunityViewProps {
  config?: RuntimeConfig | null
  logLines?: string[]
}

function CommunityView({ config = null, logLines = [] }: CommunityViewProps) {
  const qrUrl = typeof window === 'undefined' ? '' : resolveCommunityQrUrl(window.location.origin, window.location.protocol)
  const [contactOpen, setContactOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [contactStatus, setContactStatus] = useState<ContactStatus | null>(null)

  useEffect(() => {
    if (!contactOpen) {
      return
    }
    let ignore = false
    async function refreshStatus() {
      try {
        const status = await loadContactStatus()
        if (!ignore) {
          setContactStatus(status)
        }
      } catch {
        if (!ignore) {
          setContactStatus({ text: '未知：状态获取失败', color: '#666666' })
        }
      }
    }
    void refreshStatus()
    const timer = window.setInterval(() => void refreshStatus(), 5000)
    return () => {
      ignore = true
      window.clearInterval(timer)
    }
  }, [contactOpen])

  async function sendContact(request: ContactRequest) {
    setSending(true)
    setNotice('')
    try {
      const state = await submitContactMessage(request)
      setNotice(state.message || '消息已发送')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="page scroll-page">
      <div className="content-stack community-layout">
        <section className="surface community-hero">
          <div className="community-hero-copy">
            <span className="eyebrow">社区</span>
            <h2>QQ 群、反馈、贡献、许可</h2>
            <p>扫码进群，提问题，提建议，提代码。</p>
          </div>
          <img className="community-hero-qr" src="/community_qr.png" alt="QQ 群二维码" />
        </section>
        {notice ? <div className="status-banner status-banner-info">{notice}</div> : null}

        <section className="community-grid">
          <article className="surface community-card">
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
              <strong>联系开发者</strong>
            </div>
            <p>要反馈、要建议、要报错，直接留消息。</p>
            <div className="community-text-list">
              <span>GitHub Issues</span>
              <span>仓库讨论</span>
              <span>日志反馈</span>
            </div>
            <div className="community-actions">
              <Button value="打开仓库" icon={<ExternalLink size={14} />} onClick={() => void openUrl(COMMUNITY_REPO_URL)} />
              <Button value="提交 issue" icon={<ExternalLink size={14} />} onClick={() => setContactOpen(true)} />
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
              <ShieldCheck size={18} />
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
      <ContactDialog
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        onOpenIssue={() => void openUrl(buildCommunityIssueUrl(COMMUNITY_REPO_URL))}
        onSubmit={sendContact}
        config={config}
        logLines={logLines}
        status={contactStatus}
        busy={sending}
      />
    </section>
  )
}

export default CommunityView
