package psychometrics

import "math"

func normalizeTargetAlpha(value float64) float64 {
	if math.IsNaN(value) || value <= 0 {
		value = defaultTargetAlpha
	}
	if value < minTargetAlpha {
		return minTargetAlpha
	}
	if value > maxTargetAlpha {
		return maxTargetAlpha
	}
	return value
}

func computeRhoFromAlpha(alpha float64, k int) float64 {
	if alpha <= 0 || alpha >= 1 || k < 2 {
		return 0.2
	}
	denom := float64(k) - alpha*float64(k-1)
	if denom <= 0 {
		return 0.2
	}
	rho := alpha / denom
	return math.Max(1e-6, math.Min(0.999999, rho))
}

func computeSigmaEFromAlpha(alpha float64, k int) float64 {
	return math.Sqrt((1 / computeRhoFromAlpha(alpha, k)) - 1)
}

func sigmaCandidates(targetAlpha float64, itemCount int) []float64 {
	base := math.Max(0, computeSigmaEFromAlpha(targetAlpha, itemCount))
	raw := []float64{base * 1.5, base * 1.2, base, base * 0.8, base * 0.6, base * 0.4, base * 0.2, 0.1, 0.05}
	result := make([]float64, 0, len(raw))
	seen := map[float64]bool{}
	for _, value := range raw {
		sigma := math.Round(math.Max(0, value)*1_000_000) / 1_000_000
		if seen[sigma] {
			continue
		}
		seen[sigma] = true
		result = append(result, sigma)
	}
	return result
}

func alphaFitLess(alpha float64, bestAlpha float64, targetAlpha float64) bool {
	if math.IsNaN(alpha) {
		return false
	}
	if math.IsNaN(bestAlpha) {
		return true
	}
	diff := math.Abs(alpha - targetAlpha)
	bestDiff := math.Abs(bestAlpha - targetAlpha)
	if diff != bestDiff {
		return diff < bestDiff
	}
	return alpha <= targetAlpha+1e-6 && bestAlpha > targetAlpha+1e-6
}

func cronbachAlpha(matrix [][]float64) float64 {
	if len(matrix) == 0 || len(matrix[0]) < 2 {
		return 0
	}
	k := len(matrix[0])
	totals := make([]float64, len(matrix))
	for rowIndex, row := range matrix {
		for _, value := range row {
			totals[rowIndex] += value
		}
	}
	totalVariance := variance(totals)
	if totalVariance == 0 {
		return 0
	}
	itemVariance := 0.0
	for column := 0; column < k; column++ {
		values := make([]float64, len(matrix))
		for rowIndex := range matrix {
			values[rowIndex] = matrix[rowIndex][column]
		}
		itemVariance += variance(values)
	}
	return (float64(k) / float64(k-1)) * (1 - itemVariance/totalVariance)
}

func variance(values []float64) float64 {
	if len(values) < 2 {
		return 0
	}
	mean := 0.0
	for _, value := range values {
		mean += value
	}
	mean /= float64(len(values))
	sum := 0.0
	for _, value := range values {
		delta := value - mean
		sum += delta * delta
	}
	return sum / float64(len(values)-1)
}
