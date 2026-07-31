import { Events, Window } from '@wailsio/runtime'
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import { confirmClose } from '../services/shell'
import { shouldAskSaveOnClose } from '../services/desktopSettings'
import type { AppSettings } from '../types'
import { waitForWindowExit } from '../motion'
import { useCloseConfirmation } from './useCloseConfirmation'

interface WindowLifecycleOptions {
  settingsRef: MutableRefObject<AppSettings | null>
  saveConfig: () => Promise<void>
  saveSettings: () => Promise<AppSettings>
  setError: (message: string) => void
  guardClose?: (continueClose: () => void) => void
}

export function useWindowLifecycle({ settingsRef, saveConfig, saveSettings, setError, guardClose }: WindowLifecycleOptions) {
  const closing = useRef(false)
  const closeWindow = useCallback(async () => {
    if (closing.current) return
    closing.current = true
    document.documentElement.classList.add('window-closing')
    try {
      await waitForWindowExit()
      await Window.Close()
    } catch (cause) {
      closing.current = false
      document.documentElement.classList.remove('window-closing')
      throw cause
    }
  }, [])

  const saveAll = useCallback(async () => {
    await saveConfig()
    await saveSettings()
  }, [saveConfig, saveSettings])

  const confirmation = useCloseConfirmation({
    shouldAsk: () => shouldAskSaveOnClose(settingsRef.current),
    save: saveAll,
    confirm: confirmClose,
    close: closeWindow,
    onError: (error) => setError(error.message),
  })

  const guardCloseRef = useRef(guardClose)
  guardCloseRef.current = guardClose
  const requestClose = useCallback(() => {
    const guard = guardCloseRef.current
    if (guard) {
      guard(confirmation.requestClose)
      return
    }
    confirmation.requestClose()
  }, [confirmation.requestClose])

  useEffect(
    () => Events.On('surveycontroller:close-requested', requestClose),
    [requestClose],
  )

  return { ...confirmation, requestClose }
}
