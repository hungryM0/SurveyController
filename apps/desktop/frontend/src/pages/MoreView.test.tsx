import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildAppModel } from '../services/stateMapper'
import { emptyShellState } from '../services/shellFixture'
import MoreView from './MoreView'
import type { AppSettings, RuntimeConfig } from '../types'

vi.mock('@wailsio/runtime', () => ({
  Browser: { OpenURL: vi.fn() },
}))

const settings: AppSettings = {
  configDirectory: 'D:/configs',
  themeMode: 'system',
  showNavigationText: true,
  micaEnabled: true,
  topmost: false,
  notifications: true,
  autosaveLogCount: 5,
}

const config: RuntimeConfig = {
  url: 'https://www.wjx.cn/vm/demo.aspx',
  survey_title: '示例问卷',
  target: 3,
  threads: 2,
}

describe('MoreView data mapping', () => {
  it('keeps more-page sections populated', () => {
    const model = buildAppModel(emptyShellState, settings, config)

    expect(model.shell.aboutItems.length).toBeGreaterThan(0)
    expect(model.shell.donateItems.length).toBeGreaterThan(0)
  })

  it('renders main about and donate sections without IP usage or bonus modules', () => {
    const html = renderToStaticMarkup(
      <MoreView
        version="4.0.6"
        aboutItems={[{ label: '版本', value: '4.0.6' }]}
        donateItems={[{ label: '微信', value: '赞赏码' }]}
        autoCheckUpdate={false}
      />,
    )

    expect(html).toContain('本项目仅供学习交流使用')
    expect(html).toContain('微信赞赏')
    expect(html).toContain('支付宝')
    expect(html).not.toContain('IP 使用记录')
    expect(html).not.toContain('彩蛋奖励')
    expect(html).toContain('GPL-3.0 License')
    expect(html).toContain('Copyright © 2026 HUNGRY_M0')
  })
})
