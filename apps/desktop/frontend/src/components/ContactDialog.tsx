import { type ChangeEvent, useState } from 'react'
import { Dialogs } from '@wailsio/runtime'
import { Button } from 'react-windows-ui'
import type { ContactRequest, ContactStatus, RuntimeConfig } from '../types'

interface ContactDialogProps {
  open: boolean
  onClose: () => void
  onOpenIssue: () => void
  onSubmit: (request: ContactRequest) => Promise<void>
  config?: RuntimeConfig | null
  logLines?: string[]
  status?: ContactStatus | null
  busy?: boolean
}

const messageTypes = ['报错反馈', '新功能建议', '纯聊天']

function ContactDialog({ open, onClose, onOpenIssue, onSubmit, config = null, logLines = [], status = null, busy = false }: ContactDialogProps) {
  const [messageType, setMessageType] = useState(messageTypes[0])
  const [issueTitle, setIssueTitle] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [autoAttachConfig, setAutoAttachConfig] = useState(true)
  const [autoAttachLog, setAutoAttachLog] = useState(true)

  if (!open) {
    return null
  }

  async function submit() {
    await onSubmit({
      messageType,
      issueTitle,
      email,
      message,
      attachments,
      autoAttachConfig,
      autoAttachLog,
      config,
      logLines,
    })
  }

  async function chooseAttachments() {
    const paths = await Dialogs.OpenFile({
      Title: '选择图片',
      AllowsMultipleSelection: true,
      CanChooseDirectories: false,
      CanChooseFiles: true,
      Filters: [
        { DisplayName: '图片文件', Pattern: '*.png;*.jpg;*.jpeg;*.bmp;*.gif;*.webp' },
      ],
    })
    setAttachments((current) => Array.from(new Set([...current, ...paths])).slice(0, 3))
  }

  function fileName(path: string) {
    return path.split(/[\\/]/).filter(Boolean).pop() ?? path
  }

  return (
    <div className="contact-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="contact-dialog surface" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="contact-dialog-head">
          <div>
            <h2>联系开发者</h2>
            <span>反馈、建议、报错都可以从这里发</span>
          </div>
          <Button value="关闭" onClick={onClose} />
        </div>

        <div className="contact-dialog-body contact-form">
          {status ? <div className="contact-status" style={{ color: status.color }}>{status.text}</div> : null}
          <label>
            类型
            <select value={messageType} onChange={(event: ChangeEvent<HTMLSelectElement>) => setMessageType(event.target.value)}>
              {messageTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          {messageType === '报错反馈' ? (
            <label>
              标题
              <input value={issueTitle} placeholder="可选" onChange={(event) => setIssueTitle(event.target.value)} />
            </label>
          ) : null}
          <label>
            邮箱
            <input value={email} placeholder="可选，用于回复处理进度" onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            内容
            <textarea value={message} placeholder="写清现象、步骤、期望结果" onChange={(event) => setMessage(event.target.value)} />
          </label>
          <div className="contact-attachments">
            <div className="contact-attachments-head">
              <span>图片附件</span>
              <div>
                <Button value="添加" disabled={busy || attachments.length >= 3} onClick={() => void chooseAttachments()} />
                <Button value="清空" disabled={busy || attachments.length === 0} onClick={() => setAttachments([])} />
              </div>
            </div>
            {attachments.length > 0 ? (
              <div className="contact-attachment-list">
                {attachments.map((path) => <span key={path}>{fileName(path)}</span>)}
              </div>
            ) : null}
          </div>
          {messageType === '报错反馈' ? (
            <div className="contact-auto-attachments">
              <label>
                <input type="checkbox" checked={autoAttachConfig} onChange={(event) => setAutoAttachConfig(event.target.checked)} />
                上传当前运行配置
              </label>
              <label>
                <input type="checkbox" checked={autoAttachLog} onChange={(event) => setAutoAttachLog(event.target.checked)} />
                上传当前日志
              </label>
            </div>
          ) : null}
        </div>

        <div className="contact-dialog-foot">
          <Button value="取消" onClick={onClose} />
          <Button type="primary" value="打开 issue" onClick={onOpenIssue} />
          <Button type="primary" value={busy ? '发送中...' : '发送'} disabled={busy || !message.trim()} onClick={() => void submit()} />
        </div>
      </section>
    </div>
  )
}

export default ContactDialog
