import { useCallback, useEffect, useRef, useState } from 'react'
import {
  WIZARD_STEPS,
  cloneWizardDraft,
  mergeParsedConfig,
  updateWizardConfig,
  updateWizardURL,
  type WizardStepId,
} from './configWizardModel'
import type { WizardFrameProps } from './WizardFrame'
import type { ConfigurationWizardProps } from './wizardTypes'
import { isRealSurveyConfig, validateSurveyURL, validateWizardStep } from './wizardValidation'
import { wizardErrorMessage, wizardNextStep, wizardStepIndex } from './wizardHelpers'
import { fingerprintConfig, isNetworkReady } from '../../viewModels/taskWorkflow'
import { clearWizardDraftStorage } from './useConfigurationWizard'

export function useWizardFlow({
  open,
  initialDraft,
  onDismiss,
  onParseSurvey,
  onDecodeQRCode,
  onDecodeQRCodeImage,
  onImportConfig,
  onChooseReverseFill,
  onSave,
  onComplete,
  onDraftChange,
  onStepChange,
  onCheckTask,
  checkState: externalCheckState,
  proxyStatus,
  onProxyStatusChange,
  runTaskState,
  runLogs,
  runError,
  runResult,
  onStartRun,
  onPauseRun,
  onResumeRun,
  onStopRun,
  onExportResult,
  resumeConfigured = false,
}: ConfigurationWizardProps) {
  const initialProgress = resolveOpeningProgress(initialDraft, resumeConfigured, runTaskState)
  const [draft, setDraft] = useState(() => cloneWizardDraft(initialDraft))
  const [step, setStep] = useState<WizardStepId>(initialProgress.step)
  const [parsed, setParsed] = useState(() => isRealSurveyConfig(initialDraft.config))
  const [highestStepIndex, setHighestStepIndex] = useState(initialProgress.highestStepIndex)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [draftTouched, setDraftTouched] = useState(false)
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const [checkState, setCheckState] = useState(externalCheckState ?? null)
  const wasOpen = useRef(open)
  const pendingDismissAction = useRef<(() => void) | null>(null)
  const latestDraftPersistence = useRef<Promise<void> | null>(null)
  const mounted = useRef(true)

  useEffect(() => () => {
    mounted.current = false
  }, [])

  useEffect(() => {
    if (open && !wasOpen.current) {
      const progress = resolveOpeningProgress(initialDraft, resumeConfigured, runTaskState)
      setDraft(cloneWizardDraft(initialDraft))
      setStep(progress.step)
      setParsed(isRealSurveyConfig(initialDraft.config))
      setHighestStepIndex(progress.highestStepIndex)
      setBusy(false)
      setError('')
      setStatusMessage('')
      setDraftTouched(false)
      setConfirmDismiss(false)
      setCheckState(externalCheckState ?? null)
      pendingDismissAction.current = null
    }
    wasOpen.current = open
  }, [externalCheckState, initialDraft, open, resumeConfigured, runTaskState])

  const stepIndex = wizardStepIndex(step)
  function notifyDraftChange(nextDraft: typeof draft) {
    const result = onDraftChange?.(cloneWizardDraft(nextDraft))
    latestDraftPersistence.current = result ? Promise.resolve(result) : null
  }

  function updateDraft(next: typeof draft) {
    const cloned = cloneWizardDraft(next)
    setDraft(cloned)
    setDraftTouched(true)
    setConfirmDismiss(false)
    setError('')
    setCheckState(null)
    setHighestStepIndex(reachableStepIndex(cloned, parsed))
    notifyDraftChange(cloned)
  }

  function updateURL(value: string) {
    if (value !== draft.config.survey.url) {
      setParsed(false)
      setStatusMessage(value.trim() ? '链接已修改，需要重新解析。' : '')
      setDraftTouched(true)
      setConfirmDismiss(false)
    }
    const nextDraft = updateWizardURL(draft, value)
    setDraft(nextDraft)
    setHighestStepIndex(0)
    setCheckState(null)
    setError('')
    notifyDraftChange(nextDraft)
  }

  async function runAction(action: () => void | Promise<void>) {
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
    const validation = validateSurveyURL(draft.config.survey.url)
    if (!validation.valid) {
      setError(validation.message ?? '问卷链接无效。')
      return
    }

    await runAction(async () => {
      const url = draft.config.survey.url.trim()
      const parsedConfig = await onParseSurvey(url)
      if (!isRealSurveyConfig(parsedConfig)) {
        throw new Error('解析结果没有有效问卷链接或真实可作答题目。')
      }
      const next = mergeParsedConfig(draft, parsedConfig, url)
      setDraft(next)
      setDraftTouched(true)
      setParsed(true)
      setCheckState(null)
      setStatusMessage('问卷解析完成。')
      notifyDraftChange(next)
      moveToStep(wizardNextStep('survey'), true, next)
    })
  }

  async function decodeQRCode() {
    await runAction(async () => {
      await applyQRCodeResult(await onDecodeQRCode())
    })
  }

  async function decodeQRCodeImage(file: File) {
    if (!onDecodeQRCodeImage) return
    await runAction(async () => {
      await applyQRCodeResult(await onDecodeQRCodeImage(file))
    })
  }

  async function applyQRCodeResult(result: Awaited<ReturnType<typeof onDecodeQRCode>>) {
    const text = typeof result === 'string' ? result : result?.text
    if (!text) return
    const url = text.trim()
    const recognized = updateWizardURL(draft, url)
    const validation = validateSurveyURL(recognized.config.survey.url)
    if (!validation.valid) {
      throw new Error(validation.message ?? '二维码中没有有效的问卷链接。')
    }
    setParsed(false)
    const parsedConfig = await onParseSurvey(url)
    if (!isRealSurveyConfig(parsedConfig)) {
      throw new Error('解析结果没有有效问卷链接或真实可作答题目。')
    }
    const next = mergeParsedConfig(recognized, parsedConfig, url)
    setDraft(next)
    setDraftTouched(true)
    setParsed(true)
    setCheckState(null)
    setStatusMessage('二维码已识别，问卷解析完成。')
    notifyDraftChange(next)
    moveToStep(wizardNextStep('survey'), true, next)
  }

  async function importConfig() {
    await runAction(async () => {
      const result = await onImportConfig()
      const imported = result && 'config' in result ? result.config : result
      if (!imported) {
        return
      }
      if (!isRealSurveyConfig(imported)) {
        throw new Error('导入配置没有有效问卷链接或真实可作答题目。')
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
      notifyDraftChange(next)
      setHighestStepIndex(WIZARD_STEPS.length - 2)
      setStep('review')
      persistWizardStep(next, 'review')
      onStepChange?.('review')
    })
  }

  async function checkAndSave() {
    if (onCheckTask) {
      try {
        const result = await onCheckTask(cloneWizardDraft(draft))
        setCheckState(result)
        if (result.status === 'blocked') return
      } catch (cause) {
        setError(wizardErrorMessage(cause))
        return
      }
    }
    if (!isNetworkReady(draft.config, proxyStatus)) {
      setError('代理状态尚未确认，或代理连接测试失败。请返回网络步骤检查。')
      return
    }
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
      if (onStartRun) {
        moveToStep('run', true)
      } else {
        onDismiss()
      }
    })
  }

  async function startRun() {
    await runAction(async () => { await onStartRun?.() })
  }

  async function handlePrimaryAction() {
    if (step === 'survey') {
      if (parsed) {
        moveToStep(wizardNextStep('survey'))
      } else {
        await parseAndContinue()
      }
      return
    }
    if (step === 'review') {
      await checkAndSave()
      return
    }
    if (step === 'run') {
      await startRun()
      return
    }

    const validation = validateWizardStep(step, draft, parsed)
    if (!validation.valid) {
      setError(validation.message ?? '请检查当前设置。')
      return
    }
    moveToStep(wizardNextStep(step))
  }

  function moveToStep(nextStep: WizardStepId, force = false, draftForPersistence = draft) {
    const nextIndex = wizardStepIndex(nextStep)
    const canResumeRun = nextStep === 'run' && highestStepIndex >= WIZARD_STEPS.length - 1
    if (!force && nextIndex > reachableStepIndex(draft, parsed) && !canResumeRun) return
    setStep(nextStep)
    const maxProgressIndex = nextStep === 'run' ? WIZARD_STEPS.length - 1 : WIZARD_STEPS.length - 2
    setHighestStepIndex((current) => Math.max(current, Math.min(nextIndex, maxProgressIndex)))
    persistWizardStep(draftForPersistence, nextStep)
    setError('')
    void onStepChange?.(nextStep)
  }

  function selectStep(nextStep: WizardStepId) {
    if (nextStep === 'run' && !onStartRun && !runTaskState) return
    moveToStep(nextStep)
  }

  function moveBack() {
    if (stepIndex > 0) {
      moveToStep(WIZARD_STEPS[stepIndex - 1].id)
    }
  }

  const dismissNow = useCallback((force = false) => {
    if (!busy || force) {
      if (confirmDismiss && !force) {
        clearWizardDraftStorage()
      }
      setConfirmDismiss(false)
      const afterDismiss = pendingDismissAction.current
      pendingDismissAction.current = null
      onDismiss()
      afterDismiss?.()
    }
  }, [busy, confirmDismiss, onDismiss])

  const requestDismiss = useCallback((afterDismiss?: () => void) => {
    if (busy) {
      return
    }
    pendingDismissAction.current = afterDismiss ?? null
    if (draftTouched && onDraftChange) {
      const pending = latestDraftPersistence.current
      if (pending) {
        setBusy(true)
        void pending.then(
          () => {
            if (!mounted.current) return
            setBusy(false)
            dismissNow(true)
          },
          (cause) => {
            if (!mounted.current) return
            setBusy(false)
            setError(wizardErrorMessage(cause))
          },
        )
        return
      }
      dismissNow()
      return
    }
    if (draftTouched) {
      setConfirmDismiss(true)
    } else {
      dismissNow()
    }
  }, [busy, dismissNow, draftTouched, onDraftChange])

  const continueEditing = useCallback(() => {
    pendingDismissAction.current = null
    setConfirmDismiss(false)
  }, [])

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
    onDecodeQRCodeImage: onDecodeQRCodeImage ? (file) => void decodeQRCodeImage(file) : undefined,
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
    onStepSelect: selectStep,
    onBack: moveBack,
    onPrimary: () => void handlePrimaryAction(),
    onDismiss: dismissNow,
    onContinueEditing: continueEditing,
    checkState: externalCheckState ?? checkState,
    onReturnToStep: selectStep,
    onProxyStatusChange,
    runTaskState,
    runLogs,
    runError,
    runResult,
    onStartRun: onStartRun ? () => void startRun() : undefined,
    onPauseRun: onPauseRun ? () => void runAction(async () => { await onPauseRun() }) : undefined,
    onResumeRun: onResumeRun ? () => void runAction(async () => { await onResumeRun() }) : undefined,
    onStopRun: onStopRun ? () => void runAction(async () => { await onStopRun() }) : undefined,
    onExportResult: onExportResult ? () => void runAction(async () => { await onExportResult() }) : undefined,
  }

  return { frameProps, requestDismiss }
}

