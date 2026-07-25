import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  useState,
} from 'react'
import { FileSearch, QrCode, Save, Settings, Upload } from 'lucide-react'
import { Button, InputText } from '../../components/ui'
import { firstSupportedQRImageFile, isSupportedQRImage } from './qrImage'
import type { DashboardViewProps } from './types'

type SurveyEntryCardProps = Pick<
  DashboardViewProps,
  | 'dashboard'
  | 'busy'
  | 'onUpdateUrl'
  | 'onAutoConfig'
  | 'onLoadQRCode'
  | 'onDecodeQRCodeImage'
  | 'onLoadConfig'
  | 'onSaveConfig'
  | 'onOpenSetupWizard'
>

function SurveyEntryCard({
  dashboard,
  busy = false,
  onUpdateUrl,
  onAutoConfig,
  onLoadQRCode,
  onDecodeQRCodeImage,
  onLoadConfig,
  onSaveConfig,
  onOpenSetupWizard,
}: SurveyEntryCardProps) {
  const [qrDropActive, setQrDropActive] = useState(false)
  const hasSurveyConfig = Boolean(dashboard.surveyUrl.trim())
  const platformBadge = resolvePlatformBadge(dashboard.platformLabel)

  function handleQRImageFile(file?: File | null) {
    if (!file || busy || !isSupportedQRImage(file)) {
      return
    }
    onDecodeQRCodeImage(file)
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    const file = firstSupportedQRImageFile(event.clipboardData?.files)
    if (!file) {
      return
    }
    event.preventDefault()
    handleQRImageFile(file)
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!firstSupportedQRImageFile(event.dataTransfer?.files)) {
      return
    }
    event.preventDefault()
    setQrDropActive(true)
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    const file = firstSupportedQRImageFile(event.dataTransfer?.files)
    if (!file) {
      setQrDropActive(false)
      return
    }
    event.preventDefault()
    setQrDropActive(false)
    handleQRImageFile(file)
  }

  return (
    <section
      className={`surface dashboard-command ${qrDropActive ? 'qr-drop-active' : ''}`}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={() => setQrDropActive(false)}
      onDrop={handleDrop}
    >
      <div className="command-scan-area">
        <Button value="扫码" icon={<QrCode size={15} />} disabled={busy} onClick={onLoadQRCode} />
        <Button
          value="解析问卷"
          icon={<FileSearch size={15} />}
          disabled={busy || !dashboard.surveyUrl}
          isLoading={busy}
          onClick={onAutoConfig}
        />
      </div>

      <div className="command-main">
        <div className="command-url-area">
          <div className="url-input-wrapper">
            <InputText
              value={dashboard.surveyUrl}
              placeholder="粘贴问卷链接"
              clearButton
              width="100%"
              onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdateUrl(event.target.value)}
              onClearButtonClick={() => onUpdateUrl('')}
            />
          </div>
        </div>
        {hasSurveyConfig ? (
          <div className="command-meta command-platform-badges">
            <span className={`badge ${platformBadge.className}`}>{platformBadge.label}</span>
          </div>
        ) : null}
      </div>

      <div className="command-actions">
        {onOpenSetupWizard ? (
          <Button
            value={hasSurveyConfig ? '重新配置' : '配置问卷'}
            type="primary"
            icon={<Settings size={15} />}
            disabled={busy}
            onClick={onOpenSetupWizard}
          />
        ) : null}
        <Button value="导入配置" icon={<Upload size={15} />} disabled={busy} onClick={onLoadConfig} />
        <Button value="保存配置" icon={<Save size={15} />} disabled={busy} onClick={onSaveConfig} />
      </div>
    </section>
  )
}

function resolvePlatformBadge(platformLabel: string): { label: string, className: string } {
  const normalized = platformLabel.trim()
  if (normalized.includes('腾讯')) {
    return { label: '腾讯问卷', className: 'tencent' }
  }
  if (normalized.toLowerCase().includes('credamo') || normalized.includes('见数')) {
    return { label: '见数', className: 'credamo' }
  }
  return { label: '问卷星', className: 'wjx' }
}

export default SurveyEntryCard
