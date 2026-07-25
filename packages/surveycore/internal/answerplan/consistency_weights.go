package answerplan

func applyRuleToProbabilities(values []float64, rule answerRule) ([]float64, bool) {
	if len(values) == 0 || len(rule.targetOptionIndices) == 0 {
		return nil, false
	}
	targets := map[int]bool{}
	for _, index := range rule.targetOptionIndices {
		if index >= 0 && index < len(values) {
			targets[index] = true
		}
	}
	if len(targets) == 0 {
		return nil, false
	}
	adjusted := make([]float64, len(values))
	switch rule.targetMode {
	case actionMustSelect:
		for index, value := range values {
			if targets[index] {
				adjusted[index] = value
			}
		}
	case actionMustNotSelect:
		for index, value := range values {
			if !targets[index] {
				adjusted[index] = value
			}
		}
	default:
		return nil, false
	}
	if positiveTotal(adjusted) <= 0 {
		return nil, false
	}
	return adjusted, true
}

func applyRuleToMultipleProbabilities(values []float64, rule answerRule) ([]float64, bool) {
	if len(values) == 0 || len(rule.targetOptionIndices) == 0 {
		return nil, false
	}
	targets := map[int]bool{}
	for _, index := range rule.targetOptionIndices {
		if index >= 0 && index < len(values) {
			targets[index] = true
		}
	}
	if len(targets) == 0 {
		return nil, false
	}
	adjusted := append([]float64(nil), values...)
	switch rule.targetMode {
	case actionMustSelect:
		for index := range targets {
			adjusted[index] = 100
		}
	case actionMustNotSelect:
		for index := range targets {
			adjusted[index] = 0
		}
	default:
		return nil, false
	}
	if positiveTotal(adjusted) <= 0 {
		return nil, false
	}
	return adjusted, true
}

func fitProbabilityCount(values []float64, count int) []float64 {
	if count <= 0 {
		return nil
	}
	result := make([]float64, count)
	copy(result, values)
	if positiveTotal(result) <= 0 {
		for i := range result {
			result[i] = 1
		}
	}
	return result
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
