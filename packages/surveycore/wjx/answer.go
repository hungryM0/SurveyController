package wjx

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"surveycontroller/surveycore/internal/model"
	"surveycontroller/surveycore/internal/runerror"
)

type answerAction struct {
	QuestionNum int
	Kind        string
	Indices     []int
	Matrix      []int
	Texts       []string
	SliderValue string
	OptionFills map[int]string
}

func toWJXAction(action model.AnswerAction) answerAction {
	return answerAction{
		QuestionNum: action.QuestionNum,
		Kind:        string(action.Kind),
		Indices:     append([]int(nil), action.SelectedIndices...),
		Matrix:      append([]int(nil), action.MatrixIndices...),
		Texts:       append([]string(nil), action.TextValues...),
		SliderValue: action.SliderValue,
		OptionFills: cloneOptionFills(action.OptionFillTexts),
	}
}

func cloneOptionFills(src map[int]string) map[int]string {
	dst := map[int]string{}
	for key, value := range src {
		dst[key] = value
	}
	return dst
}

func buildSubmitData(questions []model.QuestionMeta, planned []model.AnswerAction) (string, error) {
	actions := make(map[int]answerAction, len(planned))
	for _, action := range planned {
		wjxAction := toWJXAction(action)
		if wjxAction.QuestionNum > 0 {
			actions[wjxAction.QuestionNum] = wjxAction
		}
	}
	questionByNum := make(map[int]model.QuestionMeta, len(questions))
	descriptionNums := make(map[int]struct{})
	orderedNums := make([]int, 0, len(questions)+len(actions))
	seen := make(map[int]struct{}, len(questions)+len(actions))
	for _, question := range questions {
		if question.Num <= 0 {
			continue
		}
		if question.IsDescription {
			descriptionNums[question.Num] = struct{}{}
			continue
		}
		questionByNum[question.Num] = question
		if _, exists := seen[question.Num]; !exists {
			seen[question.Num] = struct{}{}
			orderedNums = append(orderedNums, question.Num)
		}
	}
	for questionNum := range actions {
		if _, description := descriptionNums[questionNum]; description {
			continue
		}
		if _, exists := seen[questionNum]; !exists {
			seen[questionNum] = struct{}{}
			orderedNums = append(orderedNums, questionNum)
		}
	}
	sort.Ints(orderedNums)
	parts := make([]string, 0, len(orderedNums))
	for _, questionNum := range orderedNums {
		var answer string
		if action, ok := actions[questionNum]; ok {
			answer = actionAnswer(action)
			if answer == "" {
				return "", fmt.Errorf("第%d题没有生成可提交答案", questionNum)
			}
		} else {
			question, ok := questionByNum[questionNum]
			if !ok {
				continue
			}
			var err error
			answer, err = skippedSubmitDataAnswer(question)
			if err != nil {
				return "", err
			}
		}
		answer = strings.ReplaceAll(answer, "，", ",")
		parts = append(parts, fmt.Sprintf("%d$%s", questionNum, answer))
	}
	if len(parts) == 0 {
		return "", fmt.Errorf("问卷星没有生成可提交答案")
	}
	return strings.Join(parts, "}"), nil
}

func skippedSubmitDataAnswer(question model.QuestionMeta) (string, error) {
	switch strings.TrimSpace(question.TypeCode) {
	case "3", "4", "5", "7":
		return "-3", nil
	case "11":
		return strings.TrimSuffix(strings.Repeat("-3,", maxInt(1, question.Options)), ","), nil
	case "6":
		parts := make([]string, 0, maxInt(1, question.Rows))
		for row := 0; row < maxInt(1, question.Rows); row++ {
			parts = append(parts, fmt.Sprintf("%d!-3", row+1))
		}
		return strings.Join(parts, ","), nil
	case "1", "2", "8", "9", "33", "34":
		return "(跳过)", nil
	default:
		return "", runerror.Wrap(runerror.KindUnsupported, fmt.Errorf(
			"第%d题暂不支持题型：provider_type=%q，type_code=%q",
			question.Num,
			question.ProviderType,
			question.TypeCode,
		))
	}
}

var wjxSubmitTextEscaper = strings.NewReplacer(
	"$", "ξ",
	"}", "｝",
	"^", "ˆ",
	"|", "¦",
	"!", "！",
	"<", "＜",
)

func escapeWJXSubmitText(value string) string {
	return wjxSubmitTextEscaper.Replace(strings.TrimSpace(value))
}

func actionAnswer(action answerAction) string {
	switch action.Kind {
	case "choice", "select", "single", "dropdown", "scale", "multiple":
		parts := make([]string, 0, len(action.Indices))
		for _, index := range action.Indices {
			value := strconv.Itoa(index + 1)
			if fill := escapeWJXSubmitText(action.OptionFills[index]); fill != "" {
				value += "^" + fill
			}
			parts = append(parts, value)
		}
		return strings.Join(parts, "|")
	case "matrix":
		parts := make([]string, 0, len(action.Matrix))
		for row, index := range action.Matrix {
			parts = append(parts, fmt.Sprintf("%d!%d", row+1, index+1))
		}
		return strings.Join(parts, ",")
	case "text", "multi_text":
		parts := make([]string, len(action.Texts))
		for index, value := range action.Texts {
			parts[index] = escapeWJXSubmitText(value)
		}
		return strings.Join(parts, "^")
	case "slider":
		return action.SliderValue
	case "order":
		parts := make([]string, 0, len(action.Indices))
		for _, index := range action.Indices {
			parts = append(parts, strconv.Itoa(index+1))
		}
		return strings.Join(parts, ",")
	default:
		return ""
	}
}
