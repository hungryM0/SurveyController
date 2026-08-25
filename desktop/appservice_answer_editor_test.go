package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/SurveyController/SurveyCore/pkg/surveycore/model"
)

func TestBuildAnswerEditorViewUsesNormalizedStrategyTypesAcrossProviders(t *testing.T) {
	tests := []struct {
		provider     string
		providerType string
		kind         model.QuestionKind
		label        string
	}{
		{model.ProviderWJX, "3", model.QuestionKindSingle, "单选题"},
		{model.ProviderQQ, "checkbox", model.QuestionKindMultiple, "多选题"},
		{model.ProviderCredamo, "matrix_radio", model.QuestionKindMatrix, "矩阵题"},
	}
	for _, test := range tests {
		t.Run(test.provider, func(t *testing.T) {
			document := testConfigDocument("https://example.test/survey", test.provider)
			questionNum := 1
			document.Survey.Definition.Questions = []model.QuestionMeta{{
				Num: 1, Title: "题目", Provider: test.provider, ProviderType: test.providerType, Page: 1,
			}}
			document.Answers.Strategies = []model.QuestionStrategy{{QuestionNum: &questionNum, QuestionType: test.kind}}

			view, err := NewAppService().BuildAnswerEditorView(BuildAnswerEditorViewRequest{Config: document})
			if err != nil {
				t.Fatal(err)
			}
			if len(view.Questions) != 1 || view.Questions[0].QuestionType != test.kind || view.Questions[0].QuestionTypeLabel != test.label {
				t.Fatalf("question = %#v", view.Questions)
			}
			raw, err := json.Marshal(view)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(raw), test.providerType) {
				t.Fatalf("provider type leaked into view: %s", raw)
			}
		})
	}
}

func TestBuildAnswerEditorViewClampsPagesAndMarksMissingStrategyUnsupported(t *testing.T) {
	document := testConfigDocument("https://example.test/survey", model.ProviderQQ)
	document.Survey.Definition.Questions = []model.QuestionMeta{
		{Num: 1, Title: "第一题", ProviderType: "radio", Page: 0},
		{Num: 2, Title: "第二题", ProviderType: "checkbox", Page: -2, Unsupported: true, UnsupportedReason: "平台暂不支持"},
	}
	view, err := NewAppService().BuildAnswerEditorView(BuildAnswerEditorViewRequest{Config: document})
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Pages) != 1 || view.Pages[0].Page != 1 || view.Pages[0].QuestionCount != 2 {
		t.Fatalf("pages = %#v", view.Pages)
	}
	for _, question := range view.Questions {
		if question.Page != 1 || question.PageQuestionCount != 2 || !question.Unsupported || question.QuestionTypeLabel != "暂不支持" || question.Strategy != nil {
			t.Fatalf("question = %#v", question)
		}
	}
	if view.Questions[0].UnsupportedReason != "该题没有可编辑的答案策略" {
		t.Fatalf("reason = %q", view.Questions[0].UnsupportedReason)
	}
}

func TestBuildAnswerEditorViewReturnsLogicRelationsAndSegmentedSearch(t *testing.T) {
	document := testConfigDocument("https://example.test/survey", model.ProviderWJX)
	q1, q2, q3 := 1, 2, 3
	optionText := "否"
	document.Survey.Definition.Questions = []model.QuestionMeta{
		{Num: q1, Title: "是否继续", Page: 1, OptionTexts: []string{"是", "否"}, QuestionLogic: model.QuestionLogic{
			LogicStatus:            model.LogicParseStatusComplete,
			JumpRules:              []model.JumpRule{{OptionIndex: 1, OptionText: &optionText, TargetQuestion: q3}},
			ControlsDisplayTargets: []model.DisplayControl{{TargetQuestionNum: q2, Mode: "selected", OptionIndices: []int{0}}},
		}},
		{Num: q2, Title: "补充说明", Page: 1, QuestionLogic: model.QuestionLogic{
			LogicStatus:       model.LogicParseStatusComplete,
			DisplayConditions: []model.DisplayCondition{{QuestionNum: q1, Mode: "selected", OptionIndices: []int{0}}},
		}},
		{Num: q3, Title: "矩阵评价", Page: 1, RowTexts: []string{"服务", "速度"}},
	}
	document.Answers.Strategies = []model.QuestionStrategy{
		{QuestionNum: &q1, QuestionType: model.QuestionKindSingle},
		{QuestionNum: &q2, QuestionType: model.QuestionKindText},
		{QuestionNum: &q3, QuestionType: model.QuestionKindMatrix},
	}
	view, err := NewAppService().BuildAnswerEditorView(BuildAnswerEditorViewRequest{Config: document})
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Questions[0].OutboundRelations) != 2 || len(view.Questions[1].InboundRelations) != 1 || len(view.Questions[2].InboundRelations) != 1 {
		t.Fatalf("relations = %#v", view.Questions)
	}
	if !strings.Contains(view.Questions[0].LogicSummary, "2 条出站关系") {
		t.Fatalf("logic summary = %q", view.Questions[0].LogicSummary)
	}
	kinds := map[string]bool{}
	for _, segment := range view.Questions[0].SearchSegments {
		kinds[segment.Kind] = true
	}
	if !kinds["title"] || !kinds["option"] || !kinds["logic"] {
		t.Fatalf("segments = %#v", view.Questions[0].SearchSegments)
	}
	if view.Questions[2].SearchSegments[1].Kind != "row" {
		t.Fatalf("matrix segments = %#v", view.Questions[2].SearchSegments)
	}
}

