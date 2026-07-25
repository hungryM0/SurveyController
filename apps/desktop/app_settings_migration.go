package main

import (
	"encoding/json"
	"strings"
)

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
	if profile, ok := raw["aiProfile"].(map[string]any); ok {
		settings.AIProfile = mergeLegacyAIProfile(settings.AIProfile, profile)
	}
	if defaults, ok := raw["runtimeDefaults"].(map[string]any); ok {
		settings.AIProfile = mergeLegacyAIProfile(settings.AIProfile, defaults)
	}
}

func mergeLegacyAIProfile(profile AIProfileSettings, raw map[string]any) AIProfileSettings {
	profile.Mode = firstSettingString(raw, profile.Mode, "mode", "ai_mode")
	profile.Provider = firstSettingString(raw, profile.Provider, "provider", "ai_provider")
	profile.BaseURL = firstSettingString(raw, profile.BaseURL, "baseURL", "ai_base_url")
	profile.APIProtocol = firstSettingString(raw, profile.APIProtocol, "apiProtocol", "ai_api_protocol")
	profile.Model = firstSettingString(raw, profile.Model, "model", "ai_model")
	profile.SystemPrompt = firstSettingString(raw, profile.SystemPrompt, "systemPrompt", "ai_system_prompt")
	return profile
}

func legacyAIAPIKey(data []byte) string {
	var raw map[string]any
	if json.Unmarshal(data, &raw) != nil {
		return ""
	}
	if defaults, ok := raw["runtimeDefaults"].(map[string]any); ok {
		if value := firstSettingString(defaults, "", "ai_api_key", "apiKey"); value != "" {
			return value
		}
	}
	if profile, ok := raw["aiProfile"].(map[string]any); ok {
		return firstSettingString(profile, "", "apiKey", "ai_api_key")
	}
	return ""
}

func firstSettingString(raw map[string]any, fallback string, keys ...string) string {
	for _, key := range keys {
		if value, ok := raw[key].(string); ok && strings.TrimSpace(value) != "" {
			return value
		}
	}
	return fallback
}
