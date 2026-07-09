import type { AIConnectionTestState, AppSettings, CustomProxyAPITestState, ProxyAreaOptionsState, ProxyRedeemState, ProxyStatus, QRCodeDecodeState, ReverseFillPreview, RunTaskState, RuntimeConfig, ShellState, StartupTutorialHintState, SurveyCoreState } from '../types'
import {
  BuildDefaultConfig,
  CancelRun,
  ConfirmClose,
  DecodeQRCode,
  DismissStartupTutorialHint,
  GetProxyAreaOptions,
  GetProxyStatus,
  GetRunTaskState,
  GetAppSettings,
  GetShellState,
  GetStartupTutorialHint,
  LoadConfig,
  PauseRun,
  PreviewReverseFill,
  RedeemProxyCard,
  ResumeRun,
  RunSurvey,
  ExportLogLines,
  ResetAppSettings,
  SaveAppSettings,
  SaveConfig,
  StartRun,
  SyncProxyStatus,
  TestAIConnection,
  TestCustomProxyAPI,
} from '../../bindings/github.com/hungrym0/SurveyController/apps/desktop/appservice'
import { buildAppModel, type AppModel } from './stateMapper'

export async function loadShellState(): Promise<ShellState> {
  try {
    return (await GetShellState()) as unknown as ShellState
  } catch (err) {
    if (canUsePreviewState()) {
      return previewShellState()
    }
    throw err
  }
}

export async function loadAppModel(): Promise<AppModel> {
  try {
    const [shell, settings] = await Promise.all([
      Promise.resolve(GetShellState() as unknown as ShellState),
      GetAppSettings() as Promise<AppSettings>,
    ])
    const loaded = await LoadConfig({ path: '' }).catch(() => null)
    return buildAppModel(shell, settings, (loaded?.config ?? null) as RuntimeConfig | null, loaded?.path ?? '')
  } catch (err) {
    if (canUsePreviewState()) {
      return buildAppModel(previewShellState(), previewAppSettings(), null)
    }
    throw err
  }
}

export async function buildDefaultConfig(url: string): Promise<RuntimeConfig> {
  const state = await BuildDefaultConfig({ url }) as SurveyCoreState
  if (!state.config) {
    throw new Error('自动配置没有返回运行配置')
  }
  return state.config
}

export async function decodeQRCode(path: string): Promise<QRCodeDecodeState> {
  return await DecodeQRCode({ path, dataUrl: undefined, name: undefined }) as QRCodeDecodeState
}

export async function decodeQRCodeDataURL(dataUrl: string, name = ''): Promise<QRCodeDecodeState> {
  return await DecodeQRCode({ path: '', dataUrl, name }) as QRCodeDecodeState
}

export async function loadRuntimeConfig(path: string): Promise<{ path: string; config: RuntimeConfig }> {
  const state = await LoadConfig({ path }) as { path: string; config?: RuntimeConfig | null }
  if (!state.config) {
    throw new Error('配置文件没有运行配置')
  }
  return { path: state.path, config: state.config }
}

export async function saveRuntimeConfig(config: RuntimeConfig, path = ''): Promise<{ path: string; config: RuntimeConfig }> {
  const state = await SaveConfig({ path, config: config as any }) as { path: string; config?: RuntimeConfig | null }
  return { path: state.path, config: state.config ?? config }
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return await SaveAppSettings({ settings: settings as any }) as AppSettings
}

export async function resetSettings(): Promise<AppSettings> {
  return await ResetAppSettings() as AppSettings
}

export async function loadStartupTutorialHint(): Promise<StartupTutorialHintState> {
  return await GetStartupTutorialHint() as StartupTutorialHintState
}

export async function dismissStartupTutorialHint(): Promise<AppSettings> {
  return await DismissStartupTutorialHint() as AppSettings
}

export async function confirmClose(): Promise<void> {
  await ConfirmClose()
}

export async function exportLogLines(path: string, lines: string[]): Promise<string> {
  return await ExportLogLines(path, lines) as string
}

export async function previewReverseFill(config: RuntimeConfig): Promise<ReverseFillPreview> {
  return await PreviewReverseFill({
    path: config.reverse_fill_source_path ?? '',
    format: config.reverse_fill_format ?? 'auto',
    startRow: config.reverse_fill_start_row ?? 1,
    questions: (config.questions_info ?? []) as any,
  }) as ReverseFillPreview
}

export async function runRuntimeConfig(config: RuntimeConfig): Promise<SurveyCoreState> {
  return await RunSurvey({ config: config as any }) as SurveyCoreState
}

export async function startRuntimeConfig(config: RuntimeConfig): Promise<RunTaskState> {
  return await StartRun({ config: config as any }) as RunTaskState
}

export async function loadRunTaskState(): Promise<RunTaskState> {
  return await GetRunTaskState() as RunTaskState
}

