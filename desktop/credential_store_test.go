package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/SurveyController/SurveyCore/pkg/surveycore/model"
)

func TestSaveAppSettingsCredentialOperations(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := newTestAppService()
	store := service.credentials.(*memoryCredentialStore)
	settings := defaultAppSettings()
	settings.AIProfile.Mode = "provider"
	settings.AIProfile.Provider = "custom"

	saved, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{
		Settings: settings,
		AICredential: AICredentialUpdate{
			Operation: AICredentialReplace,
			APIKey:    " sk-replace ",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !saved.AIProfile.HasAPIKey || store.secret(aiCredentialTarget) != "sk-replace" {
		t.Fatalf("saved=%#v credential=%q", saved, store.secret(aiCredentialTarget))
	}

	settings = saved
	settings.AIProfile.Model = "next-model"
	kept, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{
		Settings:     settings,
		AICredential: AICredentialUpdate{Operation: AICredentialKeep},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !kept.AIProfile.HasAPIKey || store.secret(aiCredentialTarget) != "sk-replace" {
		t.Fatalf("kept=%#v credential=%q", kept, store.secret(aiCredentialTarget))
	}

	cleared, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{
		Settings:     kept,
		AICredential: AICredentialUpdate{Operation: AICredentialClear},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cleared.AIProfile.HasAPIKey || store.secret(aiCredentialTarget) != "" {
		t.Fatalf("cleared=%#v credential=%q", cleared, store.secret(aiCredentialTarget))
	}
}

func TestAppSettingsResponseAndFileNeverExposeCredential(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := newTestAppService()
	settings, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{
		Settings: defaultAppSettings(),
		AICredential: AICredentialUpdate{
			Operation: AICredentialReplace,
			APIKey:    "sk-private-response",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	response, err := json.Marshal(settings)
	if err != nil {
		t.Fatal(err)
	}
	file, err := os.ReadFile(settingsPath())
	if err != nil {
		t.Fatal(err)
	}
	for name, payload := range map[string][]byte{"response": response, "file": file} {
		if bytes.Contains(payload, []byte("sk-private-response")) || bytes.Contains(bytes.ToLower(payload), []byte(`"apikey"`)) {
			t.Fatalf("%s leaked credential: %s", name, payload)
		}
	}
	if !bytes.Contains(response, []byte(`"hasAPIKey":true`)) || !bytes.Contains(file, []byte(`"hasAPIKey": false`)) {
		t.Fatalf("response=%s file=%s", response, file)
	}
}

func TestCredentialFailuresAreReturnedWithoutPlaintextFallback(t *testing.T) {
	t.Run("read", func(t *testing.T) {
		t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
		service := newTestAppService()
		store := service.credentials.(*memoryCredentialStore)
		store.readErr = credentialError("read failed")
		if _, err := service.GetAppSettings(); err == nil || !strings.Contains(err.Error(), "read failed") {
			t.Fatalf("err = %v", err)
		}
		state := service.TestAIConnection(context.Background(), TestAIConnectionRequest{AIProfile: AIProfileSettings{Mode: "provider"}})
		if state.Success || !strings.Contains(state.Message, "read failed") {
			t.Fatalf("state = %#v", state)
		}
	})

	t.Run("write", func(t *testing.T) {
		t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
		service := newTestAppService()
		store := service.credentials.(*memoryCredentialStore)
		store.writeErr = credentialError("write failed")
		_, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{
			Settings:     defaultAppSettings(),
			AICredential: AICredentialUpdate{Operation: AICredentialReplace, APIKey: "sk-secret"},
		})
		if err == nil || !strings.Contains(err.Error(), "write failed") {
			t.Fatalf("err = %v", err)
		}
		if _, err := os.Stat(settingsPath()); !os.IsNotExist(err) {
			t.Fatalf("settings file exists after credential failure: %v", err)
		}
	})

	t.Run("delete", func(t *testing.T) {
		t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
		service := newTestAppService()
		store := service.credentials.(*memoryCredentialStore)
		store.deleteErr = credentialError("delete failed")
		if _, err := service.ResetAppSettings(); err == nil || !strings.Contains(err.Error(), "delete failed") {
			t.Fatalf("err = %v", err)
		}
	})
}

func TestLegacyCredentialMigrationFailurePreservesSourceFiles(t *testing.T) {
	t.Run("settings", func(t *testing.T) {
		root := t.TempDir()
		t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", root)
		path := filepath.Join(root, "settings.json")
		original := []byte(`{"runtimeDefaults":{"ai_api_key":"sk-legacy"}}`)
		if err := os.WriteFile(path, original, 0o644); err != nil {
			t.Fatal(err)
		}
		service := newTestAppService()
		service.credentials.(*memoryCredentialStore).writeErr = credentialError("write failed")
		if _, err := service.GetAppSettings(); err == nil {
			t.Fatal("expected migration failure")
		}
		actual, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(actual, original) {
			t.Fatalf("settings changed: %s", actual)
		}
	})

	t.Run("config", func(t *testing.T) {
		root := t.TempDir()
		t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", root)
		path := filepath.Join(root, "config.json")
		original := []byte(`{"url":"https://www.wjx.cn/vm/demo.aspx","ai_api_key":"sk-legacy"}`)
		if err := os.WriteFile(path, original, 0o644); err != nil {
			t.Fatal(err)
		}
		service := newTestAppService()
		service.credentials.(*memoryCredentialStore).writeErr = credentialError("write failed")
		if _, err := service.LoadConfig(context.Background(), LoadConfigRequest{Path: path}); err == nil {
			t.Fatal("expected migration failure")
		}
		actual, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(actual, original) {
			t.Fatalf("config changed: %s", actual)
		}
	})
}

func TestStartRunFailsWhenAIPlanNeedsMissingCredential(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := newTestAppService()
	settings := defaultAppSettings()
	settings.AIProfile.Mode = "provider"
	if _, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{Settings: settings}); err != nil {
		t.Fatal(err)
	}
	document := testConfigDocument("https://www.wjx.cn/vm/demo.aspx", "")
	document.Survey.Definition.Questions = []model.QuestionMeta{{
		Num:          1,
		Title:        "满意度",
		Provider:     model.ProviderWJX,
		ProviderType: "single",
		Options:      2,
	}}
	questionNum := 1
	document.Answers.Strategies = []model.QuestionStrategy{{QuestionNum: &questionNum, AIEnabled: true}}
	state, err := service.StartRun(context.Background(), RunSurveyRequest{Config: document})
	if err == nil || !strings.Contains(err.Error(), "未配置 API Key") {
		t.Fatalf("state=%#v err=%v", state, err)
	}
	if state.Status != RunTaskStatusFailed {
		t.Fatalf("state = %#v", state)
	}
}
