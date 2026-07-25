package model

func CloneSurveyDefinition(definition SurveyDefinition) SurveyDefinition {
	cloned := definition
	cloned.Questions = CloneQuestions(definition.Questions)
	return cloned
}

func CloneQuestions(questions []QuestionMeta) []QuestionMeta {
	if questions == nil {
		return nil
	}
	cloned := make([]QuestionMeta, len(questions))
	copy(cloned, questions)
	for index := range cloned {
		source := questions[index]
		cloned[index].RowTexts = append([]string(nil), source.RowTexts...)
		cloned[index].OptionTexts = append([]string(nil), source.OptionTexts...)
		cloned[index].TextInputLabels = append([]string(nil), source.TextInputLabels...)
		cloned[index].JumpRules = cloneJumpRules(source.JumpRules)
		cloned[index].DisplayConditions = cloneDisplayConditions(source.DisplayConditions)
		cloned[index].ControlsDisplayTargets = cloneDisplayControls(source.ControlsDisplayTargets)
		cloned[index].QuestionMedia = cloneQuestionMedia(source.QuestionMedia)
		cloned[index].ForcedTexts = append([]string(nil), source.ForcedTexts...)
		cloned[index].FillableOptions = append([]int(nil), source.FillableOptions...)
		cloned[index].AttachedOptionSelects = CloneAttachedOptionSelects(source.AttachedOptionSelects)
		cloned[index].DisplayNum = cloneIntPointer(source.DisplayNum)
		cloned[index].MultiMinLimit = cloneIntPointer(source.MultiMinLimit)
		cloned[index].MultiMaxLimit = cloneIntPointer(source.MultiMaxLimit)
		cloned[index].ForcedOptionIdx = cloneIntPointer(source.ForcedOptionIdx)
	}
	return cloned
}

func CloneAnswerPlan(plan AnswerPlan) AnswerPlan {
	cloned := plan
	cloned.Rules = cloneConsistencyRules(plan.Rules)
	cloned.Dimensions = append([]string(nil), plan.Dimensions...)
	cloned.Strategies = CloneQuestionStrategies(plan.Strategies)
	return cloned
}

func CloneQuestionStrategies(strategies []QuestionStrategy) []QuestionStrategy {
	if strategies == nil {
		return nil
	}
	cloned := make([]QuestionStrategy, len(strategies))
	copy(cloned, strategies)
	for index := range cloned {
		source := strategies[index]
		cloned[index].Probabilities = source.Probabilities.Clone()
		cloned[index].CustomWeights = source.CustomWeights.Clone()
		cloned[index].Texts = append([]string(nil), source.Texts...)
		cloned[index].QuestionNum = cloneIntPointer(source.QuestionNum)
		cloned[index].QuestionTitle = cloneStringPointer(source.QuestionTitle)
		cloned[index].ProviderQuestionID = cloneStringPointer(source.ProviderQuestionID)
		cloned[index].ProviderPageID = cloneStringPointer(source.ProviderPageID)
		cloned[index].OptionFillTexts = cloneStringPointers(source.OptionFillTexts)
		cloned[index].FillableOptionIndices = append([]int(nil), source.FillableOptionIndices...)
		cloned[index].AttachedOptionSelects = CloneAttachedOptionSelects(source.AttachedOptionSelects)
		cloned[index].LocationParts = append([]string(nil), source.LocationParts...)
		cloned[index].MultiTextBlankModes = append([]string(nil), source.MultiTextBlankModes...)
		cloned[index].MultiTextBlankAIFlags = append([]bool(nil), source.MultiTextBlankAIFlags...)
		cloned[index].MultiTextBlankIntRanges = cloneIntRows(source.MultiTextBlankIntRanges)
		cloned[index].TextRandomIntRange = append([]int(nil), source.TextRandomIntRange...)
	}
	return cloned
}

func CloneAttachedOptionSelects(selects []AttachedOptionSelect) []AttachedOptionSelect {
	if selects == nil {
		return nil
	}
	cloned := make([]AttachedOptionSelect, len(selects))
	copy(cloned, selects)
	for index := range cloned {
		cloned[index].SelectTexts = append([]string(nil), selects[index].SelectTexts...)
	}
	return cloned
}

func cloneConsistencyRules(rules []ConsistencyRule) []ConsistencyRule {
	if rules == nil {
		return nil
	}
	cloned := make([]ConsistencyRule, len(rules))
	copy(cloned, rules)
	for index := range cloned {
		source := rules[index]
		cloned[index].ConditionOptionIndices = append([]int(nil), source.ConditionOptionIndices...)
		cloned[index].TargetOptionIndices = append([]int(nil), source.TargetOptionIndices...)
		cloned[index].ConditionRowIndex = cloneIntPointer(source.ConditionRowIndex)
		cloned[index].TargetRowIndex = cloneIntPointer(source.TargetRowIndex)
	}
	return cloned
}

func cloneJumpRules(rules []JumpRule) []JumpRule {
	cloned := append([]JumpRule(nil), rules...)
	for index := range cloned {
		cloned[index].OptionText = cloneStringPointer(rules[index].OptionText)
	}
	return cloned
}

func cloneDisplayConditions(conditions []DisplayCondition) []DisplayCondition {
	cloned := append([]DisplayCondition(nil), conditions...)
	for index := range cloned {
		cloned[index].OptionIndices = append([]int(nil), conditions[index].OptionIndices...)
		cloned[index].RowIndex = cloneIntPointer(conditions[index].RowIndex)
	}
	return cloned
}

func cloneDisplayControls(controls []DisplayControl) []DisplayControl {
	cloned := append([]DisplayControl(nil), controls...)
	for index := range cloned {
		cloned[index].OptionIndices = append([]int(nil), controls[index].OptionIndices...)
		cloned[index].RowIndex = cloneIntPointer(controls[index].RowIndex)
	}
	return cloned
}

func cloneQuestionMedia(media []QuestionMedia) []QuestionMedia {
	cloned := append([]QuestionMedia(nil), media...)
	for index := range cloned {
		cloned[index].Index = cloneIntPointer(media[index].Index)
	}
	return cloned
}

func cloneStringPointers(values []*string) []*string {
	if values == nil {
		return nil
	}
	cloned := make([]*string, len(values))
	for index := range values {
		cloned[index] = cloneStringPointer(values[index])
	}
	return cloned
}

func cloneIntRows(rows [][]int) [][]int {
	if rows == nil {
		return nil
	}
	cloned := make([][]int, len(rows))
	for index := range rows {
		cloned[index] = append([]int(nil), rows[index]...)
	}
	return cloned
}

func cloneIntPointer(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
