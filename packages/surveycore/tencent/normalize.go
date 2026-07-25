package tencent

import (
	"fmt"
	"strings"

	"surveycontroller/surveycore/internal/model"
)

var providerTypeToInternal = map[string]string{
	"radio":        "3",
	"checkbox":     "4",
	"select":       "7",
	"text":         "1",
	"textarea":     "1",
	"nps":          "5",
	"star":         "5",
	"matrix_radio": "6",
	"matrix_star":  "6",
}

var supportedProviderTypes = map[string]bool{
	"radio":        true,
	"checkbox":     true,
	"select":       true,
	"text":         true,
	"textarea":     true,
	"matrix_radio": true,
}

var blockedRuntimeProviderTypes = map[string]string{
	"nps":         "量表",
	"star":        "量表",
	"matrix_star": "矩阵量表",
}

func buildDefinition(rawQuestions []map[string]any, rawTitle string) (model.SurveyDefinition, error) {
	normalized := standardizeQuestions(rawQuestions)
	if err := rejectBlockedQuestions(normalized); err != nil {
		return model.SurveyDefinition{}, err
	}
	questions := make([]model.QuestionMeta, 0, len(normalized))
	for _, question := range normalized {
		if question.IsDescription {
			continue
		}
		questions = append(questions, question)
	}
	title := normalizeTitle(rawTitle)
	if title == "" {
		title = "腾讯问卷"
	}
	return model.SurveyDefinition{
		Provider:  model.ProviderQQ,
		Title:     title,
		Questions: questions,
	}, nil
}

func standardizeQuestions(rawQuestions []map[string]any) []model.QuestionMeta {
	pageMap := buildPageNumberMap(rawQuestions)
	result := make([]model.QuestionMeta, 0, len(rawQuestions))
	displayNum := 1
	var pendingDescriptions []model.QuestionMeta
	for index, raw := range rawQuestions {
		question := normalizeQuestion(raw, index+1, pageMap)
		if question.IsDescription {
			pendingDescriptions = append(pendingDescriptions, question)
			result = append(result, question)
			continue
		}
		question.Num = displayNum
		displayNum++
		if len(pendingDescriptions) > 0 {
			question = mergeDescriptions(question, pendingDescriptions)
			pendingDescriptions = nil
		}
		result = append(result, question)
	}
	return attachLogicMetadata(rawQuestions, result)
}

func normalizeQuestion(raw map[string]any, fallbackNum int, pageMap map[string]int) model.QuestionMeta {
	providerType := strings.ToLower(strings.TrimSpace(stringValue(raw["type"])))
	isDescription := providerType == "description"
	optionTexts := buildOptionTexts(raw, providerType)
	rowTexts := buildRowTexts(raw)
	optionCount := resolveOptionCount(raw, providerType, optionTexts)
	typeCode := providerTypeToInternal[providerType]
	if isDescription {
		typeCode = "0"
	}
	if typeCode == "" {
		typeCode = "0"
	}

	multiMin, multiMax := multiLimits(raw, providerType)
	pageKey := pageMapKey(raw)
	page := pageMap[pageKey]
	if page <= 0 {
		page = 1
	}

	return model.QuestionMeta{
		Num:               fallbackNum,
		Title:             normalizeText(raw["title"]),
		Description:       normalizeText(raw["description"]),
		TypeCode:          typeCode,
		Options:           optionCount,
		Rows:              maxInt(1, len(rowTexts)),
		RowTexts:          rowTexts,
		Page:              page,
		OptionTexts:       optionTexts,
		Provider:          model.ProviderQQ,
		ProviderID:        strings.TrimSpace(stringValue(raw["id"])),
		ProviderPageID:    strings.TrimSpace(stringValue(raw["page_id"])),
		ProviderType:      providerType,
		Required:          boolValue(raw["required"]),
		IsDescription:     isDescription,
		IsRating:          providerType == "nps" || providerType == "star",
		RatingMax:         ratingMax(providerType, optionCount),
		TextInputs:        textInputs(providerType),
		IsTextLike:        providerType == "text" || providerType == "textarea",
		IsMultiText:       false,
		QuestionLogic:     model.QuestionLogic{LogicStatus: model.LogicParseStatusNone},
		MultiMinLimit:     multiMin,
		MultiMaxLimit:     multiMax,
		ForcedTexts:       []string{},
		FillableOptions:   buildFillableOptionIndices(raw, providerType),
		QuestionMedia:     questionMedia(raw, providerType),
		Unsupported:       !supportedProviderTypes[providerType] && !isDescription,
		UnsupportedReason: unsupportedReason(providerType),
	}
}

func buildPageNumberMap(rawQuestions []map[string]any) map[string]int {
	result := map[string]int{}
	next := 1
	for _, question := range rawQuestions {
		key := pageMapKey(question)
		if _, exists := result[key]; exists {
			continue
		}
		result[key] = next
		next++
	}
	return result
}

func pageMapKey(question map[string]any) string {
	return strings.TrimSpace(stringValue(question["page_id"])) + "\x00" + strings.TrimSpace(stringValue(question["page"]))
}

func mergeDescriptions(question model.QuestionMeta, descriptions []model.QuestionMeta) model.QuestionMeta {
	var titles []string
	var descriptionsText []string
	for _, description := range descriptions {
		if description.Page != question.Page {
			continue
		}
		if strings.TrimSpace(description.Title) != "" {
			titles = append(titles, strings.TrimSpace(description.Title))
		}
		if strings.TrimSpace(description.Description) != "" {
			descriptionsText = append(descriptionsText, strings.TrimSpace(description.Description))
		}
	}
	if len(titles) > 0 {
		titles = append(titles, question.Title)
		question.Title = strings.TrimSpace(strings.Join(titles, " "))
	}
	if len(descriptionsText) > 0 {
		if strings.TrimSpace(question.Description) != "" {
			descriptionsText = append(descriptionsText, question.Description)
		}
		question.Description = strings.TrimSpace(strings.Join(descriptionsText, "\n"))
	}
	return question
}

func normalizeTitle(raw string) string {
	title := normalizeText(raw)
	for _, suffix := range []string{" - 腾讯问卷", "| 腾讯问卷", "｜ 腾讯问卷", "腾讯问卷"} {
		title = strings.TrimSuffix(title, suffix)
	}
	return strings.TrimSpace(strings.Trim(title, " -_|｜"))
}

func rejectBlockedQuestions(questions []model.QuestionMeta) error {
	var blocked []string
	for _, question := range questions {
		if question.IsDescription {
			continue
		}
		label := blockedRuntimeProviderTypes[question.ProviderType]
		if label == "" {
			continue
		}
		blocked = append(blocked, fmt.Sprintf("第 %d 题：%s（%s）", question.Num, question.Title, label))
	}
	if len(blocked) == 0 {
		return nil
	}
	return ParseError{Message: "腾讯问卷当前版本暂不支持量表、矩阵量表题，请改用 v3.2.2 旧版本：\n" + strings.Join(blocked, "\n")}
}
