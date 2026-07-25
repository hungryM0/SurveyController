package psychometrics

import (
	"testing"

	"surveycontroller/surveycore/internal/model"
)

func TestBuildJointPlanAppliesScaleSamples(t *testing.T) {
	q1 := 1
	q2 := 2
	cfg := &model.RunRequest{
		ExecutionPlan:      model.ExecutionPlan{Target: 12},
		PsychometricPolicy: model.PsychometricPolicy{Enabled: true, TargetAlpha: 0.85},
		SurveyDefinition: model.SurveyDefinition{Questions: []model.QuestionMeta{
			{Num: 1, ProviderType: "scale", TypeCode: "5", Options: 5},
			{Num: 2, ProviderType: "scale", TypeCode: "5", Options: 5},
		}},
		AnswerPlan: model.AnswerPlan{Strategies: []model.QuestionStrategy{
			{QuestionType: "scale", QuestionNum: &q1, Probabilities: model.OptionWeights(1, 1, 1, 1, 1)},
			{QuestionType: "scale", QuestionNum: &q2, Probabilities: model.OptionWeights(1, 1, 1, 1, 1)},
		}},
	}

	plan := BuildJointPlan(cfg)
	if plan == nil {
		t.Fatal("plan is nil")
	}
	entries := ApplySample(cfg.AnswerPlan.Strategies, cfg.SurveyDefinition.Questions, plan, 0)
	if len(entries) != 2 {
		t.Fatalf("entries = %#v", entries)
	}
	for _, entry := range entries {
		values := entry.Probabilities.Values()
		if len(values) != 5 {
			t.Fatalf("probabilities = %#v", entry.Probabilities)
		}
		total := 0.0
		ones := 0
		for _, value := range values {
			total += value
			if value == 1 {
				ones++
			}
		}
		if total != 1 || ones != 1 {
			t.Fatalf("probabilities = %#v", values)
		}
	}
}

func TestBuildJointPlanSkipsPlainSingleWithoutOrdinalOptions(t *testing.T) {
	q1 := 1
	q2 := 2
	cfg := &model.RunRequest{
		ExecutionPlan:      model.ExecutionPlan{Target: 5},
		PsychometricPolicy: model.PsychometricPolicy{Enabled: true},
		SurveyDefinition: model.SurveyDefinition{Questions: []model.QuestionMeta{
			{Num: 1, ProviderType: "single", TypeCode: "3", Options: 2, OptionTexts: []string{"苹果", "香蕉"}},
			{Num: 2, ProviderType: "single", TypeCode: "3", Options: 2, OptionTexts: []string{"红色", "蓝色"}},
		}},
		AnswerPlan: model.AnswerPlan{Strategies: []model.QuestionStrategy{
			{QuestionType: "single", QuestionNum: &q1, Probabilities: model.OptionWeights(1, 1)},
			{QuestionType: "single", QuestionNum: &q2, Probabilities: model.OptionWeights(1, 1)},
		}},
	}
	if plan := BuildJointPlan(cfg); plan != nil {
		t.Fatalf("plan = %#v", plan)
	}
}
