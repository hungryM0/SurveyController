import { Bell, Eye, FolderOpen, Palette, RotateCcw, Save, Settings2, Sliders } from 'lucide-react'
import { Button } from '../components/ui'
import SettingField from '../components/SettingField'
import type { PageMetric, ReverseFillRow, SettingsGroup } from '../types'

interface InfoViewProps {
  title: string
  items?: string[]
  metrics?: PageMetric[]
  reverseFill?: ReverseFillRow[]
  settings?: SettingsGroup[]
  reverseFillPath?: string
  busy?: boolean
  onSettingChange?: (id: string, value: string | boolean) => void
  onChooseReverseFill?: () => void
  onPreviewReverseFill?: () => void
  onSaveSettings?: () => void
  onChooseConfigDirectory?: () => void
  onResetSettings?: () => void
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  '外观设置': <Palette size={16} />,
  '行为设置': <Sliders size={16} />,
  '通知': <Bell size={16} />,
}

function getGroupIcon(title: string): React.ReactNode {
  return GROUP_ICONS[title] ?? <Settings2 size={16} />
}

function InfoView({
  title,
  items,
  metrics,
  reverseFill,
  settings,
  reverseFillPath,
  busy = false,
  onSettingChange,
  onChooseReverseFill,
  onPreviewReverseFill,
  onSaveSettings,
  onChooseConfigDirectory,
  onResetSettings,
}: InfoViewProps) {
  return (
    <section className="page scroll-page">
      <div className="content-stack">
        <section className="surface settings-hero-card">
          <div className="section-heading">
            <h2>{title}</h2>
          </div>

          {items?.length ? (
            <div className="info-list">
              {items.map((item) => <span key={item}>{item}</span>)}
            </div>
          ) : null}

          {metrics?.length ? (
            <div className="metric-grid">
              {metrics.map((metric) => (
                <div key={metric.label} className="metric-tile">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {reverseFill !== undefined ? (
          <section className="surface info-panel">
            <div className="section-heading">
              <h2>反填配置</h2>
            </div>
            <div className="toolbar-row">
              <Button value="选择 Excel" icon={<FolderOpen size={15} />} onClick={onChooseReverseFill} />
              <Button value="预览反填" icon={<Eye size={15} />} disabled={busy || !reverseFillPath} onClick={onPreviewReverseFill} />
              <span>{reverseFillPath || '未选择文件'}</span>
            </div>
            {reverseFill?.length ? (
              <div className="reverse-list">
                {reverseFill.map((row) => (
                  <div key={`${row.question}-${row.column}`}>
                    <span>{row.question}</span>
                    <small>{row.column}</small>
                    <strong>{row.state}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {settings?.map((group) => (
          <section className="surface settings-panel" key={group.title}>
            <div className="section-heading">
              {getGroupIcon(group.title)}
              <h2>{group.title}</h2>
            </div>
            {group.title === '行为设置' ? (
              <div className="toolbar-row settings-toolbar">
                {onChooseConfigDirectory ? (
                  <Button value="选择目录" icon={<FolderOpen size={15} />} disabled={busy} onClick={onChooseConfigDirectory} />
                ) : null}
                {onResetSettings ? (
                  <Button value="恢复默认" icon={<RotateCcw size={15} />} disabled={busy} onClick={onResetSettings} />
                ) : null}
              </div>
            ) : null}
            {group.fields.map((field) => (
              <SettingField
                key={field.id}
                field={field}
                onChange={(id, value) => onSettingChange?.(id, value)}
              />
            ))}
          </section>
        ))}

        {settings?.length ? (
          <div className="settings-footer-actions">
            <Button type="primary" value="保存设置" icon={<Save size={15} />} disabled={busy} onClick={onSaveSettings} />
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default InfoView
