package configio

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"surveycontroller/surveycore"
)

func TestConfigDocumentV2RoundTrip(t *testing.T) {
	document := ConfigDocument{
		SchemaVersion: ConfigSchemaVersion,
		Survey: SurveyDocument{
			URL: "https://wj.qq.com/s2/123/hash/", Provider: surveycore.ProviderQQ, Title: "腾讯测试",
			Definition: surveycore.SurveyDefinition{Provider: surveycore.ProviderQQ, Title: "腾讯测试"},
		},
		Execution:     modelExecution(12, 4),
		Network:       NetworkSettings{RandomProxyEnabled: true, ProxySource: "custom", CustomProxyAPI: "https://proxy.example", RandomUAEnabled: true, RandomUARatios: map[string]int{"wechat": 50, "mobile": 30, "pc": 20}},
		Answers:       surveycore.AnswerPlan{Dimensions: []string{"服务", "价格"}},
		ReverseFill:   surveycore.ReverseFillPlan{Enabled: true, SourcePath: "D:/demo.xlsx", Format: ReverseFillFormatWJXSequence, StartRow: 3, Threads: 2},
		Psychometrics: surveycore.PsychometricPolicy{Enabled: true, TargetAlpha: 0.85},
	}
	payload, err := SerializeConfigDocument(document)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := DeserializeConfigDocument(payload)
	if err != nil {
		t.Fatal(err)
	}
	if restored.SchemaVersion != ConfigSchemaVersion || restored.Survey.Provider != surveycore.ProviderQQ || restored.Execution.Target != 12 || !restored.Network.RandomProxyEnabled {
		t.Fatalf("restored = %#v", restored)
	}
	if restored.ReverseFill.StartRow != 3 || len(restored.Answers.Dimensions) != 2 {
		t.Fatalf("restored sections = %#v", restored)
	}
}

