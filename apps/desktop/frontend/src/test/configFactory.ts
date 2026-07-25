import { createEmptyConfigDocument, normalizeConfigDocument } from '../services/configDocument'
import { createDefaultAppSettings } from '../services/appSettings'
import { QuestionKind } from '../../bindings/surveycontroller/surveycore/internal/model/models'
import type { AppSettings, ConfigDocument, QuestionEntry, QuestionMeta } from '../types'

export function createTestConfig(
  configure?: (config: ConfigDocument) => void,
): ConfigDocument {
  const config = createEmptyConfigDocument()
  configure?.(config)
  return normalizeConfigDocument(config)
}

export function createTestSettings(
  configure?: (settings: AppSettings) => void,
): AppSettings {
  const settings = createDefaultAppSettings()
  configure?.(settings)
  return settings
}

export function createTestQuestion(
  configure?: (question: QuestionMeta) => void,
): QuestionMeta {
  const question: QuestionMeta = {
    num: 1,
    title: '单选题',
    description: '',
    type_code: '3',
    options: 2,
    rows: 0,
    row_texts: [],
    page: 1,
    option_texts: ['A', 'B'],
    provider: 'wjx',
    provider_question_id: 'q1',
    provider_page_id: 'p1',
    provider_type: 'single',
    required: true,
    is_description: false,
    is_location: false,
    is_rating: false,
    rating_max: 0,
    text_inputs: 0,
    text_input_labels: [],
    is_text_like: false,
    is_multi_text: false,
    is_slider_matrix: false,
    logic_parse_status: '',
    has_jump: false,
    has_display_condition: false,
    has_dependent_display_logic: false,
    forced_option_text: '',
    forced_texts: [],
    fillable_options: [],
    has_attached_option_select: false,
    unsupported: false,
    unsupported_reason: '',
  }
  configure?.(question)
  return question
}

export function createTestQuestionEntry(
  configure?: (entry: QuestionEntry) => void,
): QuestionEntry {
  const entry: QuestionEntry = {
    question_type: QuestionKind.QuestionKindSingle,
    probabilities: { options: [50, 50] },
    question_num: 1,
    question_title: '单选题',
    survey_provider: 'wjx',
  }
  configure?.(entry)
  return entry
}
