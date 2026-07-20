import * as Dialog from '@radix-ui/react-dialog'
import WizardFrame, { type WizardFrameProps } from './WizardFrame'

interface WizardDialogRootProps {
  open: boolean
  frameProps: WizardFrameProps
  onRequestDismiss: () => void
}

function WizardDialogRoot({ open, frameProps, onRequestDismiss }: WizardDialogRootProps) {
  const frame = <WizardFrame {...frameProps} />
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onRequestDismiss()}>
      {typeof document === 'undefined' ? frame : <Dialog.Portal>{frame}</Dialog.Portal>}
    </Dialog.Root>
  )
}

export default WizardDialogRoot
export type { WizardDialogRootProps }
