package answerplan

import (
	"strconv"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

const (
	defaultFillText      = "无"
	multiTextDelimiter   = "||"
	randomNameToken      = "__RANDOM_NAME__"
	randomMobileToken    = "__RANDOM_MOBILE__"
	randomIDCardToken    = "__RANDOM_ID_CARD__"
	randomGenericText    = "__RANDOM_TEXT__"
	randomIntTokenPrefix = "__RANDOM_INT__:"
	textRandomNone       = "none"
	textRandomName       = "name"
	textRandomMobile     = "mobile"
	textRandomIDCard     = "id_card"
	textRandomInteger    = "integer"
	defaultSliderValue   = "50"
)

func ResolveTextValues(entry model.QuestionStrategy, question model.QuestionMeta, blankCount int) []string {
	return ResolveTextValuesWithPersona(entry, question, blankCount, nil)
}

func ResolveTextValuesWithPersona(entry model.QuestionStrategy, question model.QuestionMeta, blankCount int, persona *model.Persona) []string {
	count := maxInt(1, blankCount)
	candidates := normalizedTexts(entry.Texts)
	if len(candidates) == 0 {
		candidates = normalizedTexts(question.ForcedTexts)
	}
	if len(candidates) == 0 {
		candidates = []string{defaultFillText}
	}
	selected := candidates[SelectedTextIndex(candidates, entry.Probabilities)]
	values := []string{resolveDynamicTextTokenWithPersona(selected, persona)}
	if normalizeTextRandomMode(entry.TextRandomMode) == textRandomNone && strings.Contains(selected, multiTextDelimiter) {
		values = values[:0]
		for _, part := range strings.Split(selected, multiTextDelimiter) {
			values = append(values, resolveDynamicTextTokenWithPersona(part, persona))
		}
	}
	if mode := normalizeTextRandomMode(entry.TextRandomMode); mode != textRandomNone {
		values = []string{randomValueForMode(mode, entry.TextRandomIntRange, persona)}
	}
	if len(values) == 0 {
		values = []string{defaultFillText}
	}
	for len(values) < count {
		values = append(values, values[len(values)-1])
	}
	values = values[:count]
	for index := range values {
		mode := textRandomNone
		if index < len(entry.MultiTextBlankModes) {
			mode = normalizeTextRandomMode(entry.MultiTextBlankModes[index])
		}
		if mode != textRandomNone {
			var intRange []int
			if index < len(entry.MultiTextBlankIntRanges) {
				intRange = entry.MultiTextBlankIntRanges[index]
			}
			values[index] = randomValueForMode(mode, intRange, persona)
		}
		values[index] = firstNonEmpty(values[index], defaultFillText)
	}
	return values
}

func normalizedTexts(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if text := strings.TrimSpace(value); text != "" {
			result = append(result, text)
		}
	}
	return result
}

func normalizeTextRandomMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case textRandomName:
		return textRandomName
	case textRandomMobile:
		return textRandomMobile
	case textRandomIDCard:
		return textRandomIDCard
	case textRandomInteger:
		return textRandomInteger
	default:
		return textRandomNone
	}
}

func randomValueForMode(mode string, intRange []int, persona *model.Persona) string {
	switch normalizeTextRandomMode(mode) {
	case textRandomName:
		return randomChineseName(persona)
	case textRandomMobile:
		return randomMobile()
	case textRandomIDCard:
		return randomIDCard(persona)
	case textRandomInteger:
		return randomIntegerText(intRange)
	default:
		return defaultFillText
	}
}

func resolveDynamicTextToken(value string) string {
	return resolveDynamicTextTokenWithPersona(value, nil)
}

func resolveDynamicTextTokenWithPersona(value string, persona *model.Persona) string {
	text := strings.TrimSpace(value)
	switch text {
	case "":
		return defaultFillText
	case randomNameToken:
		return randomChineseName(persona)
	case randomMobileToken:
		return randomMobile()
	case randomIDCardToken:
		return randomIDCard(persona)
	case randomGenericText:
		return randomGeneric()
	}
	if minValue, maxValue, ok := parseRandomIntToken(text); ok {
		return strconv.Itoa(randomIntInRange(minValue, maxValue))
	}
	return text
}

func parseRandomIntToken(token string) (int, int, bool) {
	if !strings.HasPrefix(token, randomIntTokenPrefix) {
		return 0, 0, false
	}
	payload := strings.TrimPrefix(token, randomIntTokenPrefix)
	parts := strings.SplitN(payload, ":", 2)
	if len(parts) != 2 {
		return 0, 0, false
	}
	minValue, errMin := strconv.Atoi(strings.TrimSpace(parts[0]))
	maxValue, errMax := strconv.Atoi(strings.TrimSpace(parts[1]))
	if errMin != nil || errMax != nil {
		return 0, 0, false
	}
	if minValue > maxValue {
		minValue, maxValue = maxValue, minValue
	}
	return minValue, maxValue, true
}
