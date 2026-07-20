import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RuntimeConfig } from '../types'
import StrategyView from './StrategyView'

describe('StrategyView', () => {
  it('exposes the per-question configuration entry', () => {
    const config: RuntimeConfig = {
      url: 'https://www.wjx.cn/vm/demo.aspx',
      target: 1,
      threads: 1,
      questions_info: [],
    }

    const html = renderToStaticMarkup(<StrategyView config={config} onConfigChange={() => undefined} />)

    expect(html).toContain('条件规则')
    expect(html).toContain('逐题配置')
    expect(html).toContain('维度分组')
  })
})
