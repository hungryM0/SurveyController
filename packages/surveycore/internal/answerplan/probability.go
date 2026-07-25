package answerplan

import (
	"strconv"

	"surveycontroller/surveycore/internal/model"
)

func ProbabilityValues(raw model.WeightTable) []float64 {
	return raw.Values()
}

func firstProbabilityText(raw model.WeightTable) string {
	values := ProbabilityValues(raw)
	if len(values) == 0 {
		return ""
	}
	return strconv.FormatFloat(values[0], 'f', -1, 64)
}

func ProbabilityRowValues(raw model.WeightTable, row int) []float64 {
	return raw.Row(row)
}
