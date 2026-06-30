package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"surveycontroller/surveycore"
	"surveycontroller/surveycore/configio"
	"surveycontroller/surveycore/reversefill"
)

func (s *AppService) GetAppSettings() (AppSettings, error) {
	return loadAppSettings()
}

func (s *AppService) SaveAppSettings(_ context.Context, request SaveSettingsRequest) (AppSettings, error) {
	return saveAppSettings(request.Settings)
}

func (s *AppService) ResetAppSettings() (AppSettings, error) {
	return saveAppSettings(defaultAppSettings())
}

func (s *AppService) ShouldConfirmClose() bool {
	settings, err := loadAppSettings()
	if err != nil {
		return true
	}
	return settings.AskSaveOnClose
}

func (s *AppService) ConfirmClose() {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()
	s.closeConfirmed = true
}

func (s *AppService) consumeCloseConfirmed() bool {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()
	if !s.closeConfirmed {
		return false
	}
	s.closeConfirmed = false
	return true
}

func (s *AppService) ExportLogLines(path string, lines []string) (string, error) {
	cleanPath := strings.TrimSpace(path)
	if cleanPath == "" {
		return "", fmt.Errorf("日志路径不能为空")
	}
	content := strings.Join(lines, "\n")
	if content != "" {
		content += "\n"
	}
	if err := os.WriteFile(cleanPath, []byte(content), 0o644); err != nil {
		return "", err
	}
	return cleanPath, nil
}

func (s *AppService) LoadConfig(_ context.Context, request LoadConfigRequest) (ConfigFileState, error) {
	settings, err := loadAppSettings()
	if err != nil {
		return ConfigFileState{}, err
	}
	path := configPathFromRequest(request.Path, settings)
	cfg, err := configio.Load(path, true)
	if err != nil {
		if strings.TrimSpace(request.Path) == "" && errors.Is(err, os.ErrNotExist) {
			empty := surveycore.RuntimeConfig{}
			empty = applyAIRuntimeDefaults(empty, settings, false)
			return ConfigFileState{Path: path, Config: &empty}, nil
		}
		return ConfigFileState{}, err
	}
	hasAISettings, err := runtimeConfigFileHasAISettings(path)
	if err != nil {
		return ConfigFileState{}, err
	}
	cfg = applyAIRuntimeDefaults(cfg, settings, hasAISettings)
	return ConfigFileState{Path: path, Config: &cfg}, nil
}

func (s *AppService) SaveConfig(_ context.Context, request SaveConfigRequest) (ConfigFileState, error) {
	settings, err := loadAppSettings()
	if err != nil {
		return ConfigFileState{}, err
	}
	path := strings.TrimSpace(request.Path)
	if path == "" {
		path = defaultSavePath(request.Config, settings)
	}
	savedPath, err := configio.Save(request.Config, path)
	if err != nil {
		return ConfigFileState{}, err
	}
	if _, err := saveAppSettings(settingsWithAIRuntimeDefaults(settings, request.Config)); err != nil {
		return ConfigFileState{}, err
	}
	cfg := request.Config
	return ConfigFileState{Path: savedPath, Config: &cfg}, nil
}

func (s *AppService) PreviewReverseFill(_ context.Context, request ReverseFillPreviewRequest) (reversefill.Preview, error) {
	return reversefill.PreviewExcel(reversefill.PreviewOptions{
		Path:          request.Path,
		Format:        request.Format,
		StartRow:      request.StartRow,
		Questions:     request.Questions,
		MaxSampleRows: 20,
	})
}
