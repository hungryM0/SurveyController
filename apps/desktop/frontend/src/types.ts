import type {
  ConfigDocument as BoundConfigDocument,
  NetworkSettings as BoundNetworkSettings,
  SurveyDocument as BoundSurveyDocument,
} from '../bindings/surveycontroller/surveycore/configio/models'
import type {
  AnswerPlan as BoundAnswerPlan,
  AttachedOptionSelect as BoundAttachedOptionSelect,
  ConsistencyRule as BoundConsistencyRule,
  Event as BoundRunEvent,
  ExecutionPlan as BoundExecutionPlan,
  PsychometricPolicy as BoundPsychometricPolicy,
  QuestionMedia as BoundQuestionMedia,
  QuestionMeta as BoundQuestionMeta,
  QuestionStrategy as BoundQuestionStrategy,
  ReverseFillPlan as BoundReverseFillPlan,
  RunResult as BoundRunResult,
  SurveyDefinition as BoundSurveyDefinition,
  ThreadProgress as BoundThreadProgress,
  WeightTable as BoundWeightTable,
} from '../bindings/surveycontroller/surveycore/internal/model/models'
import type { Preview as BoundReverseFillPreview } from '../bindings/surveycontroller/surveycore/reversefill/models'
import type {
  AIConnectionTestState as BoundAIConnectionTestState,
  AIProfileSettings as BoundAIProfileSettings,
  AppSettings as BoundAppSettings,
  CustomProxyAPITestState as BoundCustomProxyAPITestState,
  FixedProxyTestState as BoundFixedProxyTestState,
  ProxyAreaOptionsState as BoundProxyAreaOptionsState,
  ProxyRedeemState as BoundProxyRedeemState,
  ProxyStatus as BoundProxyStatus,
  QRCodeDecodeState as BoundQRCodeDecodeState,
  RunTaskEvent as BoundRunTaskEvent,
  RunTaskState as BoundRunTaskState,
  TaskCheckState as BoundTaskCheckState,
} from '../bindings/github.com/hungrym0/SurveyController/apps/desktop/models'

export type ConfigDocument = BoundConfigDocument
export type NetworkSettings = BoundNetworkSettings
export type SurveyDocument = BoundSurveyDocument
export type AnswerPlan = BoundAnswerPlan
export type AttachedOptionSelect = BoundAttachedOptionSelect
export type ConsistencyRule = BoundConsistencyRule
export type ExecutionPlan = BoundExecutionPlan
export type PsychometricPolicy = BoundPsychometricPolicy
export type QuestionEntry = BoundQuestionStrategy
export type QuestionMediaItem = BoundQuestionMedia
export type QuestionMeta = BoundQuestionMeta
export type ReverseFillPlan = BoundReverseFillPlan
export type SurveyDefinition = BoundSurveyDefinition
export type WeightTable = BoundWeightTable
export type RunEvent = BoundRunEvent
export type RunResult = BoundRunResult
export type ThreadProgress = BoundThreadProgress
export type ReverseFillPreview = BoundReverseFillPreview
export type AIConnectionTestState = BoundAIConnectionTestState
export type AIProfileSettings = BoundAIProfileSettings
export type AppSettings = BoundAppSettings
export type CustomProxyAPITestState = BoundCustomProxyAPITestState
export type FixedProxyTestState = BoundFixedProxyTestState
export type ProxyAreaOptionsState = BoundProxyAreaOptionsState
export type ProxyRedeemState = BoundProxyRedeemState
export type ProxyStatus = BoundProxyStatus
export type QRCodeDecodeState = BoundQRCodeDecodeState
export type RunTaskEvent = BoundRunTaskEvent
export type RunTaskState = BoundRunTaskState
export type RunTaskStatus = BoundRunTaskState['status']
export type TaskCheckState = BoundTaskCheckState

export type Tone = string

export interface NavItem {
  id: string
  label: string
  icon: string
  section: string
  badge?: string
  selected?: boolean
}

export interface PageMetric {
  label: string
  value: string
  tone?: Tone
}

export interface QuickAction {
  id: string
  label: string
  icon: string
  emphasis?: 'primary' | string
}

export interface QuestionRow {
  index: number
  type: string
  dimension: string
  strategy: string
}

export interface SessionRow {
  thread: string
  status: string
  progress: number
}

export interface DashboardState {
  surveyTitle: string
  surveyUrl: string
  targetCount: number
  threadCount: number
  randomIpEnabled: boolean
  randomIpQuota: number
  randomIpQuotaLabel: string
  randomIpStatus: string
  randomIpStatusTone: Tone
  proxySource: string
  proxyRemainingQuota?: string
  proxyTotalQuota?: string
  proxyQuotaKnown?: boolean
  proxyUserId?: number
  proxyUserKnown?: boolean
  proxyPoolRemainingIp?: number
  proxyPoolRemainingKnown?: boolean
  proxyAvailable?: number
  proxyInUse?: number
  questionCount: number
  progressCurrent: number
  progressTarget: number
  progressPercent: number
  statusText: string
  platformLabel: string
  metrics: PageMetric[]
  quickActions: QuickAction[]
  runtimeHint: string
  proxyHint: string
  questionRows: QuestionRow[]
  sessionRows: SessionRow[]
}

export interface SettingField {
  id: string
  label: string
  description: string
  kind: 'number' | 'slider' | 'range' | 'toggle' | 'select' | 'text' | 'password' | 'textarea' | string
  value: string
  options?: string[]
}

export interface SettingsGroup {
  title: string
  fields: SettingField[]
}

export interface StrategyRule {
  condition: string
  action: string
  target: string
}

export interface ReverseFillRow {
  question: string
  column: string
  state: string
}

export interface AppViewState {
  appTitle: string
  appVersion: string
  themeMode: string
  currentPage: string
  topNav: NavItem[]
  bottomNav: NavItem[]
  dashboard: DashboardState
  runtimeGroups: SettingsGroup[]
  strategyRules: StrategyRule[]
  dimensionGroups: string[]
  reverseFillPlan: ReverseFillRow[]
  logLines: string[]
  communityItems: string[]
  aboutItems: PageMetric[]
  donateItems: PageMetric[]
  settingsGroups: SettingsGroup[]
}

export interface AICredentialDraft {
  value: string
  operation: 'keep' | 'replace' | 'clear'
}
