package surveycore

import (
	"surveycontroller/surveycore/internal/defaults"
	"surveycontroller/surveycore/internal/model"
)

func newDefaultRuntimeConfig() RuntimeConfig {
	return RuntimeConfig{
		SurveyProvider:         model.ProviderWJX,
		Target:                 1,
		Threads:                1,
		SubmitInterval:         [2]int{0, 0},
		AnswerDuration:         [2]int{60, 120},
		ProxySource:            "default",
		RandomUARatios:         model.DefaultRandomUARatios(),
		FailStopEnabled:        true,
		PauseOnAliyunCaptcha:   true,
		ReliabilityModeEnabled: true,
		PsychoTargetAlpha:      0.85,
		AIMode:                 "free",
		AIProvider:             "deepseek",
		AIAPIProtocol:          "auto",
		ReverseFillFormat:      "auto",
		ReverseFillStartRow:    1,
		ReverseFillThreads:     1,
		AnswerRules:            []map[string]any{},
		DimensionGroups:        []string{},
	}
}

func questionTypeName(question QuestionMeta) string {
	return defaults.QuestionType(model.QuestionMeta(question))
}

func defaultQuestionType(question model.QuestionMeta) string {
	return defaults.QuestionType(question)
}

func defaultQuestionProbabilities(question QuestionMeta) any {
	return defaultQuestionProbabilitiesModel(model.QuestionMeta(question))
}

func defaultQuestionProbabilityValues(question model.QuestionMeta) []float64 {
	return defaults.QuestionProbabilities(question)
}

func defaultQuestionProbabilitiesModel(question model.QuestionMeta) any {
	return defaults.QuestionProbabilities(question)
}

func buildDefaultQuestionEntries(questions []QuestionMeta) []QuestionEntry {
	entries := make([]QuestionEntry, 0, len(questions))
	for _, question := range questions {
		if question.IsDescription {
			continue
		}
		num := question.Num
		title := question.Title
		providerID := question.ProviderID
		pageID := question.ProviderPageID
		entry := QuestionEntry{
			QuestionType:          questionTypeName(question),
			Probabilities:         defaultQuestionProbabilities(question),
			Rows:                  question.Rows,
			OptionCount:           maxInt(1, question.Options),
			DistributionMode:      "random",
			QuestionNum:           &num,
			QuestionTitle:         &title,
			SurveyProvider:        question.Provider,
			ProviderQuestionID:    &providerID,
			ProviderPageID:        &pageID,
			FillableOptionIndices: append([]int(nil), question.FillableOptions...),
			AttachedOptionSelects: cloneMapList(question.AttachedOptionSelects),
			IsLocation:            question.IsLocation,
			PsychoBias:            "custom",
		}
		if len(question.ForcedTexts) > 0 {
			entry.Texts = append([]string(nil), question.ForcedTexts...)
		}
		entries = append(entries, entry)
	}
	return entries
}

func populateConfigSurveyDefinition(cfg *RuntimeConfig, definition *SurveyDefinition) {
	if cfg == nil || definition == nil {
		return
	}
	cfg.SurveyTitle = definition.Title
	cfg.SurveyProvider = definition.Provider
	cfg.QuestionsInfo = cloneQuestions(definition.Questions)
	ensureQuestionEntries(cfg)
}

func ensureQuestionEntries(cfg *RuntimeConfig) {
	if cfg == nil || len(cfg.QuestionEntries) > 0 {
		return
	}
	cfg.QuestionEntries = buildDefaultQuestionEntries(cfg.QuestionsInfo)
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
