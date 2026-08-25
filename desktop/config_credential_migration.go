package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	configio "github.com/SurveyController/SurveyCore/pkg/surveycore/config"
)

func (s *AppService) migrateLegacyConfigCredential(ctx context.Context, path string, document configio.ConfigDocument) error {
	data, err := s.configs.ReadFile(path)
	if err != nil {
		return err
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(configio.StripJSONComments(string(data))), &payload); err != nil {
		return err
	}
	if _, isV2 := payload["schemaVersion"]; isV2 {
		return nil
	}
	key, _ := payload["ai_api_key"].(string)
	if strings.TrimSpace(key) == "" {
		return nil
	}
	if err := s.credentials.Write(ctx, aiCredentialTarget, key); err != nil {
		return fmt.Errorf("迁移配置中的 AI 凭据: %w", err)
	}
	if _, err := s.configs.SaveDocument(document, path); err != nil {
		return fmt.Errorf("清理配置中的 AI 明文凭据: %w", err)
	}
	return nil
}
