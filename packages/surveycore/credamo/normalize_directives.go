package credamo

import (
	"strconv"
	"strings"
)

func forcedOption(title string, optionTexts []string, extra []any) (*int, string) {
	for _, fragment := range fragments(title, extra) {
		match := forceSelectCommandRE.FindStringSubmatch(fragment)
		if len(match) == 0 {
			continue
		}
		if match[1] != "" {
			index, _ := strconv.Atoi(match[1])
			index--
			if index >= 0 && index < len(optionTexts) {
				return &index, optionTexts[index]
			}
		}
		target := normalizeText(firstAny(match[2], match[3]))
		if target == "" {
			continue
		}
		for index, option := range optionTexts {
			if strings.EqualFold(optionLabel(option), target) || strings.Contains(normalizeText(option), target) || strings.Contains(target, normalizeText(option)) {
				idx := index
				return &idx, option
			}
		}
	}
	return nil, ""
}

func arithmeticOption(title string, optionTexts []string, extra []any) (*int, string) {
	for _, fragment := range fragments(title, extra) {
		match := arithmeticRE.FindStringSubmatch(fragment)
		if len(match) < 4 {
			continue
		}
		result, ok := evalSimple(match[1], match[2], match[3])
		if !ok {
			continue
		}
		for index, option := range optionTexts {
			if value, ok := firstNumber(option); ok && value == result {
				idx := index
				return &idx, option
			}
		}
	}
	return nil, ""
}

func forcedTexts(title string, extra []any) []string {
	result := make([]string, 0)
	seen := map[string]bool{}
	for _, fragment := range fragments(title, extra) {
		for _, match := range forceTextRE.FindAllStringSubmatch(fragment, -1) {
			if len(match) < 2 {
				continue
			}
			text := normalizeText(match[1])
			if text != "" && !seen[text] {
				seen[text] = true
				result = append(result, text)
			}
		}
	}
	return result
}

func multiLimitsFromText(title string, optionCount int, extra []any) (*int, *int) {
	var minPtr *int
	var maxPtr *int
	for _, fragment := range fragments(title, extra) {
		for _, match := range multiLimitRE.FindAllStringSubmatch(fragment, -1) {
			if len(match) < 3 {
				continue
			}
			value, _ := strconv.Atoi(match[2])
			if optionCount > 0 && value > optionCount {
				value = optionCount
			}
			switch match[1] {
			case "至少", "最少", "不少于":
				minPtr = mergeMin(minPtr, value)
			default:
				maxPtr = mergeMax(maxPtr, value)
			}
		}
		if match := multiRangeRE.FindStringSubmatch(fragment); len(match) >= 3 {
			minValue, _ := strconv.Atoi(match[1])
			maxValue, _ := strconv.Atoi(match[2])
			if minValue > maxValue {
				minValue, maxValue = maxValue, minValue
			}
			minPtr = mergeMin(minPtr, minValue)
			maxPtr = mergeMax(maxPtr, maxValue)
		}
	}
	if minPtr != nil && maxPtr != nil && *minPtr > *maxPtr {
		*minPtr = *maxPtr
	}
	return minPtr, maxPtr
}

func fragments(title string, extra []any) []string {
	result := make([]string, 0, len(extra)+1)
	seen := map[string]bool{}
	for _, item := range append([]any{title}, extra...) {
		text := normalizeText(item)
		if text != "" && !seen[text] {
			seen[text] = true
			result = append(result, text)
		}
	}
	return result
}

func optionLabel(text string) string {
	trimmed := strings.TrimSpace(text)
	if strings.HasPrefix(trimmed, "(") && len(trimmed) >= 2 {
		return strings.ToUpper(trimmed[1:2])
	}
	return ""
}

func evalSimple(left string, op string, right string) (float64, bool) {
	l, err := strconv.ParseFloat(strings.TrimSpace(left), 64)
	if err != nil {
		return 0, false
	}
	r, err := strconv.ParseFloat(strings.TrimSpace(right), 64)
	if err != nil {
		return 0, false
	}
	switch op {
	case "+":
		return l + r, true
	case "-":
		return l - r, true
	case "*", "×", "x", "X":
		return l * r, true
	case "/", "÷":
		if r == 0 {
			return 0, false
		}
		return l / r, true
	default:
		return 0, false
	}
}

func firstNumber(text string) (float64, bool) {
	match := numberRE.FindString(text)
	if match == "" {
		return 0, false
	}
	value, err := strconv.ParseFloat(match, 64)
	return value, err == nil
}

func mergeMin(current *int, value int) *int {
	if value <= 0 {
		return current
	}
	if current == nil || value > *current {
		next := value
		return &next
	}
	return current
}

func mergeMax(current *int, value int) *int {
	if value <= 0 {
		return current
	}
	if current == nil || value < *current {
		next := value
		return &next
	}
	return current
}
