import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildAppModel, mapAppViewState } from '../viewModels/appModel'
import { createTestConfig, createTestSettings } from '../test/configFactory'
import MoreView from './MoreView'

vi.mock('@wailsio/runtime', () => ({
  Browser: { OpenURL: vi.fn() },
}))

describe('MoreView data mapping', () => {
  it('keeps more-page sections populated', () => {
    const model = buildAppModel(createTestSettings(), createTestConfig(), '', false, '5.0.0')
    const view = mapAppViewState(model, { value: '', operation: 'keep' })

    expect(view.aboutItems.length).toBeGreaterThan(0)
    expect(view.donateItems.length).toBeGreaterThan(0)
  })

  it('renders main about and donate sections without IP usage or bonus modules', () => {
    const html = renderToStaticMarkup(
      <MoreView
        version="5.0.0"
        aboutItems={[{ label: '版本', value: '5.0.0' }]}
        donateItems={[{ label: '微信', value: '赞赏码' }]}
        autoCheckUpdate={false}
      />,
    )

    expect(html).toContain('本项目仅供学习交流使用')
    expect(html).toContain('微信赞赏')
    expect(html).toContain('支付宝')
    expect(html).not.toContain('IP 使用记录')
    expect(html).not.toContain('彩蛋奖励')
    expect(html).not.toContain('React + Radix UI + Wails v3')
    expect(html).toContain('GPL-3.0 License')
    expect(html).toContain('https://github.com/hungryM0.png?size=96')
    expect(html).toContain('Copyright © 2026 HUNGRY_M0')
  })
})
