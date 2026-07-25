package tencent

import (
	"fmt"
	"strings"
)

func buildOptionTexts(question map[string]any, providerType string) []string {
	switch providerType {
	case "nps", "star":
		start := intValue(question["star_begin_num"])
		count := maxInt(0, intValue(question["star_num"]))
		values := make([]string, 0, count)
		for i := 0; i < count; i++ {
			values = append(values, fmt.Sprintf("%d", start+i))
		}
		return values
	case "matrix_star":
		count := maxInt(0, intValue(question["star_num"]))
		values := make([]string, 0, count)
		for i := 0; i < count; i++ {
			values = append(values, fmt.Sprintf("%d", i+1))
		}
		return values
	default:
		options := asMapList(question["options"])
		values := make([]string, 0, len(options))
		for _, option := range options {
			values = append(values, cleanOptionText(option["text"]))
		}
		return cleanTextList(values)
	}
}

func buildRowTexts(question map[string]any) []string {
	rows := asMapList(question["sub_titles"])
	values := make([]string, 0, len(rows))
	for _, row := range rows {
		values = append(values, normalizeText(row["text"]))
	}
	return cleanTextList(values)
}

func resolveOptionCount(question map[string]any, providerType string, optionTexts []string) int {
	if providerType == "description" {
		return 0
	}
	if providerType == "nps" || providerType == "star" || providerType == "matrix_star" {
		return maxInt(len(optionTexts), intValue(question["star_num"]))
	}
	if len(optionTexts) > 0 {
		return len(optionTexts)
	}
	return len(asMapList(question["options"]))
}

func buildFillableOptionIndices(question map[string]any, providerType string) []int {
	if providerType != "radio" && providerType != "checkbox" && providerType != "select" {
		return nil
	}
	options := asMapList(question["options"])
	result := make([]int, 0)
	for index, option := range options {
		if containsFillBlank(option, 0) {
			result = append(result, index)
		}
	}
	return result
}

func containsFillBlank(value any, depth int) bool {
	if depth > 4 || value == nil {
		return false
	}
	switch typed := value.(type) {
	case map[string]any:
		for key, item := range typed {
			if strings.Contains(strings.ToLower(key), "fillblank") || containsFillBlank(item, depth+1) {
				return true
			}
		}
	case []any:
		for _, item := range typed {
			if containsFillBlank(item, depth+1) {
				return true
			}
		}
	default:
		return fillBlankTokenRE.MatchString(stringValue(value))
	}
	return false
}

func multiLimits(question map[string]any, providerType string) (*int, *int) {
	if providerType != "checkbox" {
		return nil, nil
	}
	minValue := intValue(question["min_length"])
	maxValue := intValue(question["max_length"])
	var minPtr *int
	var maxPtr *int
	if minValue > 0 {
		minPtr = &minValue
	}
	if maxValue > 0 {
		maxPtr = &maxValue
	}
	return minPtr, maxPtr
}

func ratingMax(providerType string, optionCount int) int {
	if providerType == "nps" || providerType == "star" {
		return optionCount
	}
	return 0
}

func textInputs(providerType string) int {
	if providerType == "text" || providerType == "textarea" {
		return 1
	}
	return 0
}

func unsupportedReason(providerType string) string {
	if label := blockedRuntimeProviderTypes[providerType]; label != "" {
		return "当前版本暂不支持腾讯问卷" + label + "题"
	}
	if providerType == "" || supportedProviderTypes[providerType] {
		return ""
	}
	return "暂不支持腾讯题型：" + providerType
}
