package configio

import (
	"math"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore"
)

var reverseFillFormats = map[string]bool{
	ReverseFillFormatAuto: true, ReverseFillFormatWJXSequence: true,
	ReverseFillFormatWJXScore: true, ReverseFillFormatWJXText: true,
}

func normalizedDuration(value any) [2]int {
	if pair, ok := value.([2]int); ok {
		return pair
	}
	return normalizeAnswerDuration(value)
}

func normalizeProvider(raw any, rawURL any) string {
	value := strings.ToLower(strings.TrimSpace(stringValue(raw)))
	if value == surveycore.ProviderWJX || value == surveycore.ProviderQQ || value == surveycore.ProviderCredamo {
		return value
	}
	url := strings.ToLower(strings.TrimSpace(stringValue(rawURL)))
	if strings.Contains(url, "wj.qq.com") {
		return surveycore.ProviderQQ
	}
	if strings.Contains(url, "credamo") {
		return surveycore.ProviderCredamo
	}
	return surveycore.ProviderWJX
}

func normalizeProxySource(raw any) string {
	value := strings.ToLower(strings.TrimSpace(stringValue(raw)))
	if value == "benefit" || value == "custom" || value == "default" {
		return value
	}
	return "default"
}

func normalizeReverseFillFormat(raw any) string {
	value := strings.ToLower(strings.TrimSpace(stringValue(raw)))
	if reverseFillFormats[value] {
		return value
	}
	return ReverseFillFormatAuto
}

func normalizeTargetAlpha(raw any) float64 {
	value := floatValue(raw, 0.85)
	if value <= 0 || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0.85
	}
	if value > 1 {
		return 1
	}
	return value
}

func normalizeRandomUARatios(raw any) map[string]int {
	defaults := map[string]int{"wechat": 33, "mobile": 33, "pc": 34}
	mapped, ok := raw.(map[string]any)
	if !ok {
		return defaults
	}
	result := map[string]int{}
	sum := 0
	for _, key := range []string{"wechat", "mobile", "pc"} {
		value := intValue(mapped[key], -1)
		if value < 0 || value > 100 {
			return defaults
		}
		result[key] = value
		sum += value
	}
	if sum != 100 {
		return defaults
	}
	return result
}

func normalizeStringList(raw any) []string {
	values, ok := raw.([]any)
	if !ok {
		return nil
	}
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		text := strings.TrimSpace(stringValue(value))
		if text == "" || text == "未分组" || seen[text] {
			continue
		}
		seen[text] = true
		result = append(result, text)
	}
	return result
}

func normalizeAnswerDuration(raw any) [2]int {
	pair := intPair(raw, [2]int{60, 120})
	if pair[0] == pair[1] {
		if pair[0] <= 0 {
			return [2]int{60, 120}
		}
		low := int(math.Round(float64(pair[0]) * 0.9))
		high := int(math.Round(float64(pair[0]) * 1.1))
		return [2]int{minInt(low, 1800), minInt(high, 1800)}
	}
	if pair[1] < pair[0] {
		pair[1] = pair[0]
	}
	return [2]int{minInt(maxInt(pair[0], 0), 1800), minInt(maxInt(pair[1], 0), 1800)}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
