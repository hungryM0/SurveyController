import { useEffect, useRef, useState } from 'react'
import {
  WIZARD_STEPS,
  cloneWizardDraft,
  isParsedConfig,
  mergeParsedConfig,
  updateWizardConfig,
  updateWizardURL,
  type WizardStepId,
} from './configWizardModel'
import type { WizardFrameProps } from './WizardFrame'
import type { ConfigurationWizardProps } from './wizardTypes'
import { validateWizardStep } from './wizardValidation'
import { wizardErrorMessage, wizardStepIndex } from './wizardHelpers'

export function useWizardFlow({
  open,
  initialDraft,
  onDismiss,
  onParseSurvey,
  onDecodeQRCode,
  onImportConfig,
  onChooseReverseFill,
  onSave,
  onComplete,
}: ConfigurationWizardProps) {
  const [draft, setDraft] = useState(() => cloneWizardDraft(initialDraft))
  const [step, setStep] = useState<WizardStepId>('survey')
  const [parsed, setParsed] = useState(() => isParsedConfig(initialDraft))
  const [highestStepIndex, setHighestStepIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [draftTouched, setDraftTouched] = useState(false)
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const wasOpen = useRef(open)

  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(cloneWizardDraft(initialDraft))
      setStep('survey')
      setParsed(isParsedConfig(initialDraft))
      setHighestStepIndex(0)
      setBusy(false)
      setError('')
      setStatusMessage('')
      setDraftTouched(false)
      setConfirmDismiss(false)
    }
    wasOpen.current = open
  }, [initialDraft, open])

  const stepIndex = wizardStepIndex(step)

  function updateDraft(next: typeof draft) {
    setDraft(cloneWizardDraft(next))
    setDraftTouched(true)
    setConfirmDismiss(false)
    setError('')
  }

  function updateURL(value: string) {
    if (value !== draft.config.survey.url) {
      setParsed(false)
      setStatusMessage(value.trim() ? '链接已修改，需要重新解析。' : '')
      setDraftTouched(true)
      setConfirmDismiss(false)
    }
    setDraft(updateWizardURL(draft, value))
    setError('')
  }

  async function runAction(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(wizardErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function parseAndContinue() {
    const validation = validateWizardStep('survey', draft, true)
    if (!validation.valid) {
      setError(validation.message ?? '问卷链接无效。')
      return
    }

    await runAction(async () => {
      const url = draft.config.survey.url.trim()
      const next = mergeParsedConfig(draft, await onParseSurvey(url), url)
      setDraft(next)
      setDraftTouched(true)
      setParsed(true)
      setStatusMessage('问卷解析完成。')
      moveToStep('task')
    })
  }

  async function decodeQRCode() {
    await runAction(async () => {
      const result = await onDecodeQRCode()
      const text = typeof result === 'string' ? result : result?.text
      if (!text) {
        return
      }
      const url = text.trim()
      const recognized = updateWizardURL(draft, url)
      const validation = validateWizardStep('survey', recognized, true)
      if (!validation.valid) {
        throw new Error(validation.message ?? '二维码中没有有效的问卷链接。')
      }
      const next = mergeParsedConfig(recognized, await onParseSurvey(url), url)
      setDraft(next)
      setDraftTouched(true)
      setParsed(true)
      setStatusMessage('二维码已识别，问卷解析完成。')
      moveToStep('task')
    })
  }

  async function importConfig() {
    await runAction(async () => {
      const result = await onImportConfig()
      const imported = result && 'config' in result ? result.config : result
      if (!imported) {
        return
      }
      const next = updateWizardConfig(draft, imported)
      const validation = validateWizardStep('review', next, true)
      if (!validation.valid) {
        throw new Error(validation.message ?? '导入的配置不完整。')
      }
      setDraft(next)
      setDraftTouched(true)
      setParsed(true)
      setStatusMessage('配置已导入。')
      setHighestStepIndex(WIZARD_STEPS.length - 1)
      setStep('review')
    })
  }

  async function saveAndComplete() {
    const validation = validateWizardStep('review', draft, parsed)
    if (!validation.valid) {
      setError(validation.message ?? '配置不完整。')
      return
    }

    await runAction(async () => {
      const result = await onSave(cloneWizardDraft(draft))
      if (result === null) {
        return
      }
      const savedDraft = result ?? draft
      await onComplete?.(cloneWizardDraft(savedDraft))
      onDismiss()
    })
  }

  async function handlePrimaryAction() {
    if (step === 'survey') {
      if (parsed) {
        moveToStep('task')
      } else {
        await parseAndContinue()
      }
      return
    }
    if (step === 'review') {
      await saveAndComplete()
      return
    }

    const validation = validateWizardStep(step, draft, parsed)
    if (!validation.valid) {
      setError(validation.message ?? '请检查当前设置。')
      return
    }
    moveToStep(WIZARD_STEPS[stepIndex + 1]?.id ?? 'review')
  }

  function moveToStep(nextStep: WizardStepId) {
    const nextIndex = wizardStepIndex(nextStep)
    setStep(nextStep)
    setHighestStepIndex((current) => Math.max(current, nextIndex))
    setError('')
  }

  function moveBack() {
    if (stepIndex > 0) {
      moveToStep(WIZARD_STEPS[stepIndex - 1].id)
    }
  }

  function dismissNow() {
    if (!busy) {
      setConfirmDismiss(false)
      onDismiss()
    }
  }

  function requestDismiss() {
    if (busy) {
      return
    }
    if (draftTouched) {
      setConfirmDismiss(true)
    } else {
      dismissNow()
    }
  }

  const frameProps: WizardFrameProps = {
    draft,
    step,
    parsed,
    highestStepIndex,
    busy,
    error,
    statusMessage,
    confirmDismiss,
    onURLChange: updateURL,
    onDecodeQRCode: () => void decodeQRCode(),
    onImport: () => void importConfig(),
    onChooseReverseFill: onChooseReverseFill ? async () => {
      try {
        return await onChooseReverseFill()
      } catch (cause) {
        setError(wizardErrorMessage(cause))
        return null
      }
    } : undefined,
    onChange: updateDraft,
    onStepSelect: moveToStep,
    onBack: moveBack,
    onPrimary: () => void handlePrimaryAction(),
    onDismiss: dismissNow,
    onContinueEditing: () => setConfirmDismiss(false),
  }

  return { frameProps, requestDismiss }
}
