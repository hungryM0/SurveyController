import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createTestConfig } from '../test/configFactory'
import StrategyView from './StrategyView'

describe('StrategyView', () => {
  it('exposes the three focused strategy editors', () => {
    const html = renderToStaticMarkup(
      <StrategyView config={createTestConfig()} onConfigChange={() => undefined} />,
    )

    expect(html).toContain('条件规则')
    expect(html).toContain('逐题配置')
    expect(html).toContain('维度分组')
  })
})
