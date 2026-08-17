package main

import (
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore"
)

const AppSettingsSchemaVersion = 2

type AIProfileSettings struct {
	Mode         string `json:"mode"`
	Provider     string `json:"provider"`
	BaseURL      string `json:"baseURL,omitempty"`
	APIProtocol  string `json:"apiProtocol"`
	Model        string `json:"model,omitempty"`
	SystemPrompt string `json:"systemPrompt,omitempty"`
	HasAPIKey    bool   `json:"hasAPIKey"`
}

func (settings AIProfileSettings) ProfileWithKey(apiKey string) surveycore.AIProfile {
	return surveycore.AIProfile{
		Mode:         strings.TrimSpace(settings.Mode),
		Provider:     strings.TrimSpace(settings.Provider),
		BaseURL:      strings.TrimSpace(settings.BaseURL),
		APIProtocol:  strings.TrimSpace(settings.APIProtocol),
		Model:        strings.TrimSpace(settings.Model),
		SystemPrompt: settings.SystemPrompt,
		APIKey:       strings.TrimSpace(apiKey),
	}
}

type AppSettings struct {
	SchemaVersion             int               `json:"schemaVersion"`
	ConfigDirectory           string            `json:"configDirectory"`
	ThemeMode                 string            `json:"themeMode"`
	ShowNavigationText        bool              `json:"showNavigationText"`
	Topmost                   bool              `json:"topmost"`
	AskSaveOnClose            bool              `json:"askSaveOnClose"`
	PreventSleepDuringRun     bool              `json:"preventSleepDuringRun"`
	TaskResultNotification    bool              `json:"taskResultNotification"`
	SubmissionReportTelemetry bool              `json:"submissionReportTelemetry"`
	SetupWizardVersion        int               `json:"setupWizardVersion"`
	AutoCheckUpdate           bool              `json:"autoCheckUpdate"`
	AutoSaveLogs              bool              `json:"autoSaveLogs"`
	AutosaveLogCount          int               `json:"autosaveLogCount"`
	AIProfile                 AIProfileSettings `json:"aiProfile"`
}

func defaultAppSettings() AppSettings {
	return AppSettings{
		SchemaVersion:             AppSettingsSchemaVersion,
		ConfigDirectory:           defaultConfigDirectory(),
		ThemeMode:                 "system",
		ShowNavigationText:        true,
		AskSaveOnClose:            true,
		PreventSleepDuringRun:     true,
		TaskResultNotification:    true,
		SubmissionReportTelemetry: true,
		AutoCheckUpdate:           true,
		AutoSaveLogs:              true,
		AutosaveLogCount:          10,
		AIProfile: AIProfileSettings{
			Mode:        "free",
			Provider:    "deepseek",
			APIProtocol: "auto",
		},
	}
}

func normalizeAppSettings(settings AppSettings) AppSettings {
	settings.SchemaVersion = AppSettingsSchemaVersion
	settings.AutoSaveLogs = true
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
	settings.AIProfile.Mode = defaultString(settings.AIProfile.Mode, "free")
	settings.AIProfile.Provider = defaultString(settings.AIProfile.Provider, "deepseek")
	settings.AIProfile.APIProtocol = defaultString(settings.AIProfile.APIProtocol, "auto")
	return settings
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}
