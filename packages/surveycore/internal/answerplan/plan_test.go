package answerplan

import (
	"regexp"
	"strings"
	"testing"

	"surveycontroller/surveycore/internal/model"
	"surveycontroller/surveycore/internal/runerror"
)

type fakeAnswerRuntime struct {
	total  int
	counts []int
}

func intPtr(value int) *int { return &value }

func (f fakeAnswerRuntime) SnapshotDistributionStats(_ string, optionCount int) (int, []int) {
	counts := make([]int, optionCount)
	copy(counts, f.counts)
	return f.total, counts
}

func (f fakeAnswerRuntime) AppendPendingDistributionChoice(_ string, _ string, _ int, _ int) {}
func (f fakeAnswerRuntime) CommitPendingDistribution(_ string) int                           { return 0 }
func (f fakeAnswerRuntime) ResetPendingDistribution(_ string)                                {}

func TestBuildActionUsesMatrixRowProbabilities(t *testing.T) {
	action, err := BuildAction(model.QuestionMeta{
		Num:          3,
		ProviderType: "matrix",
		TypeCode:     "6",
		Rows:         2,
		Options:      2,
	}, model.QuestionStrategy{
		QuestionType:  "matrix",
		Probabilities: model.RowWeights([]float64{0, 1}, []float64{1, 0}),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(action.MatrixIndices) != 2 || action.MatrixIndices[0] != 1 || action.MatrixIndices[1] != 0 {
		t.Fatalf("matrix indices = %#v", action.MatrixIndices)
	}
}

func TestBuildActionRejectsUnknownQuestionType(t *testing.T) {
	_, err := BuildAction(model.QuestionMeta{
		Num:          9,
		ProviderType: "new_platform_widget",
		TypeCode:     "99",
	}, model.QuestionStrategy{})
	if err == nil {
		t.Fatal("expected unsupported question error")
	}
	kind, ok := runerror.KindOf(err)
	if !ok || kind != runerror.KindUnsupported {
		t.Fatalf("kind = %q, ok = %v, err = %v", kind, ok, err)
	}
	if !strings.Contains(err.Error(), "第9题") || !strings.Contains(err.Error(), "new_platform_widget") || !strings.Contains(err.Error(), "99") {
		t.Fatalf("err = %v", err)
	}
}

func TestBuildActionKeepsExplicitTextQuestion(t *testing.T) {
	action, err := BuildAction(model.QuestionMeta{
		Num:          1,
		ProviderType: "text",
		TypeCode:     "1",
		TextInputs:   1,
	}, model.QuestionStrategy{QuestionType: "text", Texts: []string{"正常文本"}})
	if err != nil {
		t.Fatal(err)
	}
	if action.Kind != "text" || len(action.TextValues) != 1 || action.TextValues[0] != "正常文本" {
		t.Fatalf("action = %#v", action)
	}
}

func TestBuildActionsAppliesAnswerRuleToLaterQuestion(t *testing.T) {
	q1 := 1
	q2 := 2
	actions, err := BuildActions([]model.QuestionMeta{
		{Num: 1, ProviderType: "single", TypeCode: "3", Options: 2},
		{Num: 2, ProviderType: "single", TypeCode: "3", Options: 3},
	}, []model.QuestionStrategy{
		{QuestionType: "single", QuestionNum: &q1, Probabilities: model.OptionWeights(0, 1)},
		{QuestionType: "single", QuestionNum: &q2, Probabilities: model.OptionWeights(1, 1, 1)},
	}, BuildOptions{AnswerRules: []model.ConsistencyRule{{
		ConditionQuestionNum: 1, ConditionMode: "selected", ConditionOptionIndices: []int{1},
		TargetQuestionNum: 2, ActionMode: "must_select", TargetOptionIndices: []int{2},
	}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(actions) != 2 || len(actions[1].SelectedIndices) != 1 || actions[1].SelectedIndices[0] != 2 {
		t.Fatalf("actions = %#v", actions)
	}
}

func TestBuildActionsAppliesMatrixRowAnswerRule(t *testing.T) {
	q1 := 1
	q2 := 2
	actions, err := BuildActions([]model.QuestionMeta{
		{Num: 1, ProviderType: "matrix", TypeCode: "6", Options: 2, Rows: 2},
		{Num: 2, ProviderType: "matrix", TypeCode: "6", Options: 2, Rows: 2},
	}, []model.QuestionStrategy{
		{QuestionType: "matrix", QuestionNum: &q1, Probabilities: model.RowWeights([]float64{1, 0}, []float64{0, 1})},
		{QuestionType: "matrix", QuestionNum: &q2, Probabilities: model.RowWeights([]float64{1, 1}, []float64{1, 1})},
	}, BuildOptions{AnswerRules: []model.ConsistencyRule{{
		ConditionQuestionNum: 1, ConditionMode: "selected", ConditionOptionIndices: []int{1}, ConditionRowIndex: intPtr(1),
		TargetQuestionNum: 2, ActionMode: "must_not_select", TargetOptionIndices: []int{0}, TargetRowIndex: intPtr(0),
	}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(actions) != 2 || len(actions[1].MatrixIndices) != 2 || actions[1].MatrixIndices[0] != 1 {
		t.Fatalf("actions = %#v", actions)
	}
}

func TestSelectedIndicesUsesPercentProbabilities(t *testing.T) {
	selected := SelectedIndices(model.QuestionStrategy{Probabilities: model.OptionWeights(100, 0, 0)}, 3, 1, 3)
	if len(selected) != 1 || selected[0] != 0 {
		t.Fatalf("selected = %#v", selected)
	}
	selected = SelectedIndices(model.QuestionStrategy{Probabilities: model.OptionWeights(0, 0, 100)}, 3, 1, 3)
	if len(selected) != 1 || selected[0] != 2 {
		t.Fatalf("selected = %#v", selected)
	}
	for index := 0; index < 20; index++ {
		selected = SelectedIndices(model.QuestionStrategy{Probabilities: model.OptionWeights(100, 100, 100)}, 3, 1, 2)
		if len(selected) > 2 || len(selected) == 0 {
			t.Fatalf("selected = %#v", selected)
		}
	}
}

func TestResolveDistributionProbabilitiesBoostsUnderservedOption(t *testing.T) {
	values := resolveDistributionProbabilities([]float64{1, 1}, 2, fakeAnswerRuntime{
		total:  12,
		counts: []int{12, 0},
	}, 1, nil)
	if len(values) != 2 || values[1] <= values[0] {
		t.Fatalf("values = %#v", values)
	}
}

func TestApplyPersonaBoostMatchesKeywords(t *testing.T) {
	values := applyPersonaBoost([]string{"男", "女"}, []float64{1, 1}, &model.Persona{Gender: "女"})
	if len(values) != 2 || values[1] <= values[0] {
		t.Fatalf("values = %#v", values)
	}
}

func TestApplyDimensionTendencyReusesDimensionBase(t *testing.T) {
	bases := map[string]float64{}
	first := applyDimensionTendency([]float64{0, 0, 0, 0, 1}, 5, "服务", bases, nil)
	second := applyDimensionTendency([]float64{1, 1, 1, 1, 1}, 5, "服务", bases, nil)
	if len(first) != 5 || len(second) != 5 || second[4] <= second[0] {
		t.Fatalf("first=%#v second=%#v bases=%#v", first, second, bases)
	}
}

func TestOptionFillTextFallsBackForFillableOption(t *testing.T) {
	question := model.QuestionMeta{FillableOptions: []int{1}}
	entry := model.QuestionStrategy{}
	if got := OptionFillText(entry, question, 1); got != defaultFillText {
		t.Fatalf("fill text = %q", got)
	}
}

func TestResolveTextValuesUsesPersonaForIDCardGender(t *testing.T) {
	values := ResolveTextValuesWithPersona(model.QuestionStrategy{
		QuestionType: "text",
		Texts:        []string{randomIDCardToken},
	}, model.QuestionMeta{Num: 1, ProviderType: "text", TextInputs: 1}, 1, &model.Persona{Gender: "女", AgeGroup: "26-35"})
	if len(values) != 1 || len(values[0]) != 18 {
		t.Fatalf("values = %#v", values)
	}
	genderDigit := values[0][16] - '0'
	if genderDigit%2 != 0 {
		t.Fatalf("id card = %q", values[0])
	}
}

func TestBuildActionsMultipleRuleMustSelectOverridesZeroWeight(t *testing.T) {
	q1 := 1
	q2 := 2
	actions, err := BuildActions([]model.QuestionMeta{
		{Num: 1, ProviderType: "single", TypeCode: "3", Options: 2},
		{Num: 2, ProviderType: "multiple", TypeCode: "4", Options: 3},
	}, []model.QuestionStrategy{
		{QuestionType: "single", QuestionNum: &q1, Probabilities: model.OptionWeights(0, 1)},
		{QuestionType: "multiple", QuestionNum: &q2, Probabilities: model.OptionWeights(0, 0, 0)},
	}, BuildOptions{AnswerRules: []model.ConsistencyRule{{
		ConditionQuestionNum: 1, ConditionMode: "selected", ConditionOptionIndices: []int{1},
		TargetQuestionNum: 2, ActionMode: "must_select", TargetOptionIndices: []int{2},
	}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(actions) != 2 || len(actions[1].SelectedIndices) != 1 || actions[1].SelectedIndices[0] != 2 {
		t.Fatalf("actions = %#v", actions)
	}
}

func TestBuildActionResolvesTextCandidatesAndBlankModes(t *testing.T) {
	action, err := BuildAction(model.QuestionMeta{
		Num:          1,
		ProviderType: "multi_text",
		TypeCode:     "9",
		TextInputs:   3,
	}, model.QuestionStrategy{
		QuestionType:            "multi_text",
		Probabilities:           model.OptionWeights(0, 1),
		Texts:                   []string{"甲||乙||丙", "A||B||C"},
		MultiTextBlankModes:     []string{"none", "mobile", "integer"},
		MultiTextBlankIntRanges: [][]int{{}, {}, {7, 7}},
	})
	if err != nil {
		t.Fatal(err)
	}
	mobileRE := regexp.MustCompile(`^1\d{10}$`)
	if len(action.TextValues) != 3 || action.TextValues[0] != "A" || !mobileRE.MatchString(action.TextValues[1]) || action.TextValues[2] != "7" {
		t.Fatalf("text values = %#v", action.TextValues)
	}
}

func TestBuildActionResolvesTextRandomMode(t *testing.T) {
	action, err := BuildAction(model.QuestionMeta{
		Num:          1,
		ProviderType: "text",
		TypeCode:     "1",
		TextInputs:   1,
	}, model.QuestionStrategy{
		QuestionType:       "text",
		Probabilities:      model.OptionWeights(1),
		Texts:              []string{"普通文本"},
		TextRandomMode:     "integer",
		TextRandomIntRange: []int{42, 42},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(action.TextValues) != 1 || action.TextValues[0] != "42" {
		t.Fatalf("text values = %#v", action.TextValues)
	}
}

func TestBuildActionsWithLogicSkipsHiddenQuestion(t *testing.T) {
	q1 := 1
	q2 := 2
	q3 := 3
	actions, err := BuildActionsWithLogic([]model.QuestionMeta{
		{Num: 1, ProviderType: "single", TypeCode: "3", Options: 2, QuestionLogic: model.QuestionLogic{LogicStatus: model.LogicParseStatusNone}},
		{
			Num:           2,
			ProviderType:  "single",
			TypeCode:      "3",
			Options:       2,
			QuestionLogic: model.QuestionLogic{HasDisplayCondition: true, DisplayConditions: []model.DisplayCondition{{QuestionNum: 1, Mode: "not_selected", OptionIndices: []int{0}}}, LogicStatus: model.LogicParseStatusComplete},
		},
		{Num: 3, ProviderType: "single", TypeCode: "3", Options: 2, QuestionLogic: model.QuestionLogic{LogicStatus: model.LogicParseStatusNone}},
	}, []model.QuestionStrategy{
		{QuestionType: "single", QuestionNum: &q1, Probabilities: model.OptionWeights(1, 0)},
		{QuestionType: "single", QuestionNum: &q2, Probabilities: model.OptionWeights(1, 0)},
		{QuestionType: "single", QuestionNum: &q3, Probabilities: model.OptionWeights(1, 0)},
	}, BuildOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if len(actions) != 2 || actions[0].QuestionNum != 1 || actions[1].QuestionNum != 3 {
		t.Fatalf("actions = %#v", actions)
	}
}

func TestBuildActionsWithLogicJumpTerminatesEarly(t *testing.T) {
	q1 := 1
	q2 := 2
	actions, err := BuildActionsWithLogic([]model.QuestionMeta{
		{
			Num:           1,
			ProviderType:  "single",
			TypeCode:      "3",
			Options:       2,
			QuestionLogic: model.QuestionLogic{HasJump: true, JumpRules: []model.JumpRule{{OptionIndex: 0, TargetQuestion: 3}}, LogicStatus: model.LogicParseStatusComplete},
		},
		{Num: 2, ProviderType: "single", TypeCode: "3", Options: 2, QuestionLogic: model.QuestionLogic{LogicStatus: model.LogicParseStatusNone}},
	}, []model.QuestionStrategy{
		{QuestionType: "single", QuestionNum: &q1, Probabilities: model.OptionWeights(1, 0)},
		{QuestionType: "single", QuestionNum: &q2, Probabilities: model.OptionWeights(1, 0)},
	}, BuildOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if len(actions) != 1 || actions[0].QuestionNum != 1 {
		t.Fatalf("actions = %#v", actions)
	}
}

func TestBuildActionsWithLogicRejectsUnknownJump(t *testing.T) {
	_, err := BuildActionsWithLogic([]model.QuestionMeta{{
		Num:           1,
		QuestionLogic: model.QuestionLogic{HasJump: true, LogicStatus: model.LogicParseStatusUnknown},
	}}, nil, BuildOptions{})
	if err == nil || !strings.Contains(err.Error(), "逻辑规则未完整解析") {
		t.Fatalf("err = %v", err)
	}
}
