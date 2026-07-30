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

func TestBuildSubmitDataIncludesSkippedQuestionPlaceholders(t *testing.T) {
	data, err := buildSubmitData([]model.QuestionMeta{
		{Num: 1, TypeCode: "3", Options: 2},
		{Num: 2, TypeCode: "11", Options: 3},
		{Num: 3, TypeCode: "3", Options: 2},
		{Num: 4, TypeCode: "1", TextInputs: 1},
		{Num: 5, TypeCode: "4", Options: 2},
		{Num: 6, TypeCode: "0", IsDescription: true},
	}, []model.AnswerAction{
		{QuestionNum: 1, Kind: model.QuestionKindSingle, SelectedIndices: []int{1}},
		{QuestionNum: 5, Kind: model.QuestionKindMultiple, SelectedIndices: []int{0, 1}},
	})
	if err != nil {
		t.Fatal(err)
	}
	const want = "1$2}2$-3,-3,-3}3$-3}4$(跳过)}5$1|2"
	if data != want {
		t.Fatalf("submitdata = %q, want %q", data, want)
	}
}

func TestBuildSubmitDataUsesQuestionTypeSpecificPlaceholders(t *testing.T) {
	data, err := buildSubmitData([]model.QuestionMeta{
		{Num: 1, TypeCode: "3"},
		{Num: 2, TypeCode: "4"},
		{Num: 3, TypeCode: "5"},
		{Num: 4, TypeCode: "7"},
		{Num: 5, TypeCode: "11", Options: 2},
		{Num: 6, TypeCode: "6", Rows: 2},
		{Num: 7, TypeCode: "1"},
		{Num: 8, TypeCode: "2"},
		{Num: 9, TypeCode: "8"},
		{Num: 10, TypeCode: "9"},
		{Num: 11, TypeCode: "33"},
		{Num: 12, TypeCode: "34"},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	const want = "1$-3}2$-3}3$-3}4$-3}5$-3,-3}6$1!-3,2!-3}7$(跳过)}8$(跳过)}9$(跳过)}10$(跳过)}11$(跳过)}12$(跳过)"
	if data != want {
		t.Fatalf("submitdata = %q, want %q", data, want)
	}
}

func TestBuildSubmitDataEscapesUserTextAndUsesFillDelimiter(t *testing.T) {
	data, err := buildSubmitData([]model.QuestionMeta{
		{Num: 9, TypeCode: "4", Options: 2},
		{Num: 10, TypeCode: "1", TextInputs: 2},
	}, []model.AnswerAction{
		{
			QuestionNum:     9,
			Kind:            model.QuestionKindMultiple,
			SelectedIndices: []int{1},
			OptionFillTexts: map[int]string{1: "改进!内容^A$B}C|D<"},
		},
		{QuestionNum: 10, Kind: model.QuestionKindMultiText, TextValues: []string{"A!B", "C$D"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	const want = "9$2^改进！内容ˆAξB｝C¦D＜}10$A！B^CξD"
	if data != want {
		t.Fatalf("submitdata = %q, want %q", data, want)
	}
}
