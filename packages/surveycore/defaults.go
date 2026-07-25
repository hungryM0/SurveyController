package surveycore

import (
	"surveycontroller/surveycore/internal/defaults"
	"surveycontroller/surveycore/internal/model"
)

func newDefaultRunRequest() RunRequest {
	return RunRequest{
		SurveySource:     model.SurveySource{Provider: model.ProviderWJX},
		SurveyDefinition: model.SurveyDefinition{Provider: model.ProviderWJX},
		ExecutionPlan: model.ExecutionPlan{
			Target:               1,
			Threads:              1,
			SubmitInterval:       [2]int{0, 0},
			AnswerDuration:       [2]int{60, 120},
			FailStop:             true,
			PauseOnAliyunCaptcha: true,
		},
		AnswerPlan:         model.AnswerPlan{Rules: []model.ConsistencyRule{}, Dimensions: []string{}},
		ReverseFillPlan:    model.ReverseFillPlan{Format: "auto", StartRow: 1, Threads: 1},
		PsychometricPolicy: model.PsychometricPolicy{Enabled: true, TargetAlpha: 0.85},
	}
}

func questionTypeName(question QuestionMeta) string {
	return defaults.QuestionType(model.QuestionMeta(question))
}

func defaultQuestionType(question model.QuestionMeta) string {
	return defaults.QuestionType(question)
}

func defaultQuestionProbabilityValues(question QuestionMeta) []float64 {
	return defaults.QuestionProbabilities(question)
}

func buildDefaultQuestionStrategies(questions []QuestionMeta) []QuestionStrategy {
	entries := make([]QuestionStrategy, 0, len(questions))
	for _, question := range questions {
		if question.IsDescription {
			continue
		}
		num := question.Num
		title := question.Title
		providerID := question.ProviderID
		pageID := question.ProviderPageID
		entry := QuestionStrategy{
			QuestionType:          model.QuestionKind(questionTypeName(question)),
			Probabilities:         model.OptionWeights(defaultQuestionProbabilityValues(question)...),
			Rows:                  question.Rows,
			OptionCount:           maxInt(1, question.Options),
			DistributionMode:      "random",
			QuestionNum:           &num,
			QuestionTitle:         &title,
			SurveyProvider:        question.Provider,
			ProviderQuestionID:    &providerID,
			ProviderPageID:        &pageID,
			FillableOptionIndices: append([]int(nil), question.FillableOptions...),
			AttachedOptionSelects: cloneAttachedOptionSelects(question.AttachedOptionSelects),
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

func populateConfigSurveyDefinition(cfg *RunRequest, definition *SurveyDefinition) {
	if cfg == nil || definition == nil {
		return
	}
	cfg.SurveyDefinition = *definition
	cfg.SurveySource.Provider = definition.Provider
	cfg.AnswerPlan.Strategies = buildDefaultQuestionStrategies(definition.Questions)
}

func ensureQuestionStrategies(cfg *RunRequest) {
	if cfg == nil || len(cfg.AnswerPlan.Strategies) > 0 {
		return
	}
	cfg.AnswerPlan.Strategies = buildDefaultQuestionStrategies(cfg.SurveyDefinition.Questions)
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
