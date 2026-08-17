package answerplan

import "github.com/SurveyController/SurveyController/packages/surveycore/internal/model"

const (
	conditionSelected    = "selected"
	conditionNotSelected = "not_selected"
	actionMustSelect     = "must_select"
	actionMustNotSelect  = "must_not_select"
)

type answerRule struct {
	id                     string
	conditionQuestionNum   int
	conditionMode          string
	conditionOptionIndices []int
	conditionRowIndex      *int
	targetQuestionNum      int
	targetMode             string
	targetOptionIndices    []int
	targetRowIndex         *int
}

type answerRecord struct {
	selected []int
	rows     map[int][]int
}

type consistencyPlan struct {
	rules    []answerRule
	answered map[int]answerRecord
}

func newConsistencyPlan(raw []model.ConsistencyRule) *consistencyPlan {
	return &consistencyPlan{
		rules:    parseRules(raw),
		answered: map[int]answerRecord{},
	}
}

func (p *consistencyPlan) apply(question model.QuestionMeta, entry model.QuestionStrategy) model.QuestionStrategy {
	if p == nil || len(p.rules) == 0 {
		return entry
	}
	kind := normalizeKind(question, entry)
	switch kind {
	case "single", "dropdown", "scale":
		return p.applySingleLike(question.Num, entry, nil)
	case "matrix":
		return p.applyMatrix(question, entry)
	case "multiple":
		return p.applyMultiple(question, entry)
	default:
		return entry
	}
}

func (p *consistencyPlan) applySingleLike(questionNum int, entry model.QuestionStrategy, rowIndex *int) model.QuestionStrategy {
	rule := p.latestTriggeredRule(questionNum, rowIndex)
	if rule == nil {
		return entry
	}
	values := ProbabilityValues(entry.Probabilities)
	adjusted, ok := applyRuleToProbabilities(values, *rule)
	if !ok {
		return entry
	}
	entry.Probabilities = model.OptionWeights(adjusted...)
	return entry
}

func (p *consistencyPlan) applyMatrix(question model.QuestionMeta, entry model.QuestionStrategy) model.QuestionStrategy {
	rows := maxInt(1, question.Rows)
	options := maxInt(1, question.Options)
	matrix := make([][]float64, rows)
	changed := false
	for row := 0; row < rows; row++ {
		rowIndex := row
		values := ProbabilityRowValues(entry.Probabilities, row)
		if len(values) == 0 {
			values = ProbabilityValues(entry.Probabilities)
		}
		values = fitProbabilityCount(values, options)
		rule := p.latestTriggeredRule(question.Num, &rowIndex)
		if rule != nil {
			if adjusted, ok := applyRuleToProbabilities(values, *rule); ok {
				values = adjusted
				changed = true
			}
		}
		matrix[row] = values
	}
	if changed {
		entry.Probabilities = model.RowWeights(matrix...)
	}
	return entry
}

func (p *consistencyPlan) applyMultiple(question model.QuestionMeta, entry model.QuestionStrategy) model.QuestionStrategy {
	rule := p.latestTriggeredRule(question.Num, nil)
	if rule == nil {
		return entry
	}
	count := maxInt(1, maxInt(question.Options, entry.OptionCount))
	rawValues := ProbabilityValues(entry.Probabilities)
	values := fitProbabilityCount(rawValues, count)
	// An all-zero multiple-choice entry has no meaningful fallback weights.
	// Keep it zeroed so must_select does not introduce random extra choices.
	if positiveTotal(rawValues) <= 0 {
		values = make([]float64, count)
	}
	adjusted, ok := applyRuleToMultipleProbabilities(values, *rule)
	if !ok {
		return entry
	}
	entry.Probabilities = model.OptionWeights(adjusted...)
	return entry
}

func (p *consistencyPlan) record(action Action) {
	if p == nil || action.QuestionNum <= 0 {
		return
	}
	record := answerRecord{selected: append([]int(nil), action.SelectedIndices...), rows: map[int][]int{}}
	for rowIndex, optionIndex := range action.MatrixIndices {
		record.rows[rowIndex] = []int{optionIndex}
	}
	p.answered[action.QuestionNum] = record
}

func (p *consistencyPlan) latestTriggeredRule(questionNum int, rowIndex *int) *answerRule {
	if p == nil {
		return nil
	}
	var selected *answerRule
	for i := range p.rules {
		rule := &p.rules[i]
		if rule.targetQuestionNum != questionNum {
			continue
		}
		if !sameOptionalInt(rule.targetRowIndex, rowIndex) {
			continue
		}
		if p.ruleTriggered(*rule) {
			selected = rule
		}
	}
	return selected
}

func (p *consistencyPlan) ruleTriggered(rule answerRule) bool {
	if rule.conditionQuestionNum >= rule.targetQuestionNum {
		return false
	}
	record, ok := p.answered[rule.conditionQuestionNum]
	if !ok {
		return false
	}
	var selected []int
	if rule.conditionRowIndex != nil {
		selected = record.rows[*rule.conditionRowIndex]
	} else {
		selected = record.selected
	}
	if len(selected) == 0 || len(rule.conditionOptionIndices) == 0 {
		return false
	}
	overlap := intersects(selected, rule.conditionOptionIndices)
	if rule.conditionMode == conditionSelected {
		return overlap
	}
	if rule.conditionMode == conditionNotSelected {
		return !overlap
	}
	return false
}

func sameOptionalInt(left *int, right *int) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}
