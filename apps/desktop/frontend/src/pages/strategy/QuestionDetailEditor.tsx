import { Button, InputText, SelectNative } from '../../components/ui'
import QuestionLogicPreview from '../../components/QuestionLogicPreview'
import QuestionMediaPreview from '../../components/QuestionMediaPreview'
import type { ConfigDocument, QuestionEntry, QuestionMeta } from '../../types'
import {
  questionLogicDetails,
  questionLogicSummary,
  questionMediaItems,
  questionMediaSummary,
  questionOptionLabels,
  questionTitle,
  questionTypeLabel,
  setQuestionAiEnabled,
  setQuestionCustomWeights,
  setQuestionDimension,
  setQuestionFillableOptions,
  setQuestionPsychoBias,
} from '../strategy-editor'
import { OptionPicker } from './OptionPicker'
import { QuestionResponseFields } from './QuestionResponseFields'
import type { QuestionDraftAction, QuestionDraftState } from './questionDraftReducer'

interface QuestionDetailEditorProps {
  config: ConfigDocument
  question: QuestionMeta | null
  entry?: QuestionEntry
  allQuestions: QuestionMeta[]
  draft: QuestionDraftState
  dispatch: (action: QuestionDraftAction) => void
  onConfigChange: (config: ConfigDocument) => void
}

export function QuestionDetailEditor({
  config,
  question,
  entry,
  allQuestions,
  draft,
  dispatch,
  onConfigChange,
}: QuestionDetailEditorProps) {
  if (!question) return <div className="strategy-empty">没有可编辑的题目。</div>
  const optionLabels = questionOptionLabels(question)

  return (
    <div className="strategy-question-detail">
      <div className="section-heading"><h2>{questionTitle(question)}</h2><span>{questionTypeLabel(question)}</span></div>
      <div className="strategy-question-detail-body">
        <div className="strategy-field"><span>逻辑概览</span><div className="strategy-summary-pill">{questionLogicSummary(question)}</div></div>
        <QuestionLogicPreview title="逻辑明细" summary={questionLogicSummary(question)} details={questionLogicDetails(question, allQuestions)} />
        <div className="strategy-field"><span>媒体概览</span><div className="strategy-summary-pill">{questionMediaSummary(question)}</div></div>
        <QuestionMediaPreview title="媒体预览" items={questionMediaItems(question)} />

        <div className="strategy-field">
          <span>题目维度</span>
          <InputText value={draft.dimension} placeholder="输入维度名称" width="100%" onChange={(event) => dispatch({ type: 'dimension', value: event.target.value })} />
        </div>
        <div className="strategy-action-row">
          <Button type="primary" value="写入维度" onClick={() => onConfigChange(setQuestionDimension(config, question.num, draft.dimension))} />
          <Button value="清空维度" onClick={() => { dispatch({ type: 'dimension', value: '' }); onConfigChange(setQuestionDimension(config, question.num, '')) }} />
        </div>

        <div className="strategy-field">
          <span>倾向预设</span>
          <SelectNative
            data={[
              { label: '自定义', value: 'custom' },
              { label: '偏左', value: 'left' },
              { label: '居中', value: 'center' },
              { label: '偏右', value: 'right' },
            ]}
            value={entry?.psycho_bias ?? 'custom'}
            onChange={(event) => onConfigChange(setQuestionPsychoBias(config, question.num, event.target.value))}
          />
        </div>

        {isFillableOptionQuestion(question) ? (
          <>
            <OptionPicker title="可填选项" items={optionLabels} selected={draft.fillableOptions} onChange={(value) => dispatch({ type: 'fillableOptions', value })} />
            <div className="strategy-action-row">
              <Button value="保存可填选项" onClick={() => onConfigChange(setQuestionFillableOptions(config, question.num, draft.fillableOptions))} />
            </div>
          </>
        ) : null}

        <div className="strategy-field">
          <span>自定义权重</span>
          <InputText value={draft.customWeights} placeholder="用逗号或空格分隔" width="100%" onChange={(event) => dispatch({ type: 'customWeights', value: event.target.value })} />
          <div className="strategy-action-row"><Button value="保存权重" onClick={() => onConfigChange(setQuestionCustomWeights(config, question.num, draft.customWeights))} /></div>
        </div>

        <div className="strategy-field">
          <span>AI 填空</span>
          <Button
            value={entry?.ai_enabled ? '已启用' : '未启用'}
            type={entry?.ai_enabled ? 'primary' : undefined}
            onClick={() => onConfigChange(setQuestionAiEnabled(config, question.num, !entry?.ai_enabled))}
          />
        </div>

        <QuestionResponseFields
          config={config}
          question={question}
          entry={entry}
          draft={draft}
          dispatch={dispatch}
          onConfigChange={onConfigChange}
        />
      </div>
    </div>
  )
}

function isFillableOptionQuestion(question: QuestionMeta): boolean {
  const type = (question.provider_type || question.type_code).trim().toLowerCase()
  return ['single', 'radio', '3', 'multiple', 'checkbox', '4', 'dropdown', 'select', '7'].includes(type)
}
