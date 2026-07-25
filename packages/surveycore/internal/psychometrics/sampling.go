package psychometrics

import (
	"math"
	"math/rand"
)

func evaluateDimension(items []Item, sampleCount int, targetAlpha float64) map[string][]int {
	theta := randomVector(sampleCount)
	standardNoise := randomMatrix(len(items), sampleCount)
	microNoise := randomMatrix(len(items), sampleCount)
	reversed := reversedKeys(items)
	type candidate struct {
		sigma   float64
		alpha   float64
		choices map[string][]int
	}
	candidates := make([]candidate, 0)
	for _, sigma := range sigmaCandidates(targetAlpha, len(items)) {
		alpha, choices := evaluate(items, sampleCount, sigma, theta, reversed, standardNoise, microNoise)
		candidates = append(candidates, candidate{sigma: sigma, alpha: alpha, choices: choices})
	}
	best := candidates[0]
	for _, candidate := range candidates[1:] {
		if alphaFitLess(candidate.alpha, best.alpha, targetAlpha) {
			best = candidate
		}
	}
	return best.choices
}

func evaluate(items []Item, sampleCount int, sigma float64, theta []float64, reversed map[string]bool, standardNoise [][]float64, microNoise [][]float64) (float64, map[string][]int) {
	choicesByItem := map[string][]int{}
	responseRows := make([][]float64, sampleCount)
	for sampleIndex := range responseRows {
		responseRows[sampleIndex] = make([]float64, len(items))
	}
	for itemIndex, item := range items {
		key := item.choiceKey()
		quotas := integerQuotas(item.TargetProbabilities, sampleCount)
		sign := 1.0
		if reversed[key] {
			sign = -1.0
		}
		scores := make([]float64, sampleCount)
		for sampleIndex := 0; sampleIndex < sampleCount; sampleIndex++ {
			scores[sampleIndex] = sign*theta[sampleIndex] + sigma*standardNoise[itemIndex][sampleIndex] + microJitterSigma*microNoise[itemIndex][sampleIndex]
		}
		scoreIndexes := assignChoicesFromScores(scores, quotas)
		choices := make([]int, sampleCount)
		for sampleIndex, scoreIndex := range scoreIndexes {
			choices[sampleIndex] = item.choiceIndexForScore(scoreIndex)
			if reversed[key] {
				responseRows[sampleIndex][itemIndex] = float64(item.OptionCount - scoreIndex)
			} else {
				responseRows[sampleIndex][itemIndex] = float64(scoreIndex + 1)
			}
		}
		choicesByItem[key] = choices
	}
	return cronbachAlpha(responseRows), choicesByItem
}

func randomVector(count int) []float64 {
	values := make([]float64, count)
	for i := range values {
		values[i] = rand.NormFloat64()
	}
	return values
}

func randomMatrix(rows int, cols int) [][]float64 {
	matrix := make([][]float64, rows)
	for row := range matrix {
		matrix[row] = randomVector(cols)
	}
	return matrix
}

func integerQuotas(probabilities []float64, sampleCount int) []int {
	normalized := normalizeProbabilityList(probabilities)
	if sampleCount <= 0 {
		return make([]int, len(normalized))
	}
	quotas := make([]int, len(normalized))
	remainders := make([]float64, len(normalized))
	total := 0
	for index, value := range normalized {
		raw := value * float64(sampleCount)
		quotas[index] = int(math.Floor(raw))
		remainders[index] = raw - float64(quotas[index])
		total += quotas[index]
	}
	remaining := sampleCount - total
	for remaining > 0 {
		best := 0
		for index := range normalized {
			if remainders[index] > remainders[best] || (remainders[index] == remainders[best] && normalized[index] > normalized[best]) {
				best = index
			}
		}
		quotas[best]++
		remainders[best] = -1
		remaining--
	}
	return quotas
}

func assignChoicesFromScores(scores []float64, quotas []int) []int {
	sampleCount := len(scores)
	orderedChoices := make([]int, 0, sampleCount)
	for optionIndex, quota := range quotas {
		for i := 0; i < quota; i++ {
			orderedChoices = append(orderedChoices, optionIndex)
		}
	}
	for len(orderedChoices) < sampleCount {
		orderedChoices = append(orderedChoices, maxInt(0, len(quotas)-1))
	}
	if len(orderedChoices) > sampleCount {
		orderedChoices = orderedChoices[:sampleCount]
	}
	ranked := make([]int, sampleCount)
	for i := range ranked {
		ranked[i] = i
	}
	for i := 0; i < len(ranked); i++ {
		for j := i + 1; j < len(ranked); j++ {
			if scores[ranked[j]] < scores[ranked[i]] {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}
	assigned := make([]int, sampleCount)
	for orderIndex, sampleIndex := range ranked {
		assigned[sampleIndex] = orderedChoices[orderIndex]
	}
	return assigned
}

func reversedKeys(items []Item) map[string]bool {
	orientations := make(map[string]string, len(items))
	leftStrength := 0.0
	rightStrength := 0.0
	for _, item := range items {
		direction, strength := itemOrientation(item)
		orientations[item.choiceKey()] = direction
		if direction == "left" {
			leftStrength += strength
		}
		if direction == "right" {
			rightStrength += strength
		}
	}
	anchor := "center"
	anchorStrength := leftStrength
	weaker := rightStrength
	if rightStrength > leftStrength {
		anchor = "right"
		anchorStrength = rightStrength
		weaker = leftStrength
	} else if leftStrength > rightStrength {
		anchor = "left"
	}
	ambiguous := anchor == "center" || anchorStrength < 0.2 || anchorStrength <= weaker*1.15
	result := map[string]bool{}
	if ambiguous {
		return result
	}
	for key, direction := range orientations {
		if (direction == "left" || direction == "right") && direction != anchor {
			result[key] = true
		}
	}
	return result
}

func itemOrientation(item Item) (string, float64) {
	probabilities := normalizeProbabilityList(item.TargetProbabilities)
	mean := 0.0
	for index, value := range probabilities {
		mean += float64(index) * value
	}
	ratio := mean / float64(maxInt(1, item.OptionCount-1))
	direction := "center"
	if ratio <= 0.4 {
		direction = "left"
	} else if ratio >= 0.6 {
		direction = "right"
	}
	return direction, math.Abs(ratio - 0.5)
}
