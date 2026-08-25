package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	desktoprpc "github.com/SurveyController/SurveyController/desktop/internal/rpc"
	"github.com/SurveyController/SurveyCore/pkg/surveycore/model"
)

func TestBackendProcessServesSettingsAndDefaultConfig(t *testing.T) {
	tempDir := t.TempDir()
	command := exec.Command("go", "run", ".")
	command.Env = append(os.Environ(),
		"SURVEYCONTROLLER_CONFIG_HOME="+filepath.Join(tempDir, "config"),
		"SURVEYCONTROLLER_LOCAL_DATA_HOME="+filepath.Join(tempDir, "local"),
	)
	stdin, err := command.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = stdin.Close()
		if command.Process != nil {
			_ = command.Process.Kill()
		}
	})

	if err := desktoprpc.WriteFrame(stdin, desktoprpc.Request{ID: 1, Method: rpcMethodGetAppSettings}); err != nil {
		t.Fatal(err)
	}
	var settingsResponse desktoprpc.Response
	if err := desktoprpc.ReadFrame(stdout, &settingsResponse); err != nil {
		t.Fatal(err)
	}
	if settingsResponse.Error != nil {
		t.Fatalf("GetAppSettings error = %#v", settingsResponse.Error)
	}
	var settings AppSettings
	if err := json.Unmarshal(settingsResponse.Result, &settings); err != nil {
		t.Fatal(err)
	}
	if settings.SchemaVersion != AppSettingsSchemaVersion || settings.ThemeMode != "system" {
		t.Fatalf("settings = %#v", settings)
	}

	if err := desktoprpc.WriteFrame(stdin, desktoprpc.Request{ID: 2, Method: rpcMethodLoadConfig, Params: []byte(`{}`)}); err != nil {
		t.Fatal(err)
	}
	var configResponse desktoprpc.Response
	if err := desktoprpc.ReadFrame(stdout, &configResponse); err != nil {
		t.Fatal(err)
	}
	if configResponse.Error != nil {
		t.Fatalf("LoadConfig error = %#v", configResponse.Error)
	}
	var config ConfigFileState
	if err := json.Unmarshal(configResponse.Result, &config); err != nil {
		t.Fatal(err)
	}
	if config.Exists || config.Config == nil || config.Path == "" {
		t.Fatalf("config = %#v", config)
	}

	document := validTaskCheckDocument()
	document.Answers.Dimensions = []string{"服务"}
	document.Answers.Rules = []model.ConsistencyRule{{
		ID:                     "native-rule",
		ConditionQuestionNum:   1,
		ConditionMode:          "selected",
		ConditionOptionIndices: []int{0},
		TargetQuestionNum:      1,
		ActionMode:             "must_select",
		TargetOptionIndices:    []int{1},
	}}
	document.Answers.Strategies[0].CustomWeights = model.WeightTable{Options: []float64{0.25, 0.75}}
	document.Answers.Strategies[0].Dimension = "服务"
	document.Answers.Strategies[0].MultiTextBlankAIFlags = []bool{true, false, true}
	document.Answers.Strategies[0].TextRandomIntRange = []int{1, 9}
	checkParams, err := json.Marshal(CheckTaskRequest{Config: document})
	if err != nil {
		t.Fatal(err)
	}
	if err := desktoprpc.WriteFrame(stdin, desktoprpc.Request{ID: 3, Method: rpcMethodCheckTask, Params: checkParams}); err != nil {
		t.Fatal(err)
	}
	var checkResponse desktoprpc.Response
	if err := desktoprpc.ReadFrame(stdout, &checkResponse); err != nil {
		t.Fatal(err)
	}
	if checkResponse.Error != nil {
		t.Fatalf("CheckTask error = %#v", checkResponse.Error)
	}
	var checkState TaskCheckState
	if err := json.Unmarshal(checkResponse.Result, &checkState); err != nil {
		t.Fatal(err)
	}
	if checkState.Status != TaskCheckReady {
		t.Fatalf("CheckTask state = %#v, want ready", checkState)
	}

	exportPath := filepath.Join(tempDir, "runtime.log")
	exportParams, err := json.Marshal(rpcExportLogLinesRequest{
		Path:  exportPath,
		Lines: []string{"[core] started", "[worker-1] completed"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := desktoprpc.WriteFrame(stdin, desktoprpc.Request{ID: 4, Method: rpcMethodExportLogLines, Params: exportParams}); err != nil {
		t.Fatal(err)
	}
	var exportResponse desktoprpc.Response
	if err := desktoprpc.ReadFrame(stdout, &exportResponse); err != nil {
		t.Fatal(err)
	}
	if exportResponse.Error != nil {
		t.Fatalf("ExportLogLines error = %#v", exportResponse.Error)
	}
	var savedPath string
	if err := json.Unmarshal(exportResponse.Result, &savedPath); err != nil {
		t.Fatal(err)
	}
	if savedPath != exportPath {
		t.Fatalf("saved path = %q, want %q", savedPath, exportPath)
	}
	exported, err := os.ReadFile(exportPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(exported) != "[core] started\n[worker-1] completed\n" {
		t.Fatalf("exported log = %q", string(exported))
	}

	if err := stdin.Close(); err != nil {
		t.Fatal(err)
	}
	if err := command.Wait(); err != nil {
		t.Fatal(err)
	}
}
