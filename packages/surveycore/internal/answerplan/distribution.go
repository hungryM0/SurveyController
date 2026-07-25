package answerplan

import (
	"math"
	"math/rand"
	"strings"

	"surveycontroller/surveycore/internal/model"
)

const (
	personaBoostFactor = 3.0
)

func selectionEntry(question model.QuestionMeta, entry model.QuestionStrategy, rowIndex *int, count int, options BuildOptions) (model.QuestionStrategy, bool) {
	values := effectiveProbabilityValues(entry, rowIndex, count)
	strictRatio := isStrictRatioEntry(entry)
	hasDimension := activeDimension(entry)
	if !strictRatio {
		values = applyPersonaBoost(question.OptionTexts, values, options.Persona)
	}
	if hasDimension && options.DimensionBases != nil {
		values = applyDimensionTendency(values, count, entry.Dimension, options.DimensionBases, options.Persona)
	}
	trackDistribution := false
	if options.Runtime != nil && (strictRatio || hasDimension) {
		reference := append([]float64(nil), values...)
		values = resolveDistributionProbabilities(values, count, options.Runtime, question.Num, rowIndex)
		if strictRatio {
			values = enforceReferenceRankOrder(values, reference)
		}
		trackDistribution = true
	}
	cloned := entry
	// The caller selects immediately after this function, so keep a row's
	// effective values as ordinary option weights instead of a one-row table.
	cloned.Probabilities = model.OptionWeights(values...)
	return cloned, trackDistribution
}

func multipleSelectionEntry(question model.QuestionMeta, entry model.QuestionStrategy, options BuildOptions) model.QuestionStrategy {
	if isStrictRatioEntry(entry) {
		return entry
	}
	values := fitProbabilityCount(ProbabilityValues(entry.Probabilities), maxInt(1, question.Options))
	values = applyPersonaBoost(question.OptionTexts, values, options.Persona)
	cloned := entry
	cloned.Probabilities = model.OptionWeights(values...)
	return cloned
}

func effectiveProbabilityValues(entry model.QuestionStrategy, rowIndex *int, count int) []float64 {
	var values []float64
	if rowIndex != nil {
		values = ProbabilityRowValues(entry.Probabilities, *rowIndex)
		if positiveTotal(values) <= 0 {
			values = ProbabilityRowValues(entry.CustomWeights, *rowIndex)
		}
	}
	if positiveTotal(values) <= 0 {
		values = ProbabilityValues(entry.Probabilities)
	}
	if positiveTotal(values) <= 0 {
		values = ProbabilityValues(entry.CustomWeights)
	}
	return fitProbabilityCount(values, count)
}

func isStrictRatioEntry(entry model.QuestionStrategy) bool {
	mode := strings.ToLower(strings.TrimSpace(entry.DistributionMode))
	if mode != "custom" {
		return false
	}
	return hasPositiveWeightValues(entry.CustomWeights) || hasPositiveWeightValues(entry.Probabilities)
}

func activeDimension(entry model.QuestionStrategy) bool {
	dimension := strings.TrimSpace(entry.Dimension)
	return dimension != "" && dimension != "未分组"
}

func applyDimensionTendency(values []float64, count int, dimension string, bases map[string]float64, persona *model.Persona) []float64 {
	if count <= 0 {
		return nil
	}
	key := strings.TrimSpace(dimension)
	if key == "" || key == "未分组" {
		return values
	}
	baseRatio, ok := bases[key]
	if !ok {
		baseRatio = generateBaseRatio(count, values, persona)
		bases[key] = baseRatio
	}
	base := int(math.Round(clampFloat(baseRatio, 0, 1) * float64(maxInt(1, count-1))))
	base = minInt(maxInt(base, 0), count-1)
	window := tendencyWindow(count)
	if window <= 0 {
		return oneHotWeights(count, base)
	}
	low := maxInt(0, base-window)
	high := minInt(count-1, base+window)
	adjusted := fitProbabilityCount(values, count)
	if positiveTotal(adjusted) <= 0 {
		for index := range adjusted {
			adjusted[index] = 1
		}
	}
	for index := range adjusted {
		distance := absInt(index - base)
		if index < low || index > high {
			adjusted[index] *= 0.25
			continue
		}
		adjusted[index] *= tendencyDecay(distance, window)
	}
	if positiveTotal(adjusted) <= 0 {
		return oneHotWeights(count, base)
	}
	return adjusted
}

func generateBaseRatio(count int, values []float64, persona *model.Persona) float64 {
	if positiveTotal(values) <= 0 {
		if persona != nil && persona.SatisfactionTendency > 0 {
			return clampFloat(persona.SatisfactionTendency+rand.NormFloat64()*0.1, 0, 1)
		}
		return rand.Float64()
	}
	index := SelectedIndex(model.QuestionStrategy{Probabilities: model.OptionWeights(values...)}, count)
	return float64(index) / float64(maxInt(1, count-1))
}

func tendencyWindow(count int) int {
	if count <= 3 {
		return 0
	}
	window := int(math.Round(float64(count) * 0.28))
	if window < 1 {
		window = 1
	}
	if window > 2 {
		window = 2
	}
	return window
}

func tendencyDecay(distance int, window int) float64 {
	if distance <= 0 {
		return 1.0
	}
	if window <= 0 {
		return 0
	}
	normalized := math.Min(1, float64(distance)/float64(window))
	return math.Max(0.55, 1.0-(0.45*normalized))
}

func oneHotWeights(count int, index int) []float64 {
	result := make([]float64, maxInt(1, count))
	result[minInt(maxInt(index, 0), len(result)-1)] = 1
	return result
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func applyPersonaBoost(optionTexts []string, weights []float64, persona *model.Persona) []float64 {
	boosted := append([]float64(nil), weights...)
	if persona == nil || len(boosted) == 0 {
		return boosted
	}
	keywords := personaKeywords(persona)
	if len(keywords) == 0 {
		return boosted
	}
	for index, text := range optionTexts {
		if index >= len(boosted) || strings.TrimSpace(text) == "" {
			continue
		}
		for _, keyword := range keywords {
			if keyword != "" && strings.Contains(text, keyword) {
				boosted[index] *= personaBoostFactor
				break
			}
		}
	}
	return boosted
}

func personaKeywords(persona *model.Persona) []string {
	if persona == nil {
		return nil
	}
	mapping := persona.KeywordMap()
	keywords := make([]string, 0)
	for _, values := range mapping {
		for _, value := range values {
			if text := strings.TrimSpace(value); text != "" {
				keywords = append(keywords, text)
			}
		}
	}
	return keywords
}
