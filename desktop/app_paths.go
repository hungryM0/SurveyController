package main

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore/configio"
)

func defaultConfigDocumentPath() string {
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

func configPathFromRequest(path string, _ AppSettings) string {
	cleaned := strings.TrimSpace(path)
	if cleaned != "" {
		return filepath.Clean(cleaned)
	}
	return defaultConfigDocumentPath()
}

func defaultSavePath(config configio.ConfigDocument, settings AppSettings) string {
	dir := strings.TrimSpace(settings.ConfigDirectory)
	if dir == "" {
		dir = defaultConfigDirectory()
	}
	title := config.Survey.Title
	if strings.TrimSpace(title) == "" {
		title = "wjx_config"
	}
	return filepath.Join(dir, configio.BuildDefaultConfigFilename(title))
}
