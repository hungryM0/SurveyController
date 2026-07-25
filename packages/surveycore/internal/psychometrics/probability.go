package psychometrics

import "math"

func buildBiasTargetProbabilities(optionCount int, bias string) []float64 {
	count := maxInt(2, optionCount)
	if count == 2 {
		switch bias {
		case "left":
			return []float64{0.75, 0.25}
		case "right":
			return []float64{0.25, 0.75}
		default:
			return []float64{0.5, 0.5}
		}
	}
	raw := make([]float64, count)
	for i := 0; i < count; i++ {
		var value float64
		switch bias {
		case "left":
			value = 1 - float64(i)/float64(count-1)
		case "right":
			value = float64(i) / float64(count-1)
		default:
			center := float64(count-1) / 2
			value = 1 - math.Abs(float64(i)-center)/math.Max(center, 1)
		}
		power := 8.0
		if bias == "center" {
			power = 3
		}
		raw[i] = math.Pow(math.Max(value, 0), power)
	}
	return normalizeProbabilityList(raw)
}

func normalizeProbabilityList(values []float64) []float64 {
	cleaned := make([]float64, len(values))
	total := 0.0
	for index, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
			value = 0
		}
		cleaned[index] = value
		total += value
	}
	if total <= 0 {
		if len(cleaned) == 0 {
			return nil
		}
		for index := range cleaned {
			cleaned[index] = 1 / float64(len(cleaned))
		}
		return cleaned
	}
	for index := range cleaned {
		cleaned[index] /= total
	}
	return cleaned
}

func oneHot(count int, index int) []float64 {
	count = maxInt(1, count)
	values := make([]float64, count)
	values[clampInt(index, 0, count-1)] = 1
	return values
}
