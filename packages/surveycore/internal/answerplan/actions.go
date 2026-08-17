package answerplan

import (
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/defaults"
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

type BuildOptions struct {
	AnswerRules    []model.ConsistencyRule
	Runtime        model.AnswerRuntime
	RuntimeOwner   string
	Persona        *model.Persona
	DimensionBases map[string]float64
}

func OptionsFromRunRequest(cfg *model.RunRequest) BuildOptions {
	if cfg == nil {
		return BuildOptions{}
	}
	return BuildOptions{AnswerRules: cfg.AnswerPlan.Rules, DimensionBases: map[string]float64{}}
}

func OptionsFromAnswerPlan(plan model.AnswerPlan, context model.SubmissionContext) BuildOptions {
	return BuildOptions{
		AnswerRules:    plan.Rules,
		Runtime:        context.Runtime,
		RuntimeOwner:   context.RuntimeOwner,
		Persona:        context.Persona,
		DimensionBases: map[string]float64{},
	}
}

func BuildActions(questions []model.QuestionMeta, entries []model.QuestionStrategy, options BuildOptions) ([]Action, error) {
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

func DefaultEntry(question model.QuestionMeta) model.QuestionStrategy {
	num := question.Num
	providerID := question.ProviderID
	return model.QuestionStrategy{
		QuestionType:       model.QuestionKind(defaultQuestionType(question)),
		Probabilities:      model.OptionWeights(defaults.QuestionProbabilities(question)...),
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
