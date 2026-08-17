package main

import (
	"context"
	"testing"

	"github.com/SurveyController/SurveyController/packages/surveycore"
	"github.com/SurveyController/SurveyController/packages/surveycore/configio"
)

func TestCheckTaskEmptyConfigIsBlocked(t *testing.T) {
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{})
	if state.Status != TaskCheckBlocked {
		t.Fatalf("status = %q, want blocked", state.Status)
	}
	problem := requireTaskCheckProblem(t, state, "config_invalid")
	assertTaskCheckProblemShape(t, problem, taskCheckStepAnswers, "error")
}

func TestCheckTaskRequiresParsedQuestions(t *testing.T) {
	document := testConfigDocument("https://www.wjx.cn/vm/demo.aspx", surveycore.ProviderWJX)
	document.Survey.Title = "已解析问卷"
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document})
	if state.Status != TaskCheckBlocked {
		t.Fatalf("status = %q, want blocked", state.Status)
	}
	problem := requireTaskCheckProblem(t, state, "survey_questions_missing")
	assertTaskCheckProblemShape(t, problem, taskCheckStepSurvey, "error")
}

func TestCheckTaskRequiresAnswerStrategies(t *testing.T) {
	document := validTaskCheckDocument()
	document.Answers.Strategies = nil
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document})
	if state.Status != TaskCheckBlocked {
		t.Fatalf("status = %q, want blocked", state.Status)
	}
	problem := requireTaskCheckProblem(t, state, "answer_strategy_missing")
	assertTaskCheckProblemShape(t, problem, taskCheckStepAnswers, "error")
}

func TestCheckTaskRejectsDescriptionOnlySurvey(t *testing.T) {
	document := validTaskCheckDocument()
	document.Survey.Definition.Questions = []surveycore.QuestionMeta{{
		Num:           1,
		Title:         "说明",
		IsDescription: true,
	}}
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document})
	if state.Status != TaskCheckBlocked {
		t.Fatalf("status = %q, want blocked", state.Status)
	}
	requireTaskCheckProblem(t, state, "survey_questions_missing")
}

func TestCheckTaskRejectsUnsupportedProvider(t *testing.T) {
	document := validTaskCheckDocument()
	document.Survey.Provider = "unknown"
	document.Survey.Definition.Provider = "unknown"
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document})
	if state.Status != TaskCheckBlocked {
		t.Fatalf("status = %q, want blocked", state.Status)
	}
	problem := requireTaskCheckProblem(t, state, "survey_provider_unsupported")
	assertTaskCheckProblemShape(t, problem, taskCheckStepSurvey, "error")
}

func TestCheckTaskDetectsAllAIAnswerMarkers(t *testing.T) {
	document := validTaskCheckDocument()
	fill := "__AI_FILL__"
	questionNum := 1
	document.Answers.Strategies = []surveycore.QuestionStrategy{{
		QuestionNum:     &questionNum,
		OptionFillTexts: []*string{&fill},
	}}
	profile := AIProfileSettings{Mode: "provider", HasAPIKey: false}
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document, AIProfile: &profile})
	if state.Status != TaskCheckBlocked {
		t.Fatalf("status = %q, want blocked", state.Status)
	}
	requireTaskCheckProblem(t, state, "ai_credential_missing")
}

func TestCheckTaskRejectsInvalidExecution(t *testing.T) {
	document := validTaskCheckDocument()
	document.Execution.Target = 0
	document.Execution.Threads = 0
	document.Execution.SubmitInterval = [2]int{5, 2}
	document.Execution.AnswerDuration = [2]int{0, 0}
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document})
	if state.Status != TaskCheckBlocked {
		t.Fatalf("status = %q, want blocked", state.Status)
	}
	for _, code := range []string{"execution_target_invalid", "execution_concurrency_invalid", "execution_interval_invalid", "execution_duration_invalid"} {
		problem := requireTaskCheckProblem(t, state, code)
		assertTaskCheckProblemShape(t, problem, taskCheckStepTask, "error")
	}
}

func TestCheckTaskValidConfigIsReady(t *testing.T) {
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: validTaskCheckDocument()})
	if state.Status != TaskCheckReady || len(state.Problems) != 0 {
		t.Fatalf("state = %#v, want ready without problems", state)
	}
}

