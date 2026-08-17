package psychometrics

import (
	"regexp"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

func inferOrdinalOptionMapping(optionTexts []string) ([]int, bool) {
	texts := make([]string, 0, len(optionTexts))
	for _, text := range optionTexts {
		normalized := strings.Join(strings.Fields(strings.TrimSpace(text)), "")
		if normalized != "" {
			texts = append(texts, normalized)
		}
	}
	if len(texts) < 2 {
		return nil, false
	}
	if scores, ok := numericOrdinalMapping(texts); ok {
		return scores, true
	}
	groups := [][]string{
		{"非常不满意", "不满意", "一般", "满意", "非常满意"},
		{"非常不同意", "不同意", "一般", "同意", "非常同意"},
		{"很差", "较差", "一般", "较好", "很好"},
		{"从不", "偶尔", "有时", "经常", "总是"},
	}
	for _, group := range groups {
		if len(texts) == len(group) && equalStrings(texts, group) {
			return rangeInts(len(texts)), true
		}
		reversed := reverseStrings(group)
		if len(texts) == len(reversed) && equalStrings(texts, reversed) {
			return reverseInts(len(texts)), true
		}
	}
	return nil, false
}

func numericOrdinalMapping(texts []string) ([]int, bool) {
	re := regexp.MustCompile(`^\d+`)
	values := make([]int, 0, len(texts))
	for _, text := range texts {
		match := re.FindString(text)
		if match == "" {
			return nil, false
		}
		values = append(values, atoi(match))
	}
	if len(values) < 2 {
		return nil, false
	}
	increasing := true
	decreasing := true
	for index := 1; index < len(values); index++ {
		increasing = increasing && values[index] == values[index-1]+1
		decreasing = decreasing && values[index] == values[index-1]-1
	}
	if increasing {
		return rangeInts(len(values)), true
	}
	if decreasing {
		return reverseInts(len(values)), true
	}
	return nil, false
}

func normalizeKind(question model.QuestionMeta, entry model.QuestionStrategy) string {
	kind := strings.TrimSpace(string(entry.QuestionType))
	if kind == "" {
		kind = strings.TrimSpace(question.ProviderType)
	}
	switch kind {
	case "single", "multiple", "dropdown", "scale", "matrix", "order", "slider", "text", "score":
		return kind
	case "radio":
		return "single"
	case "checkbox":
		return "multiple"
	case "select":
		return "dropdown"
	case "matrix_radio":
		return "matrix"
	case "textarea", "multi_text":
		return "text"
	}
	if kind != "" {
		return ""
	}
	switch question.TypeCode {
	case "3":
		return "single"
	case "4":
		return "multiple"
	case "5":
		return "scale"
	case "6":
		return "matrix"
	case "7":
		return "dropdown"
	case "8":
		return "slider"
	case "11":
		return "order"
	default:
		if question.IsTextLike || question.TextInputs > 0 {
			return "text"
		}
		return ""
	}
}
