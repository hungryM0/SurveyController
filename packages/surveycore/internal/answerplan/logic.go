package answerplan

import (
	"fmt"
	"sort"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

var terminateJumpKeywords = []string{"结束作答", "结束答题", "结束填写", "终止作答", "停止作答"}

func BuildActionsWithLogic(questions []model.QuestionMeta, entries []model.QuestionStrategy, options BuildOptions) ([]Action, error) {
	ordered := orderedQuestions(questions)
	if reason := httpLogicFallbackReason(ordered); reason != "" {
		return nil, fmt.Errorf("%s，暂不支持纯 HTTP 提交", reason)
	}
	index := NewEntryIndex(entries)
	consistency := newConsistencyPlan(options.AnswerRules)
	actions := make([]Action, 0, len(ordered))
	answered := map[int]Action{}
	maxNum := maxQuestionNum(ordered)
	jumpTarget := 0
	for _, question := range ordered {
		if question.IsDescription || question.Num <= 0 {
			continue
		}
		if jumpTarget > 0 {
			if question.Num < jumpTarget {
				continue
			}
			jumpTarget = 0
		}
		if !questionVisible(question, answered) {
			continue
		}
		entry, ok := index.Find(question)
		if !ok {
			entry = DefaultEntry(question)
		}
		entry = consistency.apply(question, entry)
		action, err := BuildActionWithOptions(question, entry, options)
		if err != nil {
			return nil, err
		}
		actions = append(actions, action)
		answered[action.QuestionNum] = action
		consistency.record(action)
		target, terminates := resolveJumpTarget(question, action)
		if target <= 0 {
			continue
		}
		if terminates || target > maxNum {
			return actions, nil
		}
		jumpTarget = target
	}
	return actions, nil
}

func orderedQuestions(questions []model.QuestionMeta) []model.QuestionMeta {
	result := make([]model.QuestionMeta, 0, len(questions))
	for _, question := range questions {
		if question.Num > 0 {
			result = append(result, question)
		}
	}
	sort.SliceStable(result, func(i int, j int) bool {
		leftPage := result[i].Page
		rightPage := result[j].Page
		if leftPage <= 0 {
			leftPage = 1
		}
		if rightPage <= 0 {
			rightPage = 1
		}
		if leftPage != rightPage {
			return leftPage < rightPage
		}
		return result[i].Num < result[j].Num
	})
	return result
}

func questionVisible(question model.QuestionMeta, answered map[int]Action) bool {
	if len(question.DisplayConditions) == 0 {
		return !question.HasDisplayCondition
	}
	grouped := map[string][]model.DisplayCondition{}
	for _, condition := range question.DisplayConditions {
		sourceNum := condition.QuestionNum
		if sourceNum <= 0 {
			continue
		}
		mode := strings.TrimSpace(condition.Mode)
		if mode == "" {
			mode = conditionSelected
		}
		groupKey := fmt.Sprintf("%d:%s", sourceNum, mode)
		grouped[groupKey] = append(grouped[groupKey], condition)
	}
	if len(grouped) == 0 {
		return !question.HasDisplayCondition
	}
	for _, group := range grouped {
		matched := false
		for _, condition := range group {
			if conditionMet(answered, condition) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

func conditionMet(answered map[int]Action, condition model.DisplayCondition) bool {
	sourceNum := condition.QuestionNum
	if sourceNum <= 0 {
		return false
	}
	action, ok := answered[sourceNum]
	if !ok {
		return false
	}
	mode := strings.TrimSpace(condition.Mode)
	if mode == "" {
		mode = conditionSelected
	}
	indices := append([]int(nil), condition.OptionIndices...)
	selected := actionSelectedIndices(action)
	if len(indices) == 0 {
		return mode == conditionSelected
	}
	overlap := intersects(selected, indices)
	if mode == conditionSelected {
		return overlap
	}
	if mode == conditionNotSelected {
		return !overlap
	}
	return false
}

func resolveJumpTarget(question model.QuestionMeta, action Action) (int, bool) {
	selected := actionSelectedIndexSet(action)
	unconditionalTarget := 0
	unconditionalTerminates := false
	for _, rule := range question.JumpRules {
		target := rule.TargetQuestion
		if target <= 0 {
			continue
		}
		terminates := jumpRuleTerminates(rule)
		optionIndex := rule.OptionIndex
		if optionIndex < 0 {
			if unconditionalTarget == 0 {
				unconditionalTarget = target
				unconditionalTerminates = terminates
			}
			continue
		}
		if selected[optionIndex] {
			return target, terminates
		}
	}
	return unconditionalTarget, unconditionalTerminates
}

func jumpRuleTerminates(rule model.JumpRule) bool {
	if rule.TerminatesSurvey {
		return true
	}
	optionText := ""
	if rule.OptionText != nil {
		optionText = strings.TrimSpace(*rule.OptionText)
	}
	if optionText == "" {
		return false
	}
	for _, keyword := range terminateJumpKeywords {
		if strings.Contains(optionText, keyword) {
			return true
		}
	}
	return false
}

func actionSelectedIndices(action Action) []int {
	if action.Kind == "matrix" {
		return append([]int(nil), action.MatrixIndices...)
	}
	return append([]int(nil), action.SelectedIndices...)
}

func actionSelectedIndexSet(action Action) map[int]bool {
	result := map[int]bool{}
	for _, index := range actionSelectedIndices(action) {
		if index >= 0 {
			result[index] = true
		}
	}
	return result
}

func maxQuestionNum(questions []model.QuestionMeta) int {
	maxNum := 0
	for _, question := range questions {
		if question.Num > maxNum {
			maxNum = question.Num
		}
	}
	return maxNum
}