func TestDeserializeLegacyPayloadMigratesToV2Model(t *testing.T) {
	cfg, err := DeserializeRunRequest(map[string]any{
		"url": "https://www.wjx.cn/vm/demo.aspx", "target": "12", "threads": "4",
		"submit_interval": []any{"1", "3"}, "answer_duration": []any{"90", "90"},
		"answer_datetime_window": []any{" 2024-03-10 09:00:00 ", "bad"},
		"survey_provider":        surveycore.ProviderWJX, "reverse_fill_threads": "0",
		"dimension_groups": []any{"服务", "服务", "未分组"},
		"question_entries": []any{map[string]any{"question_type": "single", "probabilities": []any{0, 1}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ExecutionPlan.Target != 12 || cfg.ExecutionPlan.Threads != 4 || cfg.ExecutionPlan.SubmitInterval != [2]int{1, 3} {
		t.Fatalf("execution = %#v", cfg.ExecutionPlan)
	}
	if cfg.ExecutionPlan.AnswerDuration != [2]int{81, 99} || cfg.ExecutionPlan.AnswerDatetimeWindow != [2]string{"2024-03-10 09:00:00", ""} {
		t.Fatalf("duration/window = %#v", cfg.ExecutionPlan)
	}
	if len(cfg.AnswerPlan.Dimensions) != 1 || len(cfg.AnswerPlan.Strategies) != 1 || len(cfg.AnswerPlan.Strategies[0].Probabilities.Values()) != 2 {
		t.Fatalf("answers = %#v", cfg.AnswerPlan)
	}
}

func TestLegacyV1AllFieldsMigrateIntoV2Sections(t *testing.T) {
	payload := map[string]any{
		"url":                      "https://wj.qq.com/s2/123/hash/",
		"survey_title":             "旧问卷",
		"survey_provider":          surveycore.ProviderQQ,
		"target":                   12,
		"threads":                  4,
		"submit_interval":          []any{2, 5},
		"answer_duration":          []any{80, 100},
		"answer_datetime_window":   []any{"2026-07-01 08:00:00", "2026-07-01 18:00:00"},
		"random_ip_enabled":        true,
		"proxy_source":             "custom",
		"custom_proxy_api":         "https://proxy.example/api",
		"proxy_area_code":          "110100",
		"random_ua_enabled":        true,
		"random_ua_ratios":         map[string]any{"wechat": 50, "mobile": 25, "pc": 25},
		"fail_stop_enabled":        false,
		"pause_on_aliyun_captcha":  false,
		"reliability_mode_enabled": true,
		"psycho_target_alpha":      0.9,
		"ai_mode":                  "provider",
		"ai_provider":              "custom",
		"ai_api_key":               "sk-legacy",
		"ai_base_url":              "https://ai.example/v1",
		"ai_api_protocol":          "responses",
		"ai_model":                 "demo-model",
		"ai_system_prompt":         "system",
		"reverse_fill_enabled":     true,
		"reverse_fill_source_path": "D:/answers.xlsx",
		"reverse_fill_format":      ReverseFillFormatWJXText,
		"reverse_fill_start_row":   3,
		"reverse_fill_threads":     2,
		"answer_rules":             []any{map[string]any{"id": "r1", "condition_question_num": 1, "condition_mode": "selected", "condition_option_indices": []any{0}, "target_question_num": 1, "action_mode": "force", "target_option_indices": []any{1}}},
		"dimension_groups":         []any{"服务"},
		"question_entries":         []any{map[string]any{"question_type": "single", "question_num": 1, "question_title": "满意度", "option_count": 2, "probabilities": []any{0.25, 0.75}, "dimension": "服务"}},
		"questions_info":           []any{map[string]any{"num": 1, "title": "满意度", "type_code": "3", "options": 2, "provider": surveycore.ProviderQQ, "option_texts": []any{"否", "是"}}},
	}
	if len(payload) != len(legacyFields) {
		t.Fatalf("fixture fields=%d legacy fields=%d", len(payload), len(legacyFields))
	}
	for field := range legacyFields {
		if _, ok := payload[field]; !ok {
			t.Fatalf("legacy fixture misses %q", field)
		}
	}

	document, err := migrateLegacyDocument(payload)
	if err != nil {
		t.Fatal(err)
	}
	if document.SchemaVersion != ConfigSchemaVersion || document.Survey.Title != "旧问卷" || document.Survey.Provider != surveycore.ProviderQQ || len(document.Survey.Definition.Questions) != 1 {
		t.Fatalf("survey = %#v", document.Survey)
	}
	if document.Execution.Target != 12 || document.Execution.Threads != 4 || document.Execution.SubmitInterval != [2]int{2, 5} || document.Execution.AnswerDuration != [2]int{80, 100} || document.Execution.FailStop || document.Execution.PauseOnAliyunCaptcha {
		t.Fatalf("execution = %#v", document.Execution)
	}
	if !document.Network.RandomProxyEnabled || document.Network.ProxySource != "custom" || document.Network.CustomProxyAPI != "https://proxy.example/api" || document.Network.ProxyAreaCode != "110100" || !document.Network.RandomUAEnabled || document.Network.RandomUARatios["wechat"] != 50 {
		t.Fatalf("network = %#v", document.Network)
	}
	if len(document.Answers.Rules) != 1 || len(document.Answers.Dimensions) != 1 || len(document.Answers.Strategies) != 1 || document.Answers.Strategies[0].Probabilities.Options[1] != 0.75 {
		t.Fatalf("answers = %#v", document.Answers)
	}
	if !document.ReverseFill.Enabled || document.ReverseFill.SourcePath != "D:/answers.xlsx" || document.ReverseFill.Format != ReverseFillFormatWJXText || document.ReverseFill.StartRow != 3 || document.ReverseFill.Threads != 2 {
		t.Fatalf("reverse fill = %#v", document.ReverseFill)
	}
	if !document.Psychometrics.Enabled || document.Psychometrics.TargetAlpha != 0.9 {
		t.Fatalf("psychometrics = %#v", document.Psychometrics)
	}
	serialized, err := json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}
	if stringContainsAny(string(serialized), "sk-legacy", "ai_api_key", "aiProfile") {
		t.Fatalf("AI data leaked into v2 document: %s", serialized)
	}
}

func TestDeserializeV2RejectsUnknownFields(t *testing.T) {
	_, err := DeserializeConfigDocument(map[string]any{
		"schemaVersion": ConfigSchemaVersion,
		"survey":        map[string]any{"url": "https://example.test", "provider": surveycore.ProviderWJX, "title": "", "definition": map[string]any{}},
		"execution":     map[string]any{}, "network": map[string]any{}, "answers": map[string]any{},
		"reverseFill": map[string]any{}, "psychometrics": map[string]any{}, "unknown": true,
	})
	if err == nil {
		t.Fatal("expected unknown field error")
	}
}

func TestLoadSaveConfigWritesV2WithoutLegacyAIKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "config.json")
	cfg := surveycore.RunRequest{SurveySource: surveycore.SurveySource{URL: "https://example.test", Provider: surveycore.ProviderWJX}, ExecutionPlan: modelExecution(9, 1)}
	if _, err := Save(cfg, path); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["schemaVersion"] != float64(ConfigSchemaVersion) || payload["ai_api_key"] != nil {
		t.Fatalf("payload = %#v", payload)
	}
	loaded, err := Load(path, true)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ExecutionPlan.Target != 9 {
		t.Fatalf("loaded = %#v", loaded)
	}
}

func TestSaveDocumentReplaceFailurePreservesOriginalFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	original := []byte("original\n")
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}
	previous := replaceConfigFile
	replaceConfigFile = func(string, string) error { return errors.New("replace failed") }
	defer func() { replaceConfigFile = previous }()

	document := ConfigDocumentFromRunRequest(surveycore.RunRequest{
		SurveySource: surveycore.SurveySource{URL: "https://example.test", Provider: surveycore.ProviderWJX},
	})
	if _, err := SaveDocument(document, path); err == nil {
		t.Fatal("expected replace failure")
	}
	actual, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(actual) != string(original) {
		t.Fatalf("original file changed: %q", actual)
	}
}

func TestLoadConfigWithComments(t *testing.T) {
	path := filepath.Join(t.TempDir(), "commented.json")
	if err := os.WriteFile(path, []byte(`{"schemaVersion":2,"survey":{"url":"https://example.com/a//b","provider":"wjx","title":"","definition":{}},"execution":{},"network":{},"answers":{},"reverseFill":{},"psychometrics":{} // keep
}`), 0o644); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load(path, true)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.SurveySource.URL != "https://example.com/a//b" {
		t.Fatalf("loaded = %#v", loaded)
	}
}

func TestRejectLegacyUnknownFields(t *testing.T) {
	_, err := DeserializeRunRequest(map[string]any{"url": "https://example.test", "random_proxy_api": "old"})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestBuildDefaultConfigFilename(t *testing.T) {
	if got := BuildDefaultConfigFilename(`问卷 / 标题`); got != "问卷__标题.json" {
		t.Fatalf("filename = %s", got)
	}
}

func modelExecution(target, threads int) surveycore.ExecutionPlan {
	return surveycore.ExecutionPlan{Target: target, Threads: threads, AnswerDuration: [2]int{60, 120}, FailStop: true}
}

func stringContainsAny(value string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(value, needle) {
			return true
		}
	}
	return false
}
