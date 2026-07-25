import type { ConfigDocument, ReverseFillPreview, ReverseFillRow } from '../types'

export function mapReverseFillRows(
  config: ConfigDocument,
  preview: ReverseFillPreview | null,
): ReverseFillRow[] {
  const columns = preview?.question_columns
  const questions = config.survey.definition.questions ?? []
  return questions.map((question) => {
    const key = `${question.num}` as `${number}`
    const matched = columns?.[key] ?? []
    return {
      question: `第 ${question.num} 题`,
      column: matched.map((item) => item.header).join(', ') || '-',
      state: matched.length ? `已匹配 ${preview?.total_data_rows ?? 0} 行` : '未匹配',
    }
  })
}
