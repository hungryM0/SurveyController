package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"surveycontroller/surveycore"
	"surveycontroller/surveycore/configio"
)

type AppSettings struct {
	ConfigDirectory           string            `json:"configDirectory"`
	ThemeMode                 string            `json:"themeMode"`
	ShowNavigationText        bool              `json:"showNavigationText"`
	MicaEnabled               bool              `json:"micaEnabled"`
	Topmost                   bool              `json:"topmost"`
	AskSaveOnClose            bool              `json:"askSaveOnClose"`
	PreventSleepDuringRun     bool              `json:"preventSleepDuringRun"`
	TaskResultNotification    bool              `json:"taskResultNotification"`
	SubmissionReportTelemetry bool              `json:"submissionReportTelemetry"`
	SetupWizardVersion        int               `json:"setupWizardVersion"`
	AutoCheckUpdate           bool              `json:"autoCheckUpdate"`
	AutoSaveLogs              bool              `json:"autoSaveLogs"`
	Notifications             bool              `json:"notifications"`
	AutosaveLogCount          int               `json:"autosaveLogCount"`
	RuntimeDefaults           map[string]string `json:"runtimeDefaults,omitempty"`
}

type LoadConfigRequest struct {
	Path string `json:"path"`
}

type SaveConfigRequest struct {
	Path   string                   `json:"path"`
	Config surveycore.RuntimeConfig `json:"config"`
}

type SaveSettingsRequest struct {
	Settings AppSettings `json:"settings"`
}

type ConfigFileState struct {
	Path   string                    `json:"path"`
	Exists bool                      `json:"exists"`
	Config *surveycore.RuntimeConfig `json:"config,omitempty"`
}

func defaultAppSettings() AppSettings {
	return AppSettings{
		ConfigDirectory:           defaultConfigDirectory(),
		ThemeMode:                 "system",
		ShowNavigationText:        true,
		MicaEnabled:               true,
		AskSaveOnClose:            true,
		PreventSleepDuringRun:     true,
		TaskResultNotification:    true,
		SubmissionReportTelemetry: true,
		AutoCheckUpdate:           true,
		AutoSaveLogs:              true,
		Notifications:             true,
		AutosaveLogCount:          10,
		RuntimeDefaults:           map[string]string{},
	}
}

func loadAppSettings() (AppSettings, error) {
	settings := defaultAppSettings()
	data, err := os.ReadFile(settingsPath())
	if err != nil {
		if os.IsNotExist(err) {
			return settings, nil
		}
		return settings, err
	}
	if err := json.Unmarshal(data, &settings); err != nil {
		return defaultAppSettings(), err
	}
	applyLegacyAppSettings(data, &settings)
	settings = normalizeAppSettings(settings)
	return settings, nil
}

func saveAppSettings(settings AppSettings) (AppSettings, error) {
	normalized := normalizeAppSettings(settings)
	if err := os.MkdirAll(userConfigRoot(), 0o755); err != nil {
		return normalized, err
	}
	data, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return normalized, err
	}
	if err := os.WriteFile(settingsPath(), append(data, '\n'), 0o644); err != nil {
		return normalized, err
	}
	return normalized, nil
}

func normalizeAppSettings(settings AppSettings) AppSettings {
	if strings.TrimSpace(settings.ConfigDirectory) == "" {
		settings.ConfigDirectory = defaultConfigDirectory()
	}
	if strings.TrimSpace(settings.ThemeMode) == "" {
		settings.ThemeMode = "system"
	}
	if settings.AutosaveLogCount <= 0 {
		settings.AutosaveLogCount = 10
	}
	if settings.SetupWizardVersion < 0 {
		settings.SetupWizardVersion = 0
	}
	settings.Notifications = settings.TaskResultNotification
	if settings.RuntimeDefaults == nil {
		settings.RuntimeDefaults = map[string]string{}
	}
	return settings
}

func applyAIRuntimeDefaults(config surveycore.RuntimeConfig, settings AppSettings, configHasAISettings bool) surveycore.RuntimeConfig {
	if configHasAISettings {
		return config
	}
	defaults := settings.RuntimeDefaults
	if defaults == nil {
		defaults = map[string]string{}
	}
	config.AIMode = defaultRuntimeString(defaults["ai_mode"], config.AIMode, "free")
	config.AIProvider = defaultRuntimeString(defaults["ai_provider"], config.AIProvider, "deepseek")
	config.AIAPIKey = defaultRuntimeString(defaults["ai_api_key"], config.AIAPIKey, "")
	config.AIBaseURL = defaultRuntimeString(defaults["ai_base_url"], config.AIBaseURL, "")
	config.AIAPIProtocol = defaultRuntimeString(defaults["ai_api_protocol"], config.AIAPIProtocol, "auto")
	config.AIModel = defaultRuntimeString(defaults["ai_model"], config.AIModel, "")
	config.AISystemPrompt = defaultRuntimeString(defaults["ai_system_prompt"], config.AISystemPrompt, "")
	return config
}

