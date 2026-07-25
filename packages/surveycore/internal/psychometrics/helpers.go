package psychometrics

import "surveycontroller/surveycore/internal/model"

func cloneEntries(src []model.QuestionStrategy) []model.QuestionStrategy {
	return model.CloneQuestionStrategies(src)
}

func cloneIntPtr(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func equalStrings(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func reverseStrings(values []string) []string {
	result := make([]string, len(values))
	for index := range values {
		result[index] = values[len(values)-1-index]
	}
	return result
}

func rangeInts(count int) []int {
	values := make([]int, count)
	for i := range values {
		values[i] = i
	}
	return values
}

func reverseInts(count int) []int {
	values := make([]int, count)
	for i := range values {
		values[i] = count - 1 - i
	}
	return values
}

func positiveTotal(values []float64) float64 {
	total := 0.0
	for _, value := range values {
		if value > 0 {
			total += value
		}
	}
	return total
}

func atoi(value string) int {
	result := 0
	for _, ch := range value {
		if ch < '0' || ch > '9' {
			break
		}
		result = result*10 + int(ch-'0')
	}
	return result
}

func strconvItoa(value int) string {
	if value == 0 {
		return "0"
	}
	sign := ""
	if value < 0 {
		sign = "-"
		value = -value
	}
	digits := make([]byte, 0, 10)
	for value > 0 {
		digits = append(digits, byte('0'+value%10))
		value /= 10
	}
	for i, j := 0, len(digits)-1; i < j; i, j = i+1, j-1 {
		digits[i], digits[j] = digits[j], digits[i]
	}
	return sign + string(digits)
}

func clampInt(value int, minValue int, maxValue int) int {
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
