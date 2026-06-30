import type { ReactNode } from 'react'

interface QuestionLogicPreviewProps {
  title: string
  summary: string
  details: string[]
  emptyText?: string
}

function QuestionLogicPreview({ title, summary, details, emptyText = '没有逻辑明细。' }: QuestionLogicPreviewProps) {
  return (
    <section className="question-preview-card">
      <div className="question-preview-head">
        <div>
          <span>{title}</span>
          <small>{summary}</small>
        </div>
      </div>

      {details.length ? (
        <ul className="question-logic-list">
          {details.map((item, index) => (
            <li key={`${title}-${index}`} className="question-logic-item">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <div className="strategy-empty-inline">{emptyText}</div>
      )}
    </section>
  )
}

export default QuestionLogicPreview
