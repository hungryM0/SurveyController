import type { QuestionEntry, QuestionMeta } from '../../types'
import {
  fillBoolArray,
  fillRangeArray,
  fillTextArray,
  formatAttachedOptionSelects,
  formatWeightTable,
} from '../strategy-editor'

export interface QuestionDraftState {
  dimension: string
  location: string[]
  optionFill: string
  fillableOptions: number[]
  attachedOptionSelects: string
  multiTextModes: string[]
  multiTextAIFlags: boolean[]
  multiTextRanges: string[]
  customWeights: string
}

export type QuestionDraftAction =
  | { type: 'reset'; question: QuestionMeta | null; entry?: QuestionEntry }
  | { type: 'dimension'; value: string }
  | { type: 'location'; index: number; value: string }
  | { type: 'optionFill'; value: string }
  | { type: 'fillableOptions'; value: number[] }
  | { type: 'attachedOptionSelects'; value: string }
  | { type: 'multiTextMode'; index: number; value: string }
  | { type: 'multiTextAI'; index: number; value: boolean }
  | { type: 'multiTextRange'; index: number; value: string }
  | { type: 'customWeights'; value: string }

export const emptyQuestionDraft: QuestionDraftState = {
  dimension: '',
  location: ['', '', ''],
  optionFill: '',
  fillableOptions: [],
  attachedOptionSelects: '',
  multiTextModes: [],
  multiTextAIFlags: [],
  multiTextRanges: [],
  customWeights: '',
}

export function questionDraftReducer(state: QuestionDraftState, action: QuestionDraftAction): QuestionDraftState {
  if (action.type === 'reset') return createQuestionDraft(action.question, action.entry)
  if (action.type === 'dimension') return { ...state, dimension: action.value }
  if (action.type === 'location') return { ...state, location: replaceAt(state.location, action.index, action.value) }
  if (action.type === 'optionFill') return { ...state, optionFill: action.value }
  if (action.type === 'fillableOptions') return { ...state, fillableOptions: [...action.value] }
  if (action.type === 'attachedOptionSelects') return { ...state, attachedOptionSelects: action.value }
  if (action.type === 'multiTextMode') return { ...state, multiTextModes: replaceAt(state.multiTextModes, action.index, action.value) }
  if (action.type === 'multiTextAI') return { ...state, multiTextAIFlags: replaceAt(state.multiTextAIFlags, action.index, action.value) }
  if (action.type === 'multiTextRange') return { ...state, multiTextRanges: replaceAt(state.multiTextRanges, action.index, action.value) }
  if (action.type === 'customWeights') return { ...state, customWeights: action.value }
  return state
}

function createQuestionDraft(question: QuestionMeta | null, entry?: QuestionEntry): QuestionDraftState {
  const blankCount = Math.max(
    1,
    question?.text_inputs ?? 0,
    entry?.multi_text_blank_modes?.length ?? 0,
    entry?.multi_text_blank_ai_flags?.length ?? 0,
    entry?.multi_text_blank_int_ranges?.length ?? 0,
  )
  return {
    dimension: entry?.dimension ?? '',
    location: [entry?.location_parts?.[0] ?? '', entry?.location_parts?.[1] ?? '', entry?.location_parts?.[2] ?? ''],
    optionFill: (entry?.option_fill_texts ?? []).map((item) => item ?? '').join(' | '),
    fillableOptions: [...(entry?.fillable_option_indices ?? question?.fillable_options ?? [])],
    attachedOptionSelects: formatAttachedOptionSelects(entry?.attached_option_selects ?? question?.attached_option_selects),
    multiTextModes: fillTextArray(entry?.multi_text_blank_modes, blankCount),
    multiTextAIFlags: fillBoolArray(entry?.multi_text_blank_ai_flags, blankCount),
    multiTextRanges: fillRangeArray(entry?.multi_text_blank_int_ranges, blankCount),
    customWeights: formatWeightTable(entry?.custom_weights),
  }
}

function replaceAt<T>(values: T[], index: number, value: T): T[] {
  const next = [...values]
  next[index] = value
  return next
}
