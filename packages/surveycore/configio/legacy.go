package configio

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore"
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

var legacyFields = map[string]bool{
	"url": true, "survey_title": true, "survey_provider": true,
	"target": true, "threads": true, "submit_interval": true,
	"answer_duration": true, "answer_datetime_window": true,
	"random_ip_enabled": true, "proxy_source": true, "custom_proxy_api": true,
	"proxy_area_code": true, "random_ua_enabled": true, "random_ua_ratios": true,
	"fail_stop_enabled": true, "pause_on_aliyun_captcha": true,
	"reliability_mode_enabled": true, "psycho_target_alpha": true,
	"ai_mode": true, "ai_provider": true, "ai_api_key": true,
	"ai_base_url": true, "ai_api_protocol": true, "ai_model": true,
	"ai_system_prompt": true, "reverse_fill_enabled": true,
	"reverse_fill_source_path": true, "reverse_fill_format": true,
	"reverse_fill_start_row": true, "reverse_fill_threads": true,
	"answer_rules": true, "dimension_groups": true,
	"question_entries": true, "questions_info": true,
}

func NormalizeRunRequestPayload(raw map[string]any) map[string]any {
	result := map[string]any{}
	for key, value := range raw {
		result[key] = value
	}
	result["url"] = strings.TrimSpace(stringValue(raw["url"]))
	result["survey_provider"] = normalizeProvider(raw["survey_provider"], result["url"])
	result["target"] = positiveInt(raw["target"], 1)
	result["threads"] = positiveInt(raw["threads"], 1)
	result["submit_interval"] = intPair(raw["submit_interval"], [2]int{})
	result["answer_duration"] = normalizeAnswerDuration(raw["answer_duration"])
	result["answer_datetime_window"] = model.NormalizeAnswerDatetimeWindow(stringPair(raw["answer_datetime_window"]))
	result["random_ip_enabled"] = boolValue(raw["random_ip_enabled"], false)
	result["proxy_source"] = normalizeProxySource(raw["proxy_source"])
	result["custom_proxy_api"] = strings.TrimSpace(stringValue(raw["custom_proxy_api"]))
	result["proxy_area_code"] = strings.TrimSpace(stringValue(raw["proxy_area_code"]))
	result["random_ua_enabled"] = boolValue(raw["random_ua_enabled"], false)
	result["random_ua_ratios"] = normalizeRandomUARatios(raw["random_ua_ratios"])
	result["fail_stop_enabled"] = boolValue(raw["fail_stop_enabled"], true)
	result["pause_on_aliyun_captcha"] = boolValue(raw["pause_on_aliyun_captcha"], true)
	result["reliability_mode_enabled"] = boolValue(raw["reliability_mode_enabled"], true)
	result["psycho_target_alpha"] = normalizeTargetAlpha(raw["psycho_target_alpha"])
	result["reverse_fill_enabled"] = boolValue(raw["reverse_fill_enabled"], false)
	result["reverse_fill_source_path"] = strings.TrimSpace(stringValue(raw["reverse_fill_source_path"]))
	result["reverse_fill_format"] = normalizeReverseFillFormat(raw["reverse_fill_format"])
	result["reverse_fill_start_row"] = positiveInt(raw["reverse_fill_start_row"], 1)
	result["reverse_fill_threads"] = positiveInt(raw["reverse_fill_threads"], positiveInt(raw["threads"], 1))
	result["dimension_groups"] = normalizeStringList(raw["dimension_groups"])
	return result
}

