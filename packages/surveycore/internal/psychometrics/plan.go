package psychometrics

import (
	"surveycontroller/surveycore/internal/answerplan"
	"surveycontroller/surveycore/internal/model"
)

const (
	globalReliabilityDimension = "__global_reliability__"
	defaultTargetAlpha         = 0.85
	minTargetAlpha             = 0.60
	maxTargetAlpha             = 0.95
	microJitterSigma           = 0.03
)

type Item struct {
	QuestionNum         int
	Kind                string
	RowIndex            *int
	OptionCount         int
	Bias                string
	TargetProbabilities []float64
	ScoreByChoiceIndex  []int
}

type JointPlan struct {
	AnswersBySample map[int]map[string]int
	SampleCount     int
}

func (p *JointPlan) Choice(sampleIndex int, questionNum int, rowIndex *int) (int, bool) {
	if p == nil {
		return 0, false
	}
	answers := p.AnswersBySample[sampleIndex]
	if answers == nil {
		return 0, false
	}
	choice, ok := answers[choiceKey(questionNum, rowIndex)]
	return choice, ok
}

func BuildJointPlan(cfg *model.RunRequest) *JointPlan {
	if cfg == nil || !cfg.PsychometricPolicy.Enabled {
		return nil
	}
	sampleCount := cfg.Target
	if sampleCount <= 0 {
		sampleCount = 1
	}
	grouped := buildBlueprint(cfg)
	if len(grouped) == 0 {
		return nil
	}
	targetAlpha := normalizeTargetAlpha(cfg.PsychometricPolicy.TargetAlpha)
	answers := make(map[int]map[string]int, sampleCount)
	for sampleIndex := 0; sampleIndex < sampleCount; sampleIndex++ {
		answers[sampleIndex] = map[string]int{}
	}
	hasChoices := false
	for _, items := range grouped {
		if len(items) < 2 {
			continue
		}
		choices := evaluateDimension(items, sampleCount, targetAlpha)
		for key, assigned := range choices {
			for sampleIndex, choice := range assigned {
				answers[sampleIndex][key] = choice
				hasChoices = true
			}
		}
	}
	if !hasChoices {
		return nil
	}
	return &JointPlan{AnswersBySample: answers, SampleCount: sampleCount}
}

func ApplySample(entries []model.QuestionStrategy, questions []model.QuestionMeta, plan *JointPlan, sampleIndex int) []model.QuestionStrategy {
	if plan == nil {
		return cloneEntries(entries)
	}
	cloned := cloneEntries(entries)
	entryByNum := map[int]int{}
	for index, entry := range cloned {
		if entry.QuestionNum != nil {
			entryByNum[*entry.QuestionNum] = index
		}
	}
	for _, question := range questions {
		if question.IsDescription {
			continue
		}
		index, ok := entryByNum[question.Num]
		if !ok {
			cloned = append(cloned, answerplan.DefaultEntry(question))
			index = len(cloned) - 1
			entryByNum[question.Num] = index
		}
		entry := cloned[index]
		if applyQuestionSample(&entry, question, plan, sampleIndex) {
			cloned[index] = entry
		}
	}
	return cloned
}

func applyQuestionSample(entry *model.QuestionStrategy, question model.QuestionMeta, plan *JointPlan, sampleIndex int) bool {
	kind := normalizeKind(question, *entry)
	switch kind {
	case "single", "dropdown", "scale", "score":
		choice, ok := plan.Choice(sampleIndex, question.Num, nil)
		if !ok {
			return false
		}
		entry.Probabilities = model.OptionWeights(oneHot(optionCount(question, *entry, nil, 5), choice)...)
		return true
	case "matrix":
		rows := maxInt(1, question.Rows)
		values := make([][]float64, rows)
		changed := false
		for row := 0; row < rows; row++ {
			rowIndex := row
			choice, ok := plan.Choice(sampleIndex, question.Num, &rowIndex)
			if !ok {
				values[row] = answerplan.ProbabilityRowValues(entry.Probabilities, row)
				if len(values[row]) == 0 {
					values[row] = answerplan.ProbabilityValues(entry.Probabilities)
				}
				continue
			}
			values[row] = oneHot(optionCount(question, *entry, &row, 5), choice)
			changed = true
		}
		if changed {
			entry.Probabilities = model.RowWeights(values...)
		}
		return changed
	default:
		return false
	}
}
