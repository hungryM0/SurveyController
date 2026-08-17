package psychometrics

import (
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/answerplan"
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

func buildBlueprint(cfg *model.RunRequest) map[string][]Item {
	questions := map[int]model.QuestionMeta{}
	for _, question := range cfg.SurveyDefinition.Questions {
		questions[question.Num] = question
	}
	grouped := map[string][]Item{}
	candidates := make([]Item, 0)
	candidateDimensions := make([]string, 0)
	hasExplicitDimension := false
	for index, entry := range cfg.AnswerPlan.Strategies {
		questionNum := index + 1
		if entry.QuestionNum != nil && *entry.QuestionNum > 0 {
			questionNum = *entry.QuestionNum
		}
		question := questions[questionNum]
		if question.Num == 0 {
			question.Num = questionNum
			question.Options = entry.OptionCount
			question.Rows = entry.Rows
			question.ProviderType = string(entry.QuestionType)
		}
		items := blueprintItems(question, entry)
		if len(items) == 0 {
			continue
		}
		dimension := strings.TrimSpace(entry.Dimension)
		if dimension != "" && dimension != "未分组" {
			hasExplicitDimension = true
		}
		for _, item := range items {
			candidates = append(candidates, item)
			candidateDimensions = append(candidateDimensions, dimension)
		}
	}
	for index, item := range candidates {
		dimension := strings.TrimSpace(candidateDimensions[index])
		if !hasExplicitDimension {
			dimension = globalReliabilityDimension
		}
		if dimension == "" || dimension == "未分组" {
			continue
		}
		grouped[dimension] = append(grouped[dimension], item)
	}
	return grouped
}

func blueprintItems(question model.QuestionMeta, entry model.QuestionStrategy) []Item {
	kind := normalizeKind(question, entry)
	switch kind {
	case "scale", "score", "dropdown":
		return []Item{newItem(question, entry, kind, nil, nil)}
	case "single":
		scoreMap, ok := inferOrdinalOptionMapping(question.OptionTexts)
		if !ok {
			return nil
		}
		return []Item{newItem(question, entry, kind, nil, scoreMap)}
	case "matrix":
		rows := maxInt(1, question.Rows)
		result := make([]Item, 0, rows)
		for row := 0; row < rows; row++ {
			rowIndex := row
			result = append(result, newItem(question, entry, kind, &rowIndex, nil))
		}
		return result
	default:
		return nil
	}
}

func newItem(question model.QuestionMeta, entry model.QuestionStrategy, kind string, rowIndex *int, scoreMap []int) Item {
	count := optionCount(question, entry, rowIndex, 5)
	probabilities := probabilitiesForEntry(entry, rowIndex, count)
	bias := resolveBias(entry.PsychoBias, probabilities, count)
	if len(probabilities) == 0 {
		probabilities = buildBiasTargetProbabilities(count, bias)
	}
	return Item{
		QuestionNum:         question.Num,
		Kind:                kind,
		RowIndex:            cloneIntPtr(rowIndex),
		OptionCount:         count,
		Bias:                bias,
		TargetProbabilities: normalizeProbabilityList(probabilities),
		ScoreByChoiceIndex:  append([]int(nil), scoreMap...),
	}
}

func (item Item) choiceKey() string {
	return choiceKey(item.QuestionNum, item.RowIndex)
}

func (item Item) choiceIndexForScore(scoreIndex int) int {
	if len(item.ScoreByChoiceIndex) == 0 {
		return clampInt(scoreIndex, 0, item.OptionCount-1)
	}
	for choiceIndex, score := range item.ScoreByChoiceIndex {
		if score == scoreIndex {
			return clampInt(choiceIndex, 0, item.OptionCount-1)
		}
	}
	return clampInt(scoreIndex, 0, item.OptionCount-1)
}

func choiceKey(questionNum int, rowIndex *int) string {
	if rowIndex == nil {
		return "q:" + strconvItoa(questionNum)
	}
	return "q:" + strconvItoa(questionNum) + ":row:" + strconvItoa(*rowIndex)
}

func optionCount(question model.QuestionMeta, entry model.QuestionStrategy, rowIndex *int, fallback int) int {
	_ = rowIndex
	if question.Options > 0 {
		return maxInt(2, question.Options)
	}
	if entry.OptionCount > 0 {
		return maxInt(2, entry.OptionCount)
	}
	if values := answerplan.ProbabilityValues(entry.Probabilities); len(values) > 0 {
		return maxInt(2, len(values))
	}
	return maxInt(2, fallback)
}

func probabilitiesForEntry(entry model.QuestionStrategy, rowIndex *int, count int) []float64 {
	var values []float64
	if rowIndex != nil {
		values = answerplan.ProbabilityRowValues(entry.Probabilities, *rowIndex)
	}
	if len(values) == 0 {
		values = answerplan.ProbabilityValues(entry.Probabilities)
	}
	if len(values) == 0 {
		return nil
	}
	result := make([]float64, count)
	copy(result, values)
	if positiveTotal(result) <= 0 {
		return nil
	}
	return result
}

func resolveBias(raw string, probabilities []float64, optionCount int) string {
	bias := strings.ToLower(strings.TrimSpace(raw))
	if bias == "left" || bias == "center" || bias == "right" {
		return bias
	}
	if len(probabilities) == 0 {
		return "center"
	}
	normalized := normalizeProbabilityList(probabilities)
	mean := 0.0
	for index, value := range normalized {
		mean += float64(index) * value
	}
	ratio := mean / float64(maxInt(1, optionCount-1))
	if ratio <= 0.4 {
		return "left"
	}
	if ratio >= 0.6 {
		return "right"
	}
	return "center"
}
