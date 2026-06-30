package answerplan

import (
	"surveycontroller/surveycore/internal/defaults"
	"surveycontroller/surveycore/internal/model"
)

type BuildOptions struct {
	AnswerRules    []map[string]any
	Runtime        model.AnswerRuntime
	RuntimeOwner   string
	Persona        *model.Persona
	DimensionBases map[string]float64
}

func OptionsFromRuntimeConfig(cfg *model.RuntimeConfig) BuildOptions {
	if cfg == nil {
		return BuildOptions{}
	}
	return BuildOptions{
		AnswerRules:    cfg.AnswerRules,
		Runtime:        cfg.AnswerRuntime,
		RuntimeOwner:   cfg.AnswerRuntimeOwner,
		Persona:        cfg.Persona,
		DimensionBases: map[string]float64{},
	}
}

func BuildActions(questions []model.QuestionMeta, entries []model.QuestionEntry, options BuildOptions) ([]Action, error) {
	index := NewEntryIndex(entries)
	consistency := newConsistencyPlan(options.AnswerRules)
	actions := make([]Action, 0, len(questions))
	for _, question := range questions {
		if question.IsDescription {
			continue
		}
		entry, ok := index.Find(question)
		if !ok {
			entry = DefaultEntry(question)
		}
		entry = consistency.apply(question, entry)
		action, err := BuildActionWithOptions(question, entry, options)
		if err != nil {
			return nil, err
		}
		actions = append(actions, action)
		consistency.record(action)
	}
	return actions, nil
}

func DefaultEntry(question model.QuestionMeta) model.QuestionEntry {
	num := question.Num
	providerID := question.ProviderID
	return model.QuestionEntry{
		QuestionType:       defaultQuestionType(question),
		Probabilities:      defaults.QuestionProbabilities(question),
		Rows:               question.Rows,
		OptionCount:        maxInt(1, question.Options),
		QuestionNum:        &num,
		ProviderQuestionID: &providerID,
		SurveyProvider:     question.Provider,
	}
}

func defaultQuestionType(question model.QuestionMeta) string {
	return defaults.QuestionType(question)
}
