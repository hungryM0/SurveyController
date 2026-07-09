import { BookOpen, X } from 'lucide-react'
import { Button } from './ui'

export const STARTUP_TUTORIAL_DOC_URL = 'https://surveydoc.hungrym0.com/'
export const STARTUP_TUTORIAL_HINT_DELAY_MS = 1800

export const startupTutorialCopy = {
  title: '第一次用？先看教程',
  content: '教程里有相关设置的详细说明',
  hint: '将使用外部浏览器打开教程页面',
  dismiss: '不再显示',
  open: '打开教程',
}

export function shouldScheduleStartupTutorialHint(loading: boolean, shouldShow?: boolean): boolean {
  return !loading && shouldShow === true
}

interface StartupTutorialHintProps {
  onDismiss: () => void
  onOpen: () => void
}

function StartupTutorialHint({ onDismiss, onOpen }: StartupTutorialHintProps) {
  return (
    <aside className="startup-tutorial-flyout" role="dialog" aria-labelledby="startup-tutorial-title">
      <div className="startup-tutorial-icon" aria-hidden="true">
        <BookOpen size={18} />
      </div>
      <button className="startup-tutorial-close" type="button" aria-label="关闭教程提示" onClick={onDismiss}>
        <X size={15} />
      </button>
      <div className="startup-tutorial-body">
        <h2 id="startup-tutorial-title">{startupTutorialCopy.title}</h2>
        <p>{startupTutorialCopy.content}</p>
        <span>{startupTutorialCopy.hint}</span>
      </div>
      <div className="startup-tutorial-actions">
        <Button value={startupTutorialCopy.dismiss} onClick={onDismiss} />
        <Button type="primary" value={startupTutorialCopy.open} onClick={onOpen} />
      </div>
    </aside>
  )
}

export default StartupTutorialHint
