import { Button } from 'react-windows-ui'

interface TermsDialogProps {
  open: boolean
  variant?: 'terms' | 'license'
  onClose: () => void
}

const termsCopy = {
  title: '服务条款与隐私声明',
  subtitle: '请在使用前阅读',
  body: `───────────────────────────────────────────────────────────────────────
  服务条款
───────────────────────────────────────────────────────────────────────

【第一条 接受条款】

  在安装和使用本软件之前，请您仔细阅读本服务条款。继续安装本软件即表示
  您已充分阅读、理解并同意接受本条款的全部内容。若您不同意本条款的任何
  内容，请立即终止安装。


【第二条 软件用途】

  本软件系开源学习交流工具，仅供个人学习、研究和技术交流使用。严禁将本
  软件用于以下用途：

  · 伪造不实数据或用于学术研究
  · 商业性质的数据采集或问卷填写服务
  · 污染、破坏他人问卷调查数据
  · 侵犯他人合法权益的行为
  · 违反国家法律法规的其他行为

【第三条 免责声明】

  1. 本软件按"现状"提供，不对软件的适用性、准确性、完整性或可靠性作
     任何形式的明示或暗示保证

  2. 本软件含有增值代理服务，非必须功能。软件本体完全免费，用户可根据需要选择启用或不启用增值服务

  3. 使用本软件所产生的一切法律责任及后果均由使用者自行承担，软件开发
     者不承担任何责任

  4. 因使用本软件而导致的任何直接或间接损失，软件开发者概不负责


【第四条 知识产权】

  本软件采用 GPL-3.0 开源许可证在 GitHub 开放全部源代码，版权与软件著作
  权归开发者所有，未经允许禁止闭源分发衍生作品与软件。


【第五条 条款变更】

  开发者保留随时修改本服务条款的权利。条款变更后，继续使用本软件即视为
  接受变更后的条款。


───────────────────────────────────────────────────────────────────────
  隐私声明
───────────────────────────────────────────────────────────────────────

【信息收集】

  本软件承诺：

  · 不收集用户的任何个人身份信息
  · 不收集用户填写的问卷内容数据
  · 不向第三方传输或分享用户数据
  · 所有配置信息仅存储于本地设备


【第三方服务】

  本软件可能调用以下第三方服务，这些服务有其独立的隐私政策：

  · AI 服务提供商（若用户主动配置并启用 AI 功能）
  · 随机 IP 代理服务商（若用户主动启用该功能）

  使用第三方服务时，请注意该服务提供商的隐私政策。


【数据安全】

  · 用户配置的 API 密钥等敏感信息将仅存储于本地配置文件中
  · 软件运行日志仅记录技术诊断信息，不包含个人隐私数据
  · 用户可随时删除本地配置文件以清除所有存储数据`,
}

const licenseCopy = {
  title: '开源许可',
  subtitle: 'GPL-3.0',
  body: `GPL-3.0

分发程序或修改版本时，必须按 GPL-3.0 要求提供对应源码。
接收者保留使用、研究、修改和再分发的自由。`,
}

export function termsDialogCopy(variant: 'terms' | 'license' = 'terms') {
  return variant === 'license' ? licenseCopy : termsCopy
}

function TermsDialog({ open, variant = 'terms', onClose }: TermsDialogProps) {
  if (!open) {
    return null
  }
  const copy = termsDialogCopy(variant)

  return (
    <div className="terms-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="terms-dialog surface" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="terms-dialog-head">
          <div>
            <h2>{copy.title}</h2>
            <span>{copy.subtitle}</span>
          </div>
          <Button value="关闭" onClick={onClose} />
        </div>

        <pre className="terms-dialog-body">{copy.body}</pre>
      </section>
    </div>
  )
}

export default TermsDialog
