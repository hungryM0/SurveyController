import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestConfig, createTestQuestion } from '../test/configFactory'
import { mapReverseFillRows } from '../viewModels/reverseFill'
import ReverseFillView from './ReverseFillView'

describe('ReverseFillView support data', () => {
  it('maps preview rows into a stable summary', () => {
    const config = createTestConfig((value) => {
      value.survey.definition.questions = [createTestQuestion()]
    })
    const rows = mapReverseFillRows(config, null)

    expect(rows).toHaveLength(1)
    expect(rows[0].question).toBe('第 1 题')
  })

  it('renders reverse fill settings on the dedicated page', () => {
    const config = createTestConfig((value) => {
      value.survey.url = 'https://www.wjx.cn/vm/demo.aspx'
      value.reverseFill.enabled = true
      value.reverseFill.format = 'auto'
      value.reverseFill.startRow = 1
      value.reverseFill.threads = 2
    })
    const html = renderToStaticMarkup(
      <ReverseFillView
        reverseFill={[]}
        reverseFillPath="D:/answers.xlsx"
        config={config}
        onChooseReverseFill={() => undefined}
        onPreviewReverseFill={() => undefined}
      />,
    )

    expect(html).toContain('反填参数')
    expect(html).toContain('启用反填')
    expect(html).toContain('反填格式')
    expect(html).toContain('反填并发')
  })
})
