import { Button, InputText, SelectNative } from '../../components/ui'
import type { ConfigDocument, QuestionEntry, QuestionMeta } from '../../types'
import {
  parseAttachedOptionSelects,
  setQuestionAttachedOptionSelects,
  setQuestionLocationParts,
  setQuestionMultiTextBlankConfig,
  setQuestionOptionFillTexts,
  setQuestionTextRandomIntRange,
  setQuestionTextRandomMode,
} from '../strategy-editor'
import type { QuestionDraftAction, QuestionDraftState } from './questionDraftReducer'

interface QuestionResponseFieldsProps {
  config: ConfigDocument
  question: QuestionMeta
  entry?: QuestionEntry
  draft: QuestionDraftState
  dispatch: (action: QuestionDraftAction) => void
  onConfigChange: (config: ConfigDocument) => void
}

const textModes = [
  { label: '默认答案', value: '' },
  { label: '随机姓名', value: 'name' },
  { label: '随机手机号', value: 'mobile' },
  { label: '随机身份证号', value: 'id_card' },
  { label: '随机整数', value: 'integer' },
]

export function QuestionResponseFields({
  config,
  question,
  entry,
  draft,
  dispatch,
  onConfigChange,
}: QuestionResponseFieldsProps) {
  const textMode = entry?.text_random_mode ?? ''
  const textRange = entry?.text_random_int_range ?? []
  const isMultiText = question.is_multi_text || question.text_inputs > 1

  return (
    <>
      {isMultiText ? (
        <div className="strategy-field">
          <span>多项填空</span>
          <div className="strategy-multi-text-blanks">
            {draft.multiTextModes.map((mode, index) => (
              <div key={`multi-text-blank-${index}`} className="strategy-multi-text-blank-row">
                <strong>填空 {index + 1}</strong>
                <SelectNative data={textModes} value={mode} onChange={(event) => dispatch({ type: 'multiTextMode', index, value: event.target.value })} />
                <label className="strategy-inline-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.multiTextAIFlags[index])}
                    onChange={(event) => dispatch({ type: 'multiTextAI', index, value: event.target.checked })}
                  />
                  <span>AI</span>
                </label>
                <InputText
                  value={draft.multiTextRanges[index] ?? ''}
                  placeholder="最小值 - 最大值"
                  width="100%"
                  onChange={(event) => dispatch({ type: 'multiTextRange', index, value: event.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="strategy-action-row">
            <Button value="保存多项填空" onClick={() => onConfigChange(setQuestionMultiTextBlankConfig(
              config,
              question.num,
              draft.multiTextModes,
              draft.multiTextAIFlags,
              draft.multiTextRanges,
            ))} />
          </div>
        </div>
      ) : null}

      {question.provider_type === 'text' || question.is_text_like || textMode ? (
        <div className="strategy-field">
          <span>随机文本模式</span>
          <SelectNative
            data={textModes}
            value={textMode}
            onChange={(event) => onConfigChange(setQuestionTextRandomMode(config, question.num, event.target.value))}
          />
        </div>
      ) : null}

      {textMode === 'integer' ? (
        <div className="strategy-field">
          <span>随机整数范围</span>
          <InputText
            value={textRange.join(' - ')}
            placeholder="最小值 - 最大值"
            width="100%"
            onChange={(event) => onConfigChange(setQuestionTextRandomIntRange(config, question.num, event.target.value))}
          />
        </div>
      ) : null}

      <div className="strategy-field">
        <span>地区选择</span>
        <div className="strategy-location-grid">
          {draft.location.map((value, index) => (
            <InputText
              key={`location-${index}`}
              value={value}
              placeholder={['省份', '城市', '区县'][index]}
              width="100%"
              onChange={(event) => dispatch({ type: 'location', index, value: event.target.value })}
            />
          ))}
        </div>
        <div className="strategy-action-row">
          <Button value="保存地区" onClick={() => onConfigChange(setQuestionLocationParts(config, question.num, draft.location))} />
        </div>
      </div>

      <div className="strategy-field">
        <span>附加填空</span>
        <InputText
          value={draft.optionFill}
          placeholder="用 | 分隔多个答案"
          width="100%"
          onChange={(event) => dispatch({ type: 'optionFill', value: event.target.value })}
        />
        <div className="strategy-action-row">
          <Button value="保存填空" onClick={() => onConfigChange(setQuestionOptionFillTexts(
            config,
            question.num,
            draft.optionFill.split('|').map((item) => item.trim()),
          ))} />
        </div>
      </div>

      {question.has_attached_option_select || (entry?.attached_option_selects?.length ?? 0) > 0 ? (
        <div className="strategy-field">
          <span>嵌入式下拉</span>
          <InputText
            value={draft.attachedOptionSelects}
            placeholder="JSON 数组，每项包含 option_index、option_text、select_texts"
            width="100%"
            onChange={(event) => dispatch({ type: 'attachedOptionSelects', value: event.target.value })}
          />
          <div className="strategy-action-row">
            <Button value="保存嵌入式下拉" onClick={() => onConfigChange(setQuestionAttachedOptionSelects(
              config,
              question.num,
              parseAttachedOptionSelects(draft.attachedOptionSelects),
            ))} />
          </div>
        </div>
      ) : null}
    </>
  )
}
