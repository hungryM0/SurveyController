import * as Dialog from '@radix-ui/react-dialog'
import { Save } from 'lucide-react'
import { Button } from './ui'

interface CloseConfirmationDialogProps {
  open: boolean
  busy?: boolean
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}

export const closeConfirmationCopy = {
  title: '保存当前配置？',
  description: '关闭前可以把本次改动写入配置文件。',
  cancel: '取消',
  discard: '不保存并关闭',
  save: '保存并关闭',
}

function CloseConfirmationDialog({
  open,
  busy = false,
  onCancel,
  onDiscard,
  onSave,
}: CloseConfirmationDialogProps) {
  if (!open) {
    return null
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && !busy && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="close-confirmation-backdrop" />
        <Dialog.Content className="close-confirmation-dialog surface">
          <div className="close-confirmation-icon" aria-hidden="true">
            <Save size={21} strokeWidth={1.8} />
          </div>
          <div className="close-confirmation-content">
            <Dialog.Title>{closeConfirmationCopy.title}</Dialog.Title>
            <Dialog.Description>{closeConfirmationCopy.description}</Dialog.Description>
          </div>
          <div className="close-confirmation-actions">
            <Button value={closeConfirmationCopy.cancel} type="subtle" disabled={busy} onClick={onCancel} />
            <Button value={closeConfirmationCopy.discard} type="danger-outline" disabled={busy} onClick={onDiscard} />
            <Button value={closeConfirmationCopy.save} type="primary" isLoading={busy} onClick={onSave} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default CloseConfirmationDialog
