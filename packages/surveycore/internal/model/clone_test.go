package model

import "testing"

func TestCloneRunModelsDoNotShareMutableState(t *testing.T) {
	row := 1
	text := "source"
	questionNum := 3
	definition := SurveyDefinition{Questions: []QuestionMeta{{
		Num:         questionNum,
		OptionTexts: []string{"A", "B"},
		QuestionLogic: QuestionLogic{
			DisplayConditions:      []DisplayCondition{{OptionIndices: []int{1}, RowIndex: &row}},
			ControlsDisplayTargets: []DisplayControl{{OptionIndices: []int{0}, RowIndex: &row}},
		},
		AttachedOptionSelects: []AttachedOptionSelect{{SelectTexts: []string{"X"}}},
		ForcedOptionIdx:       &row,
	}}}
	plan := AnswerPlan{
		Rules: []ConsistencyRule{{ConditionOptionIndices: []int{1}, TargetOptionIndices: []int{0}, ConditionRowIndex: &row}},
		Strategies: []QuestionStrategy{{
			QuestionNum:             &questionNum,
			QuestionTitle:           &text,
			Probabilities:           RowWeights([]float64{0.4, 0.6}),
			OptionFillTexts:         []*string{&text},
			AttachedOptionSelects:   []AttachedOptionSelect{{SelectTexts: []string{"Y"}}},
			MultiTextBlankIntRanges: [][]int{{1, 9}},
		}},
	}

	clonedDefinition := CloneSurveyDefinition(definition)
	clonedPlan := CloneAnswerPlan(plan)
	clonedDefinition.Questions[0].OptionTexts[0] = "changed"
	clonedDefinition.Questions[0].DisplayConditions[0].OptionIndices[0] = 9
	*clonedDefinition.Questions[0].ForcedOptionIdx = 9
	clonedDefinition.Questions[0].AttachedOptionSelects[0].SelectTexts[0] = "changed"
	clonedPlan.Rules[0].ConditionOptionIndices[0] = 9
	*clonedPlan.Rules[0].ConditionRowIndex = 9
	clonedPlan.Strategies[0].Probabilities.Rows[0][0] = 1
	*clonedPlan.Strategies[0].QuestionTitle = "changed"
	*clonedPlan.Strategies[0].OptionFillTexts[0] = "changed"
	clonedPlan.Strategies[0].AttachedOptionSelects[0].SelectTexts[0] = "changed"
	clonedPlan.Strategies[0].MultiTextBlankIntRanges[0][0] = 9

	if definition.Questions[0].OptionTexts[0] != "A" || definition.Questions[0].DisplayConditions[0].OptionIndices[0] != 1 || *definition.Questions[0].ForcedOptionIdx != 1 {
		t.Fatalf("definition mutated: %#v", definition)
	}
	if definition.Questions[0].AttachedOptionSelects[0].SelectTexts[0] != "X" {
		t.Fatalf("definition nested slice mutated: %#v", definition)
	}
	strategy := plan.Strategies[0]
	if plan.Rules[0].ConditionOptionIndices[0] != 1 || *plan.Rules[0].ConditionRowIndex != 1 || strategy.Probabilities.Rows[0][0] != 0.4 {
		t.Fatalf("answer plan mutated: %#v", plan)
	}
	if *strategy.QuestionTitle != "source" || *strategy.OptionFillTexts[0] != "source" || strategy.AttachedOptionSelects[0].SelectTexts[0] != "Y" || strategy.MultiTextBlankIntRanges[0][0] != 1 {
		t.Fatalf("answer plan nested state mutated: %#v", plan)
	}
}