func migrateLegacyPayload(raw map[string]any) (surveycore.RunRequest, error) {
	for key := range raw {
		if !legacyFields[key] {
			return surveycore.RunRequest{}, fmt.Errorf("该配置文件损坏：配置包含不支持的字段（%s）", key)
		}
	}
	normalized := NormalizeRunRequestPayload(raw)
	definition := model.SurveyDefinition{Title: stringValue(raw["survey_title"]), Provider: stringValue(raw["survey_provider"])}
	if questions, err := decodeQuestions(raw["questions_info"]); err != nil {
		return surveycore.RunRequest{}, fmt.Errorf("旧配置题目快照无效：%w", err)
	} else {
		definition.Questions = questions
	}
	answers, err := decodeAnswerPlan(raw)
	if err != nil {
		return surveycore.RunRequest{}, err
	}
	return surveycore.RunRequest{
		SurveySource:     model.SurveySource{URL: stringValue(normalized["url"]), Provider: normalizeProvider(raw["survey_provider"], normalized["url"])},
		SurveyDefinition: definition,
		ExecutionPlan: model.ExecutionPlan{
			Target: positiveInt(normalized["target"], 1), Threads: positiveInt(normalized["threads"], 1),
			SubmitInterval: intPair(normalized["submit_interval"], [2]int{}), AnswerDuration: normalizedDuration(normalized["answer_duration"]),
			AnswerDatetimeWindow: stringPair(normalized["answer_datetime_window"]), FailStop: boolValue(normalized["fail_stop_enabled"], true),
			PauseOnAliyunCaptcha: boolValue(normalized["pause_on_aliyun_captcha"], true),
		},
		AnswerPlan:         answers,
		ReverseFillPlan:    model.ReverseFillPlan{Enabled: boolValue(normalized["reverse_fill_enabled"], false), SourcePath: stringValue(normalized["reverse_fill_source_path"]), Format: normalizeReverseFillFormat(normalized["reverse_fill_format"]), StartRow: positiveInt(normalized["reverse_fill_start_row"], 1), Threads: positiveInt(normalized["reverse_fill_threads"], 1)},
		PsychometricPolicy: model.PsychometricPolicy{Enabled: boolValue(normalized["reliability_mode_enabled"], true), TargetAlpha: normalizeTargetAlpha(normalized["psycho_target_alpha"])},
	}, nil
}

func migrateLegacyDocument(raw map[string]any) (ConfigDocument, error) {
	request, err := migrateLegacyPayload(raw)
	if err != nil {
		return ConfigDocument{}, err
	}
	normalized := NormalizeRunRequestPayload(raw)
	ratios, _ := normalized["random_ua_ratios"].(map[string]int)
	document := ConfigDocumentFromRunRequest(request)
	document.Network = NetworkSettings{
		RandomProxyEnabled: boolValue(normalized["random_ip_enabled"], false),
		ProxySource:        normalizeProxySource(normalized["proxy_source"]),
		CustomProxyAPI:     strings.TrimSpace(stringValue(normalized["custom_proxy_api"])),
		ProxyAreaCode:      strings.TrimSpace(stringValue(normalized["proxy_area_code"])),
		RandomUAEnabled:    boolValue(normalized["random_ua_enabled"], false),
		RandomUARatios:     cloneIntValues(ratios),
	}
	return document, nil
}

func decodeAnswerPlan(raw map[string]any) (model.AnswerPlan, error) {
	plan := model.AnswerPlan{Dimensions: normalizeStringList(raw["dimension_groups"])}
	if value, ok := raw["answer_rules"]; ok {
		data, err := json.Marshal(value)
		if err != nil {
			return plan, err
		}
		if err := json.Unmarshal(data, &plan.Rules); err != nil {
			return plan, fmt.Errorf("旧配置条件规则无效：%w", err)
		}
	}
	if value, ok := raw["question_entries"]; ok {
		data, err := json.Marshal(value)
		if err != nil {
			return plan, err
		}
		var entries []map[string]json.RawMessage
		if err := json.Unmarshal(data, &entries); err != nil {
			return plan, fmt.Errorf("旧配置题目策略无效：%w", err)
		}
		for _, entry := range entries {
			if rawWeights, ok := entry["probabilities"]; ok {
				var values []float64
				if json.Unmarshal(rawWeights, &values) == nil {
					encoded, _ := json.Marshal(model.OptionWeights(values...))
					entry["probabilities"] = encoded
				}
			}
			if rawWeights, ok := entry["custom_weights"]; ok {
				var values []float64
				if json.Unmarshal(rawWeights, &values) == nil {
					encoded, _ := json.Marshal(model.OptionWeights(values...))
					entry["custom_weights"] = encoded
				}
			}
			encoded, _ := json.Marshal(entry)
			var strategy model.QuestionStrategy
			if err := json.Unmarshal(encoded, &strategy); err != nil {
				return plan, fmt.Errorf("旧配置题目策略无效：%w", err)
			}
			plan.Strategies = append(plan.Strategies, strategy)
		}
	}
	return plan, nil
}

func decodeQuestions(value any) ([]model.QuestionMeta, error) {
	if value == nil {
		return nil, nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var questions []model.QuestionMeta
	if err := json.Unmarshal(data, &questions); err != nil {
		return nil, err
	}
	return questions, nil
}
