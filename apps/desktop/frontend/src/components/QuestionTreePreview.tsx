import type { QuestionTreePage } from '../pages/strategyEditor'

interface QuestionTreePreviewProps {
  pages: QuestionTreePage[]
  emptyText?: string
  onNodeSelect?: (index: number) => void
}

function QuestionTreePreview({ pages, emptyText = '没有题目树。', onNodeSelect }: QuestionTreePreviewProps) {
  if (!pages.length) {
    return <div className="strategy-empty-inline">{emptyText}</div>
  }

  return (
    <section className="question-tree-preview">
      {pages.map((page) => (
        <article key={page.page} className="question-tree-page">
          <div className="question-tree-page-head">
            <span>第 {page.page} 页</span>
            <small>{page.nodes.length} 题</small>
          </div>
          <div className="question-tree-node-list">
            {page.nodes.map((node) => (
              <button
                key={`${page.page}-${node.question.num}`}
                type="button"
                className="question-tree-node question-tree-node-button"
                onClick={() => onNodeSelect?.(node.index)}
              >
                <div className="question-tree-node-main">
                  <strong>{node.label}</strong>
                  <span>{node.summary}</span>
                </div>
                {node.relations.length ? (
                  <div className="question-tree-relation-list">
                    {node.relations.map((relation, index) => (
                      <span key={`${node.question.num}-${index}`} className={`question-tree-relation relation-${relation.kind}`}>
                        {relation.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}

export default QuestionTreePreview
