import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReverseFillRow } from '../types'
import { buildAppModel } from '../services/stateMapper'
import { emptyShellState } from '../services/shellFixture'
import ReverseFillView from './ReverseFillView'

describe('ReverseFillView support data', () => {
  it('maps preview rows into a stable summary', () => {
    const model = buildAppModel(
      emptyShellState,
      {
        configDirectory: '',
        themeMode: 'system',
        showNavigationText: true,
        micaEnabled: true,
        topmost: false,
        notifications: true,
        autosaveLogCount: 5,
      },
      {
        url: 'https://www.wjx.cn/vm/demo.aspx',
        questions_info: [
          {
            num: 1,
            title: '单选',
            description: '',
            type_code: '3',
            options: 1,
            rows: 0,
            row_texts: [],
            option_texts: ['A'],
            provider: 'wjx',
            provider_type: 'single',
            is_description: false,
            is_text_like: false,
            text_inputs: 0,
          },
        ],
      },
    )

    const rows: ReverseFillRow[] = model.shell.reverseFillPlan
    expect(rows).toHaveLength(1)
    expect(rows[0].question).toBe('第 1 题')
  })

  it('renders reverse fill settings on the dedicated page', () => {
    const html = renderToStaticMarkup(
      <ReverseFillView
        reverseFill={[]}
        reverseFillPath="D:/answers.xlsx"
        config={{
          url: 'https://www.wjx.cn/vm/demo.aspx',
          reverse_fill_enabled: true,
          reverse_fill_format: 'auto',
          reverse_fill_start_row: 1,
          reverse_fill_threads: 2,
        }}
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
