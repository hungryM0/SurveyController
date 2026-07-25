package answerplan

import (
	"math"
	"strconv"

	"surveycontroller/surveycore/internal/model"
)

const (
	standardWarmupSamples = 12
	standardGain          = 4.2
	standardMinFactor     = 0.45
	standardMaxFactor     = 2.2
	standardGapLimit      = 0.42
)

func resolveDistributionProbabilities(values []float64, optionCount int, runtime model.AnswerRuntime, questionNum int, rowIndex *int) []float64 {
	target := normalizeDistributionTarget(values, optionCount)
	if runtime == nil || questionNum <= 0 || optionCount <= 0 || len(target) == 0 {
		return target
	}
	total, counts := runtime.SnapshotDistributionStats(distributionStatKey(questionNum, rowIndex), optionCount)
	if total <= 0 {
		return target
	}
	sampleFactor := math.Min(1.0, float64(total)/float64(standardWarmupSamples))
	if sampleFactor <= 0 {
		return target
	}
	adjusted := make([]float64, len(target))
	for index, targetRatio := range target {
		if targetRatio <= 0 {
			continue
		}
		actualRatio := 0.0
		if index < len(counts) {
			actualRatio = float64(counts[index]) / float64(total)
		}
		gap := math.Max(-standardGapLimit, math.Min(standardGapLimit, targetRatio-actualRatio))
		factor := math.Exp(standardGain * sampleFactor * gap)
		factor = math.Max(standardMinFactor, math.Min(standardMaxFactor, factor))
		adjusted[index] = targetRatio * factor
	}
	return normalizeDistributionTarget(adjusted, optionCount)
}

func normalizeDistributionTarget(values []float64, optionCount int) []float64 {
	count := maxInt(0, optionCount)
	if count == 0 {
		return nil
	}
	fitted := fitProbabilityCount(values, count)
	total := positiveTotal(fitted)
	if total <= 0 {
		result := make([]float64, count)
		for index := range result {
			result[index] = 1 / float64(count)
		}
		return result
	}
	for index := range fitted {
		if fitted[index] <= 0 || math.IsNaN(fitted[index]) || math.IsInf(fitted[index], 0) {
			fitted[index] = 0
			continue
		}
		fitted[index] /= total
	}
	return fitted
}

func enforceReferenceRankOrder(values []float64, reference []float64) []float64 {
	adjusted := append([]float64(nil), values...)
	groups := rankGroups(reference)
	if len(groups) <= 1 {
		return adjusted
	}
	var previousFloor *float64
	for _, group := range groups {
		groupValues := make([]float64, 0, len(group))
		for _, index := range group {
			if index >= 0 && index < len(adjusted) {
				groupValues = append(groupValues, adjusted[index])
			}
		}
		if len(groupValues) == 0 {
			continue
		}
		if previousFloor != nil {
			for _, index := range group {
				if index >= 0 && index < len(adjusted) {
					adjusted[index] = math.Min(adjusted[index], *previousFloor)
				}
			}
			groupValues = groupValues[:0]
			for _, index := range group {
				if index >= 0 && index < len(adjusted) {
					groupValues = append(groupValues, adjusted[index])
				}
			}
		}
		currentMin := minPositiveOrZero(groupValues)
		if previousFloor == nil || currentMin < *previousFloor {
			value := currentMin
			previousFloor = &value
		}
	}
	return normalizeDistributionTarget(adjusted, len(adjusted))
}

func rankGroups(values []float64) [][]int {
	weights := make([]float64, 0)
	groupsByWeight := map[float64][]int{}
	for index, raw := range values {
		if raw <= 0 || math.IsNaN(raw) || math.IsInf(raw, 0) {
			continue
		}
		if _, ok := groupsByWeight[raw]; !ok {
			weights = append(weights, raw)
		}
		groupsByWeight[raw] = append(groupsByWeight[raw], index)
	}
	for i := 0; i < len(weights); i++ {
		for j := i + 1; j < len(weights); j++ {
			if weights[j] > weights[i] {
				weights[i], weights[j] = weights[j], weights[i]
			}
		}
	}
	result := make([][]int, 0, len(weights))
	for _, weight := range weights {
		result = append(result, groupsByWeight[weight])
	}
	return result
}

func minPositiveOrZero(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	minValue := values[0]
	for _, value := range values[1:] {
		if value < minValue {
			minValue = value
		}
	}
	if minValue < 0 || math.IsNaN(minValue) || math.IsInf(minValue, 0) {
		return 0
	}
	return minValue
}

func recordPendingDistribution(options BuildOptions, questionNum int, rowIndex *int, optionIndex int, optionCount int) {
	if options.Runtime == nil || questionNum <= 0 {
		return
	}
	options.Runtime.AppendPendingDistributionChoice(
		options.RuntimeOwner,
		distributionStatKey(questionNum, rowIndex),
		optionIndex,
		optionCount,
	)
}

func distributionStatKey(questionNum int, rowIndex *int) string {
	if rowIndex == nil {
		return "q:" + strconv.Itoa(questionNum)
	}
	return "matrix:" + strconv.Itoa(questionNum) + ":" + strconv.Itoa(*rowIndex)
}

func hasPositiveWeightValues(raw model.WeightTable) bool {
	values := ProbabilityValues(raw)
	if positiveTotal(values) > 0 {
		return true
	}
	for _, row := range raw.Rows {
		if positiveTotal(row) > 0 {
			return true
		}
	}
	return false
}
