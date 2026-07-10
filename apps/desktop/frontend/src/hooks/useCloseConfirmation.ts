import { useCallback, useRef, useState } from 'react'

interface CloseConfirmationActions {
  shouldAsk: () => boolean
  save: () => Promise<void>
  confirm: () => Promise<void>
  close: () => Promise<void>
  onError: (error: Error) => void
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function useCloseConfirmation(actions: CloseConfirmationActions) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const actionsRef = useRef(actions)
  const openRef = useRef(false)
  const busyRef = useRef(false)
  actionsRef.current = actions

  const finishClose = useCallback(async () => {
    if (busyRef.current) {
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      await actionsRef.current.confirm()
      await actionsRef.current.close()
    } catch (error) {
      busyRef.current = false
      setBusy(false)
      actionsRef.current.onError(toError(error))
    }
  }, [])

  const requestClose = useCallback(() => {
    if (openRef.current || busyRef.current) {
      return
    }
    if (actionsRef.current.shouldAsk()) {
      openRef.current = true
      setOpen(true)
      return
    }
    void finishClose()
  }, [finishClose])

  const cancelClose = useCallback(() => {
    if (busyRef.current) {
      return
    }
    openRef.current = false
    setOpen(false)
  }, [])

  const closeWithoutSaving = useCallback(async () => {
    cancelClose()
    await finishClose()
  }, [cancelClose, finishClose])

  const saveAndClose = useCallback(async () => {
    if (busyRef.current) {
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      await actionsRef.current.save()
      openRef.current = false
      setOpen(false)
      await actionsRef.current.confirm()
      await actionsRef.current.close()
    } catch (error) {
      busyRef.current = false
      setBusy(false)
      actionsRef.current.onError(toError(error))
    }
  }, [])

  return {
    open,
    busy,
    requestClose,
    cancelClose,
    closeWithoutSaving,
    saveAndClose,
  }
}
