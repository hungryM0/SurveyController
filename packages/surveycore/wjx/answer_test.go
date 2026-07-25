package wjx

import (
	"strings"
	"testing"

	"surveycontroller/surveycore/internal/model"
)

func TestBuildSubmitDataAppliesAnswerRules(t *testing.T) {
	data, err := buildSubmitData([]model.QuestionMeta{
		{Num: 1, Provider: model.ProviderWJX, ProviderType: "single", TypeCode: "3", Options: 2},
		{Num: 2, Provider: model.ProviderWJX, ProviderType: "single", TypeCode: "3", Options: 3},
	}, []model.AnswerAction{{QuestionNum: 1, Kind: model.QuestionKindSingle, SelectedIndices: []int{1}}, {QuestionNum: 2, Kind: model.QuestionKindSingle, SelectedIndices: []int{2}}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(data, "1$2") || !strings.Contains(data, "2$3") {
		t.Fatalf("submitdata = %q", data)
	}
}
