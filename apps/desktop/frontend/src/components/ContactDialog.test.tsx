import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ContactDialog from './ContactDialog'

vi.mock('@wailsio/runtime', () => ({
  Dialogs: { OpenFile: vi.fn() },
}))

describe('ContactDialog', () => {
  it('renders status and auto attachment controls for bug reports', () => {
    const html = renderToStaticMarkup(
      <ContactDialog
        open
        onClose={() => undefined}
        onOpenIssue={() => undefined}
        onSubmit={async () => undefined}
        status={{ text: '在线：系统正常', color: '#228B22' }}
        config={{ url: 'https://example.com/s/1' }}
        logLines={['[core] done']}
      />,
    )

    expect(html).toContain('在线：系统正常')
    expect(html).toContain('上传当前运行配置')
    expect(html).toContain('上传当前日志')
  })
})
