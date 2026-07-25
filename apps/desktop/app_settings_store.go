package main

import (
	"encoding/json"
	"os"
)

func loadAppSettings() (AppSettings, string, error) {
	settings := defaultAppSettings()
	data, err := os.ReadFile(settingsPath())
	if err != nil {
		if os.IsNotExist(err) {
			return settings, "", nil
		}
		return settings, "", err
	}
	if err := json.Unmarshal(data, &settings); err != nil {
		return defaultAppSettings(), "", err
	}
	applyLegacyAppSettings(data, &settings)
	settings = normalizeAppSettings(settings)
	return settings, legacyAIAPIKey(data), nil
}

func saveAppSettings(settings AppSettings) (AppSettings, error) {
	normalized := normalizeAppSettings(settings)
	persisted := normalized
	persisted.AIProfile.HasAPIKey = false
	data, err := json.MarshalIndent(persisted, "", "  ")
	if err != nil {
		return normalized, err
	}
	if err := writeFileAtomic(settingsPath(), append(data, '\n'), 0o644); err != nil {
		return normalized, err
	}
	return normalized, nil
}