func settingsWithAIRuntimeDefaults(settings AppSettings, config surveycore.RuntimeConfig) AppSettings {
	settings = normalizeAppSettings(settings)
	settings.RuntimeDefaults["ai_mode"] = defaultRuntimeString(config.AIMode, "", "free")
	settings.RuntimeDefaults["ai_provider"] = defaultRuntimeString(config.AIProvider, "", "deepseek")
	settings.RuntimeDefaults["ai_api_key"] = config.AIAPIKey
	settings.RuntimeDefaults["ai_base_url"] = config.AIBaseURL
	settings.RuntimeDefaults["ai_api_protocol"] = defaultRuntimeString(config.AIAPIProtocol, "", "auto")
	settings.RuntimeDefaults["ai_model"] = config.AIModel
	settings.RuntimeDefaults["ai_system_prompt"] = config.AISystemPrompt
	return settings
}

func runtimeConfigFileHasAISettings(path string) (bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	cleaned := configio.StripJSONComments(string(data))
	if strings.TrimSpace(cleaned) == "" {
		return false, nil
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(cleaned), &payload); err != nil {
		return false, err
	}
	for _, key := range []string{
		"ai_mode",
		"ai_provider",
		"ai_api_key",
		"ai_base_url",
		"ai_api_protocol",
		"ai_model",
		"ai_system_prompt",
	} {
		if _, ok := payload[key]; ok {
			return true, nil
		}
	}
	return false, nil
}

func defaultRuntimeString(value string, fallback string, defaultValue string) string {
	text := strings.TrimSpace(value)
	if text != "" {
		return text
	}
	fallback = strings.TrimSpace(fallback)
	if fallback != "" {
		return fallback
	}
	return defaultValue
}

func applyLegacyAppSettings(data []byte, settings *AppSettings) {
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return
	}
	if _, ok := raw["askSaveOnClose"]; !ok {
		settings.AskSaveOnClose = true
	}
	if _, ok := raw["preventSleepDuringRun"]; !ok {
		settings.PreventSleepDuringRun = true
	}
	if _, ok := raw["submissionReportTelemetry"]; !ok {
		settings.SubmissionReportTelemetry = true
	}
	if _, ok := raw["autoCheckUpdate"]; !ok {
		settings.AutoCheckUpdate = true
	}
	if _, ok := raw["autoSaveLogs"]; !ok {
		settings.AutoSaveLogs = true
	}
	if _, ok := raw["taskResultNotification"]; !ok {
		if legacy, ok := raw["notifications"].(bool); ok {
			settings.TaskResultNotification = legacy
		} else {
			settings.TaskResultNotification = true
		}
	}
}

func defaultRuntimeConfigPath() string {
	return filepath.Join(userConfigRoot(), "config.json")
}

func defaultConfigDirectory() string {
	return filepath.Join(userConfigRoot(), "configs")
}

func settingsPath() string {
	return filepath.Join(userConfigRoot(), "settings.json")
}

func userConfigRoot() string {
	if override := strings.TrimSpace(os.Getenv("SURVEYCONTROLLER_CONFIG_HOME")); override != "" {
		return filepath.Clean(override)
	}
	return filepath.Join(userDataBaseRoot(true), "SurveyController")
}

func userLocalDataRoot() string {
	if override := strings.TrimSpace(os.Getenv("SURVEYCONTROLLER_LOCAL_DATA_HOME")); override != "" {
		return filepath.Clean(override)
	}
	return filepath.Join(userDataBaseRoot(false), "SurveyController")
}

func userDataBaseRoot(roaming bool) string {
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		return "."
	}
	if roaming {
		if appData := strings.TrimSpace(os.Getenv("APPDATA")); appData != "" {
			return appData
		}
		return filepath.Join(home, "AppData", "Roaming")
	}
	if localAppData := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); localAppData != "" {
		return localAppData
	}
	return filepath.Join(home, "AppData", "Local")
}

func configPathFromRequest(path string, settings AppSettings) string {
	cleaned := strings.TrimSpace(path)
	if cleaned != "" {
		return filepath.Clean(cleaned)
	}
	return defaultRuntimeConfigPath()
}

func defaultSavePath(config surveycore.RuntimeConfig, settings AppSettings) string {
	dir := strings.TrimSpace(settings.ConfigDirectory)
	if dir == "" {
		dir = defaultConfigDirectory()
	}
	title := config.SurveyTitle
	if strings.TrimSpace(title) == "" {
		title = "wjx_config"
	}
	return filepath.Join(dir, configio.BuildDefaultConfigFilename(title))
}
