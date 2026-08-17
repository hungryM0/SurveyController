package answerplan

import (
	"math"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

func FillTextAt(values []*string, index int) string {
	if index < 0 || index >= len(values) || values[index] == nil {
		return ""
	}
	return strings.TrimSpace(*values[index])
}

func OptionFillText(entry model.QuestionStrategy, question model.QuestionMeta, index int) string {
	text := FillTextAt(entry.OptionFillTexts, index)
	if text == "__AI_FILL__" {
		return defaultFillText
	}
	if text != "" {
		return resolveDynamicTextToken(text)
	}
	if optionRequiresFill(entry, question, index) {
		return defaultFillText
	}
	return ""
}

func optionRequiresFill(entry model.QuestionStrategy, question model.QuestionMeta, index int) bool {
	if index < 0 {
		return false
	}
	for _, value := range entry.FillableOptionIndices {
		if value == index {
			return true
		}
	}
	for _, value := range question.FillableOptions {
		if value == index {
			return true
		}
	}
	return false
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if text := strings.TrimSpace(value); text != "" {
			return text
		}
	}
	return ""
}

func clampFloat(value float64, minValue float64, maxValue float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return minValue
	}
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}
