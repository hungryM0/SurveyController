import { describe, expect, it } from 'vitest'
import type { ReverseFillRow } from '../types'
import { buildAppModel } from '../services/stateMapper'
import { emptyShellState } from '../services/shellFixture'

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
})
