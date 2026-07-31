package main

import (
	"context"
	"strings"
	"testing"
)

func TestStartRunRejectsInvalidExecutionBeforeRuntimeDefaults(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := newTestAppService()
	document := validTaskCheckDocument()
	document.Execution.Target = 0

	state, err := service.StartRun(context.Background(), RunSurveyRequest{Config: document})
	if err == nil || !strings.Contains(err.Error(), "目标提交数量必须大于 0") {
		t.Fatalf("state=%#v err=%v", state, err)
	}
	if state.Status != RunTaskStatusFailed {
		t.Fatalf("state = %#v, want failed", state)
	}
}
