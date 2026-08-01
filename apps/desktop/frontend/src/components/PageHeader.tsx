import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  actions?: ReactNode
  meta?: ReactNode
}

function PageHeader({ eyebrow, title, actions, meta }: PageHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-copy">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
      </div>
      {meta ? <div className="workspace-header-meta">{meta}</div> : null}
      {actions ? <div className="workspace-header-actions">{actions}</div> : null}
    </header>
  )
}

export default PageHeader
