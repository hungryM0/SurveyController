package tencent

import (
	"fmt"
	"strings"
	"time"

	"surveycontroller/surveycore/internal/model"
	"surveycontroller/surveycore/internal/runerror"
)

func buildSubmitBody(request *model.SubmissionRequest, surveyID string, hashValue string, rawQuestions []map[string]any, userAgent string) (map[string]any, error) {
	questions := submitQuestions(rawQuestions)
	actionByID := map[string]model.AnswerAction{}
	for _, question := range questions {
		if question.IsDescription {
			continue
		}
		if label := blockedRuntimeProviderTypes[question.ProviderType]; label != "" {
			return nil, runerror.Wrap(runerror.KindUnsupported, fmt.Errorf("腾讯问卷第%d题暂不支持：%s", question.Num, label))
		}
		if !supportedProviderTypes[question.ProviderType] {
			return nil, runerror.Wrap(runerror.KindUnsupported, fmt.Errorf("腾讯问卷第%d题暂不支持：%s", question.Num, firstString(question.ProviderType, question.TypeCode, "unknown")))
		}
	}
	for _, action := range request.Context.Actions {
		if action.QuestionID != "" {
			actionByID[action.QuestionID] = action
		}
	}

	pages := make([]map[string]any, 0)
	pageIndex := map[string]int{}
	for _, raw := range rawQuestions {
		questionID := strings.TrimSpace(stringValue(raw["id"]))
		action, ok := actionByID[questionID]
		if !ok {
			continue
		}
		pageID := strings.TrimSpace(stringValue(raw["page_id"]))
		if pageID == "" {
			return nil, fmt.Errorf("腾讯问卷第%d题缺少 page_id", action.QuestionNum)
		}
		answer, err := questionAnswer(raw, action)
		if err != nil {
			return nil, err
		}
		idx, ok := pageIndex[pageID]
		if !ok {
			pageIndex[pageID] = len(pages)
			pages = append(pages, map[string]any{"id": pageID, "questions": []map[string]any{}})
			idx = len(pages) - 1
		}
		items := pages[idx]["questions"].([]map[string]any)
		if list, ok := answer.([]map[string]any); ok {
			items = append(items, list...)
		} else {
			items = append(items, answer.(map[string]any))
		}
		pages[idx]["questions"] = items
	}
	if len(pages) == 0 {
		return nil, fmt.Errorf("腾讯问卷没有生成可提交答案")
	}
	ua := strings.TrimSpace(userAgent)
	if ua == "" {
		ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
	}
	return map[string]any{
		"survey_id": intValue(surveyID),
		"hash":      hashValue,
		"answer_survey": map[string]any{
			"duration":  defaultDurationSeconds(request),
			"ua":        ua,
			"referrer":  "",
			"uid":       fmt.Sprintf("%d", time.Now().UnixNano()),
			"sid":       fmt.Sprintf("%d", time.Now().UnixNano()+1),
			"openid":    "",
			"latitude":  nil,
			"longitude": nil,
			"is_update": false,
			"locale":    "zhs",
			"pages":     pages,
		},
	}, nil
}

func submitQuestions(rawQuestions []map[string]any) []model.QuestionMeta {
	normalized := standardizeQuestions(rawQuestions)
	result := make([]model.QuestionMeta, 0, len(normalized))
	for _, question := range normalized {
		if !question.IsDescription {
			result = append(result, question)
		}
	}
	return result
}

func questionAnswer(raw map[string]any, action model.AnswerAction) (any, error) {
	providerType := strings.TrimSpace(stringValue(raw["type"]))
	switch providerType {
	case "text", "textarea":
		return map[string]any{
			"id":   strings.TrimSpace(stringValue(raw["id"])),
			"type": providerType,
			"text": strings.Join(action.TextValues, "\n"),
		}, nil
	case "matrix_radio":
		return matrixAnswer(raw, action)
	default:
		return choiceAnswer(raw, action)
	}
}

func choiceAnswer(raw map[string]any, action model.AnswerAction) (map[string]any, error) {
	options := asMapList(raw["options"])
	if len(options) == 0 {
		return nil, fmt.Errorf("腾讯问卷第%d题缺少选项", action.QuestionNum)
	}
	selected := map[int]bool{}
	for _, index := range action.SelectedIndices {
		selected[index] = true
	}
	answers := make([]map[string]any, 0, len(options))
	blanks := make([]map[string]any, 0)
	for index, option := range options {
		answers = append(answers, map[string]any{
			"id":      strings.TrimSpace(stringValue(option["id"])),
			"text":    strings.TrimSpace(stringValue(option["text"])),
			"checked": checkedInt(selected[index]),
		})
		if selected[index] {
			if fill := strings.TrimSpace(action.OptionFillTexts[index]); fill != "" {
				blanks = append(blanks, map[string]any{"id": optionBlankID(option), "text": fill})
			}
		}
	}
	return map[string]any{
		"id":      strings.TrimSpace(stringValue(raw["id"])),
		"type":    strings.TrimSpace(stringValue(raw["type"])),
		"blanks":  blanks,
		"options": answers,
	}, nil
}

func matrixAnswer(raw map[string]any, action model.AnswerAction) ([]map[string]any, error) {
	rows := asMapList(raw["sub_titles"])
	options := asMapList(raw["options"])
	if len(rows) == 0 || len(options) == 0 {
		return nil, fmt.Errorf("腾讯问卷第%d题缺少矩阵行列", action.QuestionNum)
	}
	questionID := strings.TrimSpace(stringValue(raw["id"]))
	result := make([]map[string]any, 0, len(rows))
	for rowIndex, row := range rows {
		optionIndex := 0
		if rowIndex < len(action.MatrixIndices) {
			optionIndex = action.MatrixIndices[rowIndex]
		}
		if optionIndex < 0 || optionIndex >= len(options) {
			return nil, fmt.Errorf("腾讯问卷第%d题第%d行没有生成矩阵答案", action.QuestionNum, rowIndex+1)
		}
		rowID := strings.TrimSpace(stringValue(row["id"]))
		optionID := strings.TrimSpace(stringValue(options[optionIndex]["id"]))
		if optionID == "" {
			return nil, fmt.Errorf("腾讯问卷第%d题第%d行缺少矩阵列 id", action.QuestionNum, rowIndex+1)
		}
		id := questionID + "_" + optionID
		if rowID != "" {
			id = questionID + "_" + rowID + "_" + optionID
		}
		result = append(result, map[string]any{"id": id, "type": "matrix_radio", "answer": "on"})
	}
	return result, nil
}

func defaultDurationSeconds(request *model.SubmissionRequest) int {
	if request != nil {
		if seconds := model.SampleAnswerDurationSeconds(request.AnswerDuration, 60); seconds > 0 {
			return seconds
		}
	}
	return 60
}

func optionBlankID(option map[string]any) string {
	for key, value := range option {
		if strings.Contains(strings.ToLower(key), "fillblank") {
			if text := strings.TrimSpace(stringValue(value)); text != "" {
				return text
			}
			return strings.TrimSpace(key)
		}
		if text := stringValue(value); fillBlankTokenRE.MatchString(text) {
			match := fillBlankTokenRE.FindStringSubmatch(text)
			if len(match) > 1 {
				return match[1]
			}
		}
	}
	return strings.TrimSpace(stringValue(option["id"]))
}

func checkedInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
