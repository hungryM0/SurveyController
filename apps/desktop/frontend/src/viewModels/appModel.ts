import type {
  AICredentialDraft,
  AppSettings,
  AppViewState,
  ConfigDocument,
  ProxyStatus,
  ReverseFillPreview,
  RunTaskState,
} from '../types'
import { createBaseAppViewState } from '../services/appViewState'
import { normalizeConfigDocument } from '../services/configDocument'
import { mapDashboard } from './dashboard'
import { mapReverseFillRows } from './reverseFill'
import { mapRuntimeGroups } from './runtime'
import { mapSettingsGroups } from './settings'
import { mapDimensionGroups, mapStrategyRules } from './strategy'

export interface AppModel {
  view: AppViewState
  settings: AppSettings
  config: ConfigDocument
  configPath: string
  configExists: boolean
  reverseFillPreview: ReverseFillPreview | null
}

export function buildAppModel(
  settings: AppSettings,
  config: ConfigDocument,
  configPath = '',
  configExists = false,
  version?: string,
): AppModel {
  const normalized = normalizeConfigDocument(config)
  return {
    view: createBaseAppViewState(version),
    settings,
    config: normalized,
    configPath,
    configExists,
    reverseFillPreview: null,
  }
}

export function mapAppViewState(
  model: AppModel,
  credential: AICredentialDraft,
  runState: RunTaskState | null = null,
  proxyStatus: ProxyStatus | null = null,
): AppViewState {
  const config = normalizeConfigDocument(model.config)
  return {
    ...model.view,
    themeMode: model.settings.themeMode || model.view.themeMode,
    dashboard: mapDashboard(model.view.dashboard, config, runState, proxyStatus),
    runtimeGroups: mapRuntimeGroups(config, model.settings, credential),
    settingsGroups: mapSettingsGroups(model.settings),
    strategyRules: mapStrategyRules(config),
    dimensionGroups: mapDimensionGroups(config),
    reverseFillPlan: mapReverseFillRows(config, model.reverseFillPreview),
  }
}
