import {
  CancelRun,
  CreateSurveyDocument,
  DecodeQRCode,
  ExportLogLines,
  GetAppSettings,
  GetProxyAreaOptions,
  GetProxyStatus,
  GetRunTaskState,
  LoadConfig,
  PauseRun,
  PreviewReverseFill,
  RedeemProxyCard,
  ResetAppSettings,
  ResumeRun,
  SaveAppSettings,
  SaveConfig,
  StartRun,
  SyncProxyStatus,
  TestAIConnection,
  TestCustomProxyAPI,
} from '../../bindings/github.com/hungrym0/SurveyController/apps/desktop/appservice'
import { ConfirmClose } from '../../bindings/github.com/hungrym0/SurveyController/apps/desktop/windowservice'
import { AICredentialOperation } from '../../bindings/github.com/hungrym0/SurveyController/apps/desktop/models'
import type {
  AICredentialDraft,
  AIConnectionTestState,
  AIProfileSettings,
  AppSettings,
  ConfigDocument,
  CustomProxyAPITestState,
  ProxyAreaOptionsState,
  ProxyRedeemState,
  ProxyStatus,
  QRCodeDecodeState,
  ReverseFillPreview,
  RunTaskState,
} from '../types'
import { createEmptyConfigDocument, normalizeConfigDocument } from './configDocument'
import { createDefaultAppSettings } from './appSettings'

export interface AppBootstrap {
  settings: AppSettings
  config: ConfigDocument
  configPath: string
  configExists: boolean
}

export async function loadAppBootstrap(): Promise<AppBootstrap> {
  try {
    const [settings, loaded] = await Promise.all([
      GetAppSettings(),
      LoadConfig({ path: '' }),
    ])
    return {
      settings,
      config: normalizeConfigDocument(loaded.config ?? createEmptyConfigDocument()),
      configPath: loaded.path,
      configExists: loaded.exists,
    }
  } catch (error) {
    if (!canUsePreviewState()) {
      throw error
    }
    return {
      settings: createDefaultAppSettings(),
      config: createEmptyConfigDocument(),
      configPath: '',
      configExists: false,
    }
  }
}

export async function createSurveyDocument(url: string): Promise<ConfigDocument> {
  return normalizeConfigDocument(await CreateSurveyDocument({ url }))
}

export async function decodeQRCode(path: string): Promise<QRCodeDecodeState> {
  return await DecodeQRCode({ path, dataUrl: undefined, name: undefined })
}

export async function decodeQRCodeDataURL(dataUrl: string, name = ''): Promise<QRCodeDecodeState> {
  return await DecodeQRCode({ path: '', dataUrl, name })
}

export async function loadConfigDocument(path: string): Promise<{ path: string; config: ConfigDocument }> {
  const state = await LoadConfig({ path })
  if (!state.exists) {
    throw new Error('配置文件不存在')
  }
  if (!state.config) {
    throw new Error('配置文件没有运行配置')
  }
  return { path: state.path, config: normalizeConfigDocument(state.config) }
}

export async function saveConfigDocument(
  config: ConfigDocument,
  path = '',
): Promise<{ path: string; config: ConfigDocument }> {
  const normalized = normalizeConfigDocument(config)
  const state = await SaveConfig({ path, config: normalized })
  return {
    path: state.path,
    config: normalizeConfigDocument(state.config ?? normalized),
  }
}

export async function saveSettings(
  settings: AppSettings,
  credential: AICredentialDraft = { value: '', operation: 'keep' },
): Promise<AppSettings> {
  return await SaveAppSettings({
    settings,
    aiCredential: {
      operation: credentialOperation(credential.operation),
      apiKey: credential.operation === 'replace' ? credential.value : undefined,
    },
  })
}

export async function resetSettings(): Promise<AppSettings> {
  return await ResetAppSettings()
}

export async function confirmClose(): Promise<void> {
  await ConfirmClose()
}

export async function exportLogLines(path: string, lines: string[]): Promise<string> {
  return await ExportLogLines(path, lines)
}

export async function previewReverseFill(config: ConfigDocument): Promise<ReverseFillPreview> {
  return await PreviewReverseFill({
    path: config.reverseFill.sourcePath ?? '',
    format: config.reverseFill.format,
    startRow: config.reverseFill.startRow,
    questions: config.survey.definition.questions ?? [],
  })
}

export async function startRun(config: ConfigDocument): Promise<RunTaskState> {
  return await StartRun({ config: normalizeConfigDocument(config) })
}

export async function loadRunTaskState(runId = '', afterSequence = 0): Promise<RunTaskState> {
  return await GetRunTaskState({ runId, afterSequence })
}

export async function cancelRun(): Promise<RunTaskState> {
  return await CancelRun()
}

export async function pauseRun(reason = '手动暂停'): Promise<RunTaskState> {
  return await PauseRun(reason)
}

export async function resumeRun(): Promise<RunTaskState> {
  return await ResumeRun()
}

export async function loadProxyStatus(): Promise<ProxyStatus> {
  return await GetProxyStatus()
}

export async function loadProxyAreaOptions(source = 'default'): Promise<ProxyAreaOptionsState> {
  return await GetProxyAreaOptions(source)
}

export async function syncProxyStatus(source = 'default'): Promise<ProxyStatus> {
  return await SyncProxyStatus(source)
}

export async function redeemProxyCard(cardCode: string, source = 'default'): Promise<ProxyRedeemState> {
  return await RedeemProxyCard({ cardCode, source })
}

export async function testCustomProxyAPI(url: string): Promise<CustomProxyAPITestState> {
  return await TestCustomProxyAPI({ url })
}

export async function testAIConnection(profile: AIProfileSettings): Promise<AIConnectionTestState> {
  return await TestAIConnection({ aiProfile: profile })
}

function credentialOperation(operation: AICredentialDraft['operation']): AICredentialOperation {
  switch (operation) {
    case 'replace':
      return AICredentialOperation.AICredentialReplace
    case 'clear':
      return AICredentialOperation.AICredentialClear
    default:
      return AICredentialOperation.AICredentialKeep
  }
}

function canUsePreviewState(): boolean {
  return import.meta.env.DEV && !hasNativeWailsBridge()
}

function hasNativeWailsBridge(): boolean {
  const bridge = globalThis as typeof globalThis & {
    chrome?: { webview?: { postMessage?: (...args: never[]) => void } }
    webkit?: { messageHandlers?: { external?: { postMessage?: (...args: never[]) => void } } }
    wails?: { invoke?: (...args: never[]) => void }
  }
  return Boolean(
    bridge.chrome?.webview?.postMessage
    || bridge.webkit?.messageHandlers?.external?.postMessage
    || bridge.wails?.invoke,
  )
}
