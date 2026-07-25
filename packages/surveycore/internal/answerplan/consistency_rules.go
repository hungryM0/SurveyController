package answerplan

import (
	"strings"

	"surveycontroller/surveycore/internal/model"
)

func parseRules(raw []model.ConsistencyRule) []answerRule {
	rules := make([]answerRule, 0, len(raw))
	for _, item := range raw {
		rule, ok := parseRule(item)
		if ok {
			rules = append(rules, rule)
		}
	}
	return rules
}

func parseRule(raw model.ConsistencyRule) (answerRule, bool) {
	conditionQuestionNum := raw.ConditionQuestionNum
	targetQuestionNum := raw.TargetQuestionNum
	conditionMode := strings.TrimSpace(raw.ConditionMode)
	targetMode := strings.TrimSpace(raw.ActionMode)
	if conditionQuestionNum <= 0 || targetQuestionNum <= 0 {
		return answerRule{}, false
	}
	if conditionMode != conditionSelected && conditionMode != conditionNotSelected {
		return answerRule{}, false
	}
	if targetMode != actionMustSelect && targetMode != actionMustNotSelect {
		return answerRule{}, false
	}
	conditionIndices := uniqueSortedInts(raw.ConditionOptionIndices)
	targetIndices := uniqueSortedInts(raw.TargetOptionIndices)
	if len(conditionIndices) == 0 || len(targetIndices) == 0 {
		return answerRule{}, false
	}
	return answerRule{
		id:                     strings.TrimSpace(raw.ID),
		conditionQuestionNum:   conditionQuestionNum,
		conditionMode:          conditionMode,
		conditionOptionIndices: conditionIndices,
		conditionRowIndex:      cloneOptionalInt(raw.ConditionRowIndex),
		targetQuestionNum:      targetQuestionNum,
		targetMode:             targetMode,
		targetOptionIndices:    targetIndices,
		targetRowIndex:         cloneOptionalInt(raw.TargetRowIndex),
	}, true
}

func cloneOptionalInt(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func intersects(left []int, right []int) bool {
	seen := map[int]bool{}
	for _, value := range left {
		seen[value] = true
	}
	for _, value := range right {
		if seen[value] {
			return true
		}
	}
	return false
}

func uniqueSortedInts(values []int) []int {
	seen := map[int]bool{}
	result := make([]int, 0, len(values))
	for _, value := range values {
		if value < 0 || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	for i := 0; i < len(result); i++ {
		for j := i + 1; j < len(result); j++ {
			if result[j] < result[i] {
				result[i], result[j] = result[j], result[i]
			}
		}
	}
	return result
}
