import type { QuestionMediaItem } from '../types'

interface QuestionMediaPreviewProps {
  title: string
  items: QuestionMediaItem[]
  emptyText?: string
}

function QuestionMediaPreview({ title, items, emptyText = '没有媒体素材。' }: QuestionMediaPreviewProps) {
  return (
    <section className="question-preview-card">
      <div className="question-preview-head">
        <div>
          <span>{title}</span>
          <small>{items.length ? `${items.length} 项` : '空'}</small>
        </div>
      </div>

      {items.length ? (
        <div className="question-media-strip">
          {items.map((item, index) => (
            <figure key={`${item.scope || 'media'}-${item.index ?? 'x'}-${item.source_url || index}`} className="question-media-card">
              <div className="question-media-thumb">
                {item.source_url ? (
                  <img src={item.source_url} alt={item.label || '媒体预览'} loading="lazy" />
                ) : (
                  <span>图片</span>
                )}
              </div>
              <figcaption className="question-media-caption">
                <strong>{item.label || '未命名媒体'}</strong>
                <span>{describeMediaScope(item.scope, item.index)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="strategy-empty-inline">{emptyText}</div>
      )}
    </section>
  )
}

function describeMediaScope(scope?: string, index?: number | null): string {
  const parts: string[] = []
  const text = String(scope || '').trim()
  if (text) {
    parts.push(text)
  }
  if (index !== undefined && index !== null) {
    parts.push(`#${index + 1}`)
  }
  return parts.length ? parts.join(' · ') : '媒体'
}

export default QuestionMediaPreview
