package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/SurveyController/SurveyCore/pkg/surveycore/configio"
	"github.com/SurveyController/SurveyCore/pkg/surveycore/reversefill"
)

func (s *AppService) GetAppSettings() (AppSettings, error) {
	return s.loadAppSettings(context.Background())
}

func (s *AppService) SaveAppSettings(ctx context.Context, request SaveSettingsRequest) (AppSettings, error) {
	settings := normalizeAppSettings(request.Settings)
	configured, err := s.applyAICredentialUpdate(ctx, request.AICredential)
	if err != nil {
		return AppSettings{}, err
	}
	settings.AIProfile.HasAPIKey = configured
	return s.configs.SaveSettings(settings)
}

func (s *AppService) ResetAppSettings() (AppSettings, error) {
	if err := s.credentials.Delete(context.Background(), aiCredentialTarget); err != nil {
		return AppSettings{}, err
	}
	return s.configs.SaveSettings(defaultAppSettings())
}

func (s *AppService) loadAppSettings(ctx context.Context) (AppSettings, error) {
	settings, legacyKey, err := s.configs.LoadSettings()
	if err != nil {
		return AppSettings{}, err
	}
	store := s.credentials
	if strings.TrimSpace(legacyKey) != "" {
		if err := store.Write(ctx, aiCredentialTarget, legacyKey); err != nil {
			return AppSettings{}, fmt.Errorf("迁移 AI 凭据: %w", err)
		}
		settings.AIProfile.HasAPIKey = true
		if _, err := s.configs.SaveSettings(settings); err != nil {
			return AppSettings{}, fmt.Errorf("清理旧 AI 明文配置: %w", err)
		}
		return settings, nil
	}
	_, configured, err := readAICredential(ctx, store)
	if err != nil {
		return AppSettings{}, err
	}
	settings.AIProfile.HasAPIKey = configured
	return settings, nil
}

func (s *AppService) applyAICredentialUpdate(ctx context.Context, update AICredentialUpdate) (bool, error) {
	store := s.credentials
	switch update.Operation {
	case "", AICredentialKeep:
		_, configured, err := readAICredential(ctx, store)
		return configured, err
	case AICredentialReplace:
		key := strings.TrimSpace(update.APIKey)
		if key == "" {
			return false, fmt.Errorf("替换 AI 凭据时 API Key 不能为空")
		}
		if err := store.Write(ctx, aiCredentialTarget, key); err != nil {
			return false, err
		}
		return true, nil
	case AICredentialClear:
		if err := store.Delete(ctx, aiCredentialTarget); err != nil {
			return false, err
		}
		return false, nil
	default:
		return false, fmt.Errorf("未知 AI 凭据操作：%s", update.Operation)
	}
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

func (s *AppService) LoadConfig(ctx context.Context, request LoadConfigRequest) (ConfigFileState, error) {
	settings, err := s.loadAppSettings(ctx)
	if err != nil {
		return ConfigFileState{}, err
	}
	path := configPathFromRequest(request.Path, settings)
	cfg, err := s.configs.LoadDocument(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			empty := configio.ConfigDocument{SchemaVersion: configio.ConfigSchemaVersion, Network: defaultNetworkSettings()}
			return ConfigFileState{Path: path, Exists: false, Config: &empty}, nil
		}
		return ConfigFileState{}, err
	}
	if cfg.Network.RandomUARatios == nil {
		cfg.Network.RandomUARatios = defaultNetworkSettings().RandomUARatios
	}
	if strings.TrimSpace(cfg.Network.ProxySource) == "" {
		cfg.Network.ProxySource = defaultNetworkSettings().ProxySource
	}
	if err := s.migrateLegacyConfigCredential(ctx, path, cfg); err != nil {
		return ConfigFileState{}, err
	}
	return ConfigFileState{Path: path, Exists: true, Config: &cfg}, nil
}

func (s *AppService) SaveConfig(ctx context.Context, request SaveConfigRequest) (ConfigFileState, error) {
	settings, err := s.loadAppSettings(ctx)
	if err != nil {
		return ConfigFileState{}, err
	}
	path := strings.TrimSpace(request.Path)
	if path == "" {
		path = defaultSavePath(request.Config, settings)
	}
	savedPath, err := s.configs.SaveDocument(request.Config, path)
	if err != nil {
		return ConfigFileState{}, err
	}
	cfg := request.Config
	return ConfigFileState{Path: savedPath, Exists: true, Config: &cfg}, nil
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