func TestCheckTaskInvalidCustomProxyIsBlockedWithoutNetworkAccess(t *testing.T) {
	document := validTaskCheckDocument()
	document.Network.RandomProxyEnabled = true
	document.Network.ProxySource = "custom"
	document.Network.CustomProxyAPI = "ftp://proxy.example/api"
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document})
	if state.Status != TaskCheckBlocked {
		t.Fatalf("status = %q, want blocked", state.Status)
	}
	problem := requireTaskCheckProblem(t, state, "proxy_api_url_invalid")
	assertTaskCheckProblemShape(t, problem, taskCheckStepNetwork, "error")
}

func TestCheckTaskFixedProxyRequiresValidAddress(t *testing.T) {
	document := validTaskCheckDocument()
	document.Network.ProxyMode = "fixed"
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document})
	if state.Status != TaskCheckBlocked {
		t.Fatalf("missing fixed proxy status = %q, want blocked", state.Status)
	}
	requireTaskCheckProblem(t, state, "fixed_proxy_address_missing")

	document.Network.FixedProxyAddress = "ftp://proxy.example:8080"
	state = NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document})
	if state.Status != TaskCheckBlocked {
		t.Fatalf("invalid fixed proxy status = %q, want blocked", state.Status)
	}
	requireTaskCheckProblem(t, state, "fixed_proxy_address_invalid")
}

func TestCheckTaskExplicitDirectModeIgnoresStaleFixedProxyAddress(t *testing.T) {
	document := validTaskCheckDocument()
	document.Network.ProxyMode = "direct"
	document.Network.FixedProxyAddress = "ftp://stale.example:8080"
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document})
	if state.Status != TaskCheckReady || len(state.Problems) != 0 {
		t.Fatalf("state = %#v, want ready", state)
	}
}

func TestCheckTaskWarningRemainsWarning(t *testing.T) {
	document := validTaskCheckDocument()
	document.Survey.Title = ""
	document.Survey.Definition.Title = ""
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document})
	if state.Status != TaskCheckWarning {
		t.Fatalf("status = %q, want warning", state.Status)
	}
	problem := requireTaskCheckProblem(t, state, "survey_title_missing")
	assertTaskCheckProblemShape(t, problem, taskCheckStepSurvey, "warning")
}

func TestCheckTaskRejectsInvalidCredamoDatetimeWindow(t *testing.T) {
	document := validTaskCheckDocument()
	document.Survey.Provider = surveycore.ProviderCredamo
	document.Survey.Definition.Provider = surveycore.ProviderCredamo
	document.Execution.AnswerDatetimeWindow = [2]string{"2024-03-10 10:00:00", "2024-03-10 09:00:00"}
	state := NewAppService().CheckTask(context.Background(), CheckTaskRequest{Config: document})
	if state.Status != TaskCheckBlocked {
		t.Fatalf("status = %q, want blocked", state.Status)
	}
	problem := requireTaskCheckProblem(t, state, "execution_datetime_window_order")
	assertTaskCheckProblemShape(t, problem, taskCheckStepTask, "error")
}

func validTaskCheckDocument() configio.ConfigDocument {
	document := testConfigDocument("https://www.wjx.cn/vm/demo.aspx", surveycore.ProviderWJX)
	document.Survey.Title = "已解析问卷"
	document.Survey.Definition.Title = "已解析问卷"
	document.Survey.Definition.Questions = []surveycore.QuestionMeta{{
		Num:          1,
		Title:        "满意度",
		ProviderType: "single",
		Options:      2,
		OptionTexts:  []string{"满意", "不满意"},
	}}
	questionNum := 1
	document.Answers.Strategies = []surveycore.QuestionStrategy{{QuestionNum: &questionNum}}
	document.Execution.SubmitInterval = [2]int{1, 2}
	return document
}

func requireTaskCheckProblem(t *testing.T, state TaskCheckState, code string) TaskCheckProblem {
	t.Helper()
	for _, problem := range state.Problems {
		if problem.Code == code {
			return problem
		}
	}
	t.Fatalf("missing problem %q in %#v", code, state.Problems)
	return TaskCheckProblem{}
}

func assertTaskCheckProblemShape(t *testing.T, problem TaskCheckProblem, step, severity string) {
	t.Helper()
	if problem.Code == "" || problem.Message == "" || problem.Step != step || problem.Severity != severity {
		t.Fatalf("problem = %#v, want step=%q severity=%q with stable fields", problem, step, severity)
	}
}