const wizardPositionStorageKey = 'surveycontroller.task-wizard.position'

export function resolveOpeningProgress(
  draft: ConfigurationWizardProps['initialDraft'],
  resumeConfigured: boolean,
  runTaskState: ConfigurationWizardProps['runTaskState'] = null,
) {
  const initial = resolveInitialProgress(draft, resumeConfigured)
  if (!resumeConfigured) return initial

  if (initial.highestStepIndex === WIZARD_STEPS.length - 2 && hasPersistedRun(runTaskState)) {
    return { step: 'run' as const, highestStepIndex: WIZARD_STEPS.length - 1 }
  }

  const persistedStep = readPersistedWizardStep(draft.config.survey.url)
  if (!persistedStep) return initial

  const persistedIndex = wizardStepIndex(persistedStep)
  const lastReachableIndex = initial.highestStepIndex === WIZARD_STEPS.length - 2
    ? WIZARD_STEPS.length - 1
    : initial.highestStepIndex
  return persistedIndex <= lastReachableIndex
    ? {
        ...initial,
        step: persistedStep,
        highestStepIndex: persistedStep === 'run' ? WIZARD_STEPS.length - 1 : initial.highestStepIndex,
      }
    : initial
}

function hasPersistedRun(runTaskState: ConfigurationWizardProps['runTaskState']): boolean {
  return Boolean(runTaskState && runTaskState.status !== 'idle')
}

