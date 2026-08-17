package tencent

import (
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

func attachLogicMetadata(rawQuestions []map[string]any, questions []model.QuestionMeta) []model.QuestionMeta {
	byID := map[string]int{}
	firstByPage := map[string]int{}
	maxNum := 0
	for index, question := range questions {
		if question.ProviderID == "" || question.IsDescription {
			continue
		}
		byID[question.ProviderID] = index
		if question.ProviderPageID != "" {
			if _, ok := firstByPage[question.ProviderPageID]; !ok {
				firstByPage[question.ProviderPageID] = question.Num
			}
		}
		if question.Num > maxNum {
			maxNum = question.Num
		}
	}
	inbound := map[string][]model.DisplayCondition{}
	controls := map[string][]model.DisplayControl{}
	for _, raw := range rawQuestions {
		sourceID := strings.TrimSpace(stringValue(raw["id"]))
		idx, ok := byID[sourceID]
		if !ok {
			continue
		}
		question := questions[idx]
		jumpRules := make([]model.JumpRule, 0)
		hasJump := false
		exact := false
		if target, ok := resolveTarget(raw["goto"], byIDNum(questions), firstByPage, maxNum); ok {
			jumpRules = append(jumpRules, model.JumpRule{OptionIndex: -1, TargetQuestion: target})
			hasJump = true
			exact = true
		} else if raw["goto"] != nil && stringValue(raw["goto"]) != "" {
			hasJump = true
		}
		for optionIndex, option := range asMapList(raw["options"]) {
			if target, ok := resolveTarget(option["goto"], byIDNum(questions), firstByPage, maxNum); ok {
				optionText := cleanOptionText(option["text"])
				jumpRules = append(jumpRules, model.JumpRule{OptionIndex: optionIndex, TargetQuestion: target, OptionText: &optionText})
				hasJump = true
				exact = true
			} else if option["goto"] != nil && stringValue(option["goto"]) != "" {
				hasJump = true
			}
			for _, targetID := range collectQuestionRefs(option["display"]) {
				targetIndex, exists := byID[targetID]
				if !exists {
					continue
				}
				targetNum := questions[targetIndex].Num
				controls[sourceID] = append(controls[sourceID], model.DisplayControl{TargetQuestionNum: targetNum, OptionIndices: []int{optionIndex}, Mode: "selected"})
				inbound[targetID] = append(inbound[targetID], model.DisplayCondition{QuestionNum: question.Num, OptionIndices: []int{optionIndex}, Mode: "selected"})
				exact = true
			}
		}
		question.HasJump = hasJump || len(jumpRules) > 0
		question.JumpRules = jumpRules
		if items := controls[sourceID]; len(items) > 0 {
			question.HasDependentDisplayLogic = true
			question.ControlsDisplayTargets = items
			exact = true
		}
		if hasAnyLogic(question) {
			if exact {
				question.LogicStatus = model.LogicParseStatusComplete
			} else {
				question.LogicStatus = model.LogicParseStatusUnknown
			}
		} else {
			question.LogicStatus = model.LogicParseStatusNone
		}
		questions[idx] = question
	}
	for id, conditions := range inbound {
		idx, ok := byID[id]
		if !ok {
			continue
		}
		questions[idx].HasDisplayCondition = true
		questions[idx].DisplayConditions = conditions
		questions[idx].LogicStatus = model.LogicParseStatusComplete
	}
	for _, raw := range rawQuestions {
		id := strings.TrimSpace(stringValue(raw["id"]))
		idx, ok := byID[id]
		if !ok {
			continue
		}
		if raw["hidden"] != nil && raw["hidden"] != "" {
			questions[idx].HasDisplayCondition = true
			if questions[idx].LogicStatus == model.LogicParseStatusNone {
				questions[idx].LogicStatus = model.LogicParseStatusUnknown
			}
		}
	}
	return questions
}

func byIDNum(questions []model.QuestionMeta) map[string]int {
	result := map[string]int{}
	for _, question := range questions {
		if question.ProviderID != "" && !question.IsDescription {
			result[question.ProviderID] = question.Num
		}
	}
	return result
}

func resolveTarget(raw any, questionByID map[string]int, firstByPage map[string]int, maxNum int) (int, bool) {
	if raw == nil || raw == "" {
		return 0, false
	}
	if value := intValue(raw); value > 0 {
		return value, true
	}
	for _, id := range collectQuestionRefs(raw) {
		if value := questionByID[id]; value > 0 {
			return value, true
		}
	}
	for _, id := range collectPageRefs(raw) {
		if value := firstByPage[id]; value > 0 {
			return value, true
		}
	}
	lowered := strings.ToLower(stringValue(raw))
	for _, token := range []string{"submit", "finish", "complete", "end", "结束", "提交", "完成"} {
		if strings.Contains(lowered, token) {
			return maxNum + 1, true
		}
	}
	return 0, false
}

func collectQuestionRefs(value any) []string {
	return uniqueMatches(questionIDTokenRE.FindAllString(stringValue(value), -1))
}

func collectPageRefs(value any) []string {
	return uniqueMatches(pageIDTokenRE.FindAllString(stringValue(value), -1))
}

func uniqueMatches(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		text := strings.TrimSpace(value)
		if text == "" || seen[text] {
			continue
		}
		seen[text] = true
		result = append(result, text)
	}
	return result
}

func hasAnyLogic(question model.QuestionMeta) bool {
	return question.HasJump || question.HasDisplayCondition || question.HasDependentDisplayLogic
}
