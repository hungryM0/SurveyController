package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppServiceSetupWizardVersionDefaultsAndRoundTrips(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := newTestAppService()

	settings, err := service.GetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.SetupWizardVersion != 0 {
		t.Fatalf("setup wizard version = %d", settings.SetupWizardVersion)
	}

	settings.SetupWizardVersion = 1
	if _, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{Settings: settings}); err != nil {
		t.Fatal(err)
	}

	loaded, err := service.GetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.SetupWizardVersion != 1 {
		t.Fatalf("setup wizard version = %d", loaded.SetupWizardVersion)
	}
}

func TestAppServiceSaveConfigPreservesSetupWizardVersion(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := newTestAppService()
	settings := defaultAppSettings()
	settings.SetupWizardVersion = 1
	if _, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{Settings: settings}); err != nil {
		t.Fatal(err)
	}

	document := testConfigDocument("https://www.wjx.cn/vm/demo.aspx", "")
	document.Survey.Title = "向导配置"
	saved, err := service.SaveConfig(context.Background(), SaveConfigRequest{Config: document})
	if err != nil {
		t.Fatal(err)
	}
	if !saved.Exists {
		t.Fatalf("saved state = %#v", saved)
	}

	loaded, err := service.GetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.SetupWizardVersion != 1 {
		t.Fatalf("setup wizard version = %d", loaded.SetupWizardVersion)
	}
}

func TestAppServiceLoadLegacySettingsDefaultsSetupWizardVersion(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", root)
	if err := os.WriteFile(filepath.Join(root, "settings.json"), []byte(`{"themeMode":"dark"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	settings, err := newTestAppService().GetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.SetupWizardVersion != 0 {
		t.Fatalf("setup wizard version = %d", settings.SetupWizardVersion)
	}
}

func TestAppServiceLoadConfigDistinguishesMissingAndExistingFiles(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", root)
	service := newTestAppService()

	missingCases := []struct {
		name    string
		request LoadConfigRequest
		path    string
	}{
		{name: "default path", request: LoadConfigRequest{}, path: defaultConfigDocumentPath()},
		{name: "explicit path", request: LoadConfigRequest{Path: filepath.Join(root, "missing.json")}, path: filepath.Join(root, "missing.json")},
	}
	for _, testCase := range missingCases {
		t.Run(testCase.name, func(t *testing.T) {
			missing, err := service.LoadConfig(context.Background(), testCase.request)
			if err != nil {
				t.Fatal(err)
			}
			if missing.Exists || missing.Path != testCase.path || missing.Config == nil {
				t.Fatalf("missing state = %#v", missing)
			}
		})
	}

	existingPath := filepath.Join(root, "existing.json")
	if err := os.WriteFile(existingPath, []byte(`{"url":"https://www.wjx.cn/vm/demo.aspx","target":2}`), 0o644); err != nil {
		t.Fatal(err)
	}
	existing, err := service.LoadConfig(context.Background(), LoadConfigRequest{Path: existingPath})
	if err != nil {
		t.Fatal(err)
	}
	if !existing.Exists || existing.Config == nil || existing.Config.Execution.Target != 2 {
		t.Fatalf("existing state = %#v", existing)
	}
}

func TestAppServiceLoadConfigReturnsCorruptFileError(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", root)
	path := filepath.Join(root, "corrupt.json")
	if err := os.WriteFile(path, []byte(`{"url":`), 0o644); err != nil {
		t.Fatal(err)
	}

	state, err := newTestAppService().LoadConfig(context.Background(), LoadConfigRequest{Path: path})
	if err == nil {
		t.Fatalf("state = %#v", state)
	}
	if !strings.Contains(err.Error(), "读取配置失败") {
		t.Fatalf("error = %v", err)
	}
}