func TestApplyAnswerEditorChangesMergesDraftAndReturnsCompleteConfig(t *testing.T) {
	document := testConfigDocument("https://example.test/survey", model.ProviderWJX)
	questionNum := 1
	document.Survey.Definition.Questions = []model.QuestionMeta{{Num: questionNum, Title: "满意度", Page: 1, Options: 2}}
	document.Answers.Strategies = []model.QuestionStrategy{{
		QuestionNum: &questionNum, QuestionType: model.QuestionKindSingle, OptionCount: 2,
		Probabilities: model.OptionWeights(1, 1), DistributionMode: "random",
	}}
	result, err := NewAppService().ApplyAnswerEditorChanges(ApplyAnswerEditorChangesRequest{
		Config: document,
		Changes: []AnswerEditorStrategyDraft{{
			QuestionNum: questionNum, DistributionMode: "custom", CustomWeights: model.OptionWeights(25, 75), Dimension: "服务", PsychoBias: "positive",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Config == nil || len(result.Errors) != 0 {
		t.Fatalf("result = %#v", result)
	}
	strategy := result.Config.Answers.Strategies[0]
	if strategy.QuestionType != model.QuestionKindSingle || strategy.DistributionMode != "custom" || strategy.CustomWeights.Options[1] != 75 || strategy.Dimension != "服务" {
		t.Fatalf("strategy = %#v", strategy)
	}
	if document.Answers.Strategies[0].DistributionMode != "random" || len(document.Answers.Strategies[0].CustomWeights.Options) != 0 {
		t.Fatalf("input config was mutated: %#v", document.Answers.Strategies[0])
	}
}

func TestApplyAnswerEditorChangesIsAtomicOnValidationFailure(t *testing.T) {
	document := testConfigDocument("https://example.test/survey", model.ProviderWJX)
	q1, q2 := 1, 2
	document.Survey.Definition.Questions = []model.QuestionMeta{
		{Num: q1, Title: "第一题", Options: 2},
		{Num: q2, Title: "第二题", Options: 2},
	}
	document.Answers.Strategies = []model.QuestionStrategy{
		{QuestionNum: &q1, QuestionType: model.QuestionKindSingle, OptionCount: 2, DistributionMode: "random", Probabilities: model.OptionWeights(1, 1)},
		{QuestionNum: &q2, QuestionType: model.QuestionKindSingle, OptionCount: 2, DistributionMode: "random", Probabilities: model.OptionWeights(1, 1)},
	}
	result, err := NewAppService().ApplyAnswerEditorChanges(ApplyAnswerEditorChangesRequest{
		Config: document,
		Changes: []AnswerEditorStrategyDraft{
			{QuestionNum: q1, DistributionMode: "custom", CustomWeights: model.OptionWeights(20, 80)},
			{QuestionNum: q2, DistributionMode: "custom", CustomWeights: model.OptionWeights(0, 0)},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Config != nil || len(result.Errors) != 1 || result.Errors[0].QuestionNum != q2 || result.Errors[0].Field != "customWeights.options" {
		t.Fatalf("result = %#v", result)
	}
	if document.Answers.Strategies[0].DistributionMode != "random" {
		t.Fatalf("input config was mutated: %#v", document.Answers.Strategies)
	}
}

func TestAnswerEditorRPCMethods(t *testing.T) {
	document := testConfigDocument("https://example.test/survey", model.ProviderWJX)
	payload, err := json.Marshal(BuildAnswerEditorViewRequest{Config: document})
	if err != nil {
		t.Fatal(err)
	}
	response, err := newRPCHandler(NewAppService()).Handle(context.Background(), rpcMethodBuildAnswerEditor, payload)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := response.(AnswerEditorView); !ok {
		t.Fatalf("response = %#v", response)
	}
	_, err = newRPCHandler(NewAppService()).Handle(context.Background(), rpcMethodApplyAnswerChanges, json.RawMessage(`{"config":`))
	if err == nil || !strings.Contains(err.Error(), "unexpected end of JSON input") {
		t.Fatalf("err = %v", err)
	}
}
