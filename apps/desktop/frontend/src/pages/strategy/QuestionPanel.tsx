import { useEffect, useMemo, useReducer, useState } from 'react'
import { Button, InputText } from '../../components/ui'
import QuestionTreePreview from '../../components/QuestionTreePreview'
import type { ConfigDocument } from '../../types'
import {
  buildQuestionSearchHits,
  buildQuestionTreePages,
  findQuestionEntry,
  getEligibleQuestions,
  questionLabel,
  questionLogicSummary,
  questionMediaSummary,
  questionRowLabels,
  questionTypeLabel,
} from '../strategy-editor'
import { QuestionDetailEditor } from './QuestionDetailEditor'
import { emptyQuestionDraft, questionDraftReducer } from './questionDraftReducer'

interface QuestionPanelProps {
  config: ConfigDocument
  onConfigChange: (config: ConfigDocument) => void
}

export function QuestionPanel({ config, onConfigChange }: QuestionPanelProps) {
  const questions = useMemo(() => getEligibleQuestions(config), [config])
  const treePages = useMemo(() => buildQuestionTreePages(config), [config])
  const [view, setView] = useState<'tree' | 'detail'>('tree')
  const [search, setSearch] = useState('')
  const [selectedQuestionNum, setSelectedQuestionNum] = useState(questions[0]?.num ?? 0)
  const selectedQuestion = questions.find((question) => question.num === selectedQuestionNum) ?? questions[0] ?? null
  const selectedEntry = selectedQuestion ? findQuestionEntry(config, selectedQuestion.num) : undefined
  const searchHits = useMemo(() => buildQuestionSearchHits(config, search), [config, search])
  const [draft, dispatch] = useReducer(questionDraftReducer, emptyQuestionDraft)

  useEffect(() => {
    if (!questions.length) {
      setSelectedQuestionNum(0)
      return
    }
    if (!questions.some((question) => question.num === selectedQuestionNum)) {
      setSelectedQuestionNum(questions[0].num)
    }
  }, [questions, selectedQuestionNum])

  useEffect(() => {
    dispatch({ type: 'reset', question: selectedQuestion, entry: selectedEntry })
  }, [selectedEntry, selectedQuestion, selectedQuestionNum])

  function selectQuestion(questionNum: number) {
    if (!questions.some((question) => question.num === questionNum)) return
    setSelectedQuestionNum(questionNum)
    setView('detail')
  }

  return (
    <section className="surface strategy-editor-panel">
      <div className="section-heading"><h2>题目编辑</h2><span>{questions.length}</span></div>
      <div className="strategy-tabs strategy-inline-tabs">
        <Button value="题目树" type={view === 'tree' ? 'primary' : undefined} onClick={() => setView('tree')} />
        <Button value="题目详情" type={view === 'detail' ? 'primary' : undefined} onClick={() => setView('detail')} />
      </div>
      <div className="strategy-search-row">
        <InputText
          value={search}
          placeholder="搜索题干、选项、维度、逻辑"
          width="100%"
          clearButton
          onChange={(event) => setSearch(event.target.value)}
          onClearButtonClick={() => setSearch('')}
        />
      </div>

      {search.trim() ? (
        <div className="question-search-panel">
          {searchHits.slice(0, 8).map((hit) => {
            const question = questions[hit.index]
            return question ? (
              <button key={question.num} type="button" className="question-search-hit" onClick={() => selectQuestion(question.num)}>
                <strong>{hit.title}</strong><span>{hit.detail}</span>
              </button>
            ) : null
          })}
        </div>
      ) : null}

      {view === 'tree' ? (
        <QuestionTreePreview pages={treePages} onNodeSelect={selectQuestion} />
      ) : (
        <div className="strategy-question-editor-grid">
          <div className="strategy-question-list">
            {searchHits.map((hit) => {
              const question = questions[hit.index]
              if (!question) return null
              const entry = findQuestionEntry(config, question.num)
              return (
                <div
                  key={question.num}
                  className={`strategy-question-row ${selectedQuestionNum === question.num ? 'is-active' : ''}`}
                  onClick={() => selectQuestion(question.num)}
                >
                  <div>
                    <strong>{questionLabel(question)}</strong>
                    <span>{hit.detail || questionRowLabels(question).join(' / ') || `${questionTypeLabel(question)} · ${questionMediaSummary(question)}`}</span>
                  </div>
                  <div><span>{entry?.dimension || '未分组'} · {questionLogicSummary(question)}</span></div>
                </div>
              )
            })}
            {!searchHits.length ? <div className="strategy-empty">没有匹配的题目。</div> : null}
          </div>
          <QuestionDetailEditor
            config={config}
            question={selectedQuestion}
            entry={selectedEntry}
            allQuestions={questions}
            draft={draft}
            dispatch={dispatch}
            onConfigChange={onConfigChange}
          />
        </div>
      )}
    </section>
  )
}