export async function cancelRuntimeConfig(): Promise<RunTaskState> {
  return await CancelRun() as RunTaskState
}

export async function pauseRuntimeConfig(reason = '手动暂停'): Promise<RunTaskState> {
  return await PauseRun(reason) as RunTaskState
}

export async function resumeRuntimeConfig(): Promise<RunTaskState> {
  return await ResumeRun() as RunTaskState
}

export async function loadProxyStatus(): Promise<ProxyStatus> {
  return await GetProxyStatus() as ProxyStatus
}

export async function loadProxyAreaOptions(source = 'default'): Promise<ProxyAreaOptionsState> {
  return await GetProxyAreaOptions(source) as ProxyAreaOptionsState
}

export async function syncProxyStatus(source = 'default'): Promise<ProxyStatus> {
  return await SyncProxyStatus(source) as ProxyStatus
}

export async function redeemProxyCard(cardCode: string, source = 'default'): Promise<ProxyRedeemState> {
  return await RedeemProxyCard({ cardCode, source }) as ProxyRedeemState
}

export async function testCustomProxyAPI(url: string): Promise<CustomProxyAPITestState> {
  return await TestCustomProxyAPI({ url }) as CustomProxyAPITestState
}

export async function testAIConnection(config: RuntimeConfig): Promise<AIConnectionTestState> {
  return await TestAIConnection({ config: config as any }) as AIConnectionTestState
}

function canUsePreviewState(): boolean {
  return import.meta.env.DEV && !hasNativeWailsBridge()
}

function hasNativeWailsBridge(): boolean {
  const win = globalThis as typeof globalThis & {
    chrome?: { webview?: { postMessage?: unknown } }
    webkit?: { messageHandlers?: { external?: { postMessage?: unknown } } }
    wails?: { invoke?: unknown }
  }
  return Boolean(
    win.chrome?.webview?.postMessage ||
    win.webkit?.messageHandlers?.external?.postMessage ||
    win.wails?.invoke,
  )
}

function previewAppSettings(): AppSettings {
  return {
    configDirectory: '',
    themeMode: 'system',
    showNavigationText: true,
    micaEnabled: true,
    topmost: false,
    askSaveOnClose: true,
    preventSleepDuringRun: true,
    taskResultNotification: true,
    submissionReportTelemetry: true,
    startupTutorialHintSeen: false,
    autoCheckUpdate: true,
    autoSaveLogs: true,
    notifications: true,
    autosaveLogCount: 10,
    runtimeDefaults: {},
  }
}

function previewShellState(): ShellState {
  return {
    appTitle: 'SurveyController',
    appVersion: 'preview',
    themeMode: 'system',
    currentPage: 'dashboard',
    topNav: [
      { id: 'dashboard', label: '概览', icon: 'home', section: 'top', selected: true },
      { id: 'runtime', label: '运行参数', icon: 'settings', section: 'top' },
      { id: 'strategy', label: '题目策略', icon: 'flow', section: 'top' },
      { id: 'reverse-fill', label: '反填', icon: 'refresh', section: 'top' },
      { id: 'logs', label: '日志', icon: 'document', section: 'top' },
    ],
    bottomNav: [
      { id: 'community', label: '社区', icon: 'chat', section: 'bottom' },
      { id: 'settings', label: '设置', icon: 'sliders', section: 'bottom' },
      { id: 'more', label: '更多', icon: 'grid', section: 'bottom' },
    ],
    dashboard: {
      surveyTitle: '未命名问卷',
      surveyUrl: '',
      targetCount: 1,
      threadCount: 1,
      randomIpEnabled: false,
      randomIpQuota: 0,
      randomIpQuotaLabel: '未同步',
      randomIpStatus: '未连接代理服务',
      randomIpStatusTone: '',
      proxySource: '默认',
      proxyRemainingQuota: '0',
      proxyTotalQuota: '0',
      proxyQuotaKnown: false,
      proxyAvailable: 0,
      proxyInUse: 0,
      questionCount: 0,
      progressCurrent: 0,
      progressTarget: 1,
      progressPercent: 0,
      statusText: '等待配置',
      platformLabel: '问卷星',
      metrics: [],
      quickActions: [],
      runtimeHint: '随机 UA 未开启',
      proxyHint: '失败停止已开启',
      questionRows: [],
      sessionRows: [],
    },
    runtimeGroups: [],
    strategyRules: [],
    dimensionGroups: [],
    reverseFillPlan: [],
    logLines: [],
    communityItems: [
      'QQ 群交流',
      '问题反馈',
      '参与贡献',
      '开源许可',
    ],
    aboutItems: [
      { label: '版本', value: 'preview' },
      { label: '前端栈', value: 'React + Radix UI + Wails v3' },
      { label: '桌面壳', value: 'Wails v3' },
    ],
    donateItems: [
      { label: '微信', value: '赞赏码' },
      { label: '支付宝', value: '收款码' },
    ],
    settingsGroups: [],
  }
}
