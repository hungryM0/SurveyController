import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  meta?: ReactNode
}

function PageHeader({ eyebrow, title, description, actions, meta }: PageHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {meta ? <div className="workspace-header-meta">{meta}</div> : null}
      {actions ? <div className="workspace-header-actions">{actions}</div> : null}
    </header>
  )
}

export default PageHeader