function resolveInitialProgress(draft: ConfigurationWizardProps['initialDraft'], resumeConfigured: boolean) {
  if (!resumeConfigured) {
    return { step: 'survey' as const, highestStepIndex: 0 }
  }

  const parsed = isRealSurveyConfig(draft.config)
  for (const [index, candidate] of WIZARD_STEPS.slice(0, -1).entries()) {
    const validation = validateWizardStep(candidate.id, draft, parsed)
    if (!validation.valid) {
      return { step: candidate.id, highestStepIndex: index }
    }
  }

  return { step: 'review' as const, highestStepIndex: WIZARD_STEPS.length - 2 }
}

function reachableStepIndex(draft: ConfigurationWizardProps['initialDraft'], parsed: boolean): number {
  let highest = 0
  for (const [index, candidate] of WIZARD_STEPS.slice(0, -1).entries()) {
    if (!validateWizardStep(candidate.id, draft, parsed).valid) break
    highest = index + 1
  }
  return Math.min(highest, WIZARD_STEPS.length - 2)
}

function readPersistedWizardStep(surveyURL: string): WizardStepId | null {
  const normalizedURL = surveyURL.trim()
  if (!normalizedURL || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(wizardPositionStorageKey)
    if (!raw) return null
    const value = JSON.parse(raw) as { surveyURL?: unknown; step?: unknown }
    return value.surveyURL === normalizedURL && isWizardStep(value.step) ? value.step : null
  } catch {
    return null
  }
}

function persistWizardStep(draft: ConfigurationWizardProps['initialDraft'], step: WizardStepId) {
  if (typeof window === 'undefined') return
  const surveyURL = draft.config.survey.url.trim()
  try {
    if (!surveyURL) {
      window.localStorage.removeItem(wizardPositionStorageKey)
      return
    }
    window.localStorage.setItem(wizardPositionStorageKey, JSON.stringify({ surveyURL, step }))
  } catch {
    // Local storage may be unavailable in a restricted WebView.
  }
}

function isWizardStep(value: unknown): value is WizardStepId {
  return typeof value === 'string' && WIZARD_STEPS.some((step) => step.id === value)
}
