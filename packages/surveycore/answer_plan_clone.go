package surveycore

import (
	"surveycontroller/surveycore/internal/answerplan"
	"surveycontroller/surveycore/internal/model"
)

func cloneRunRequest(cfg *RunRequest) RunRequest {
	if cfg == nil {
		return RunRequest{}
	}
	cloned := *cfg
	cloned.SurveyDefinition = model.CloneSurveyDefinition(cfg.SurveyDefinition)
	cloned.AnswerPlan = model.CloneAnswerPlan(cfg.AnswerPlan)
	return cloned
}

func cloneSurveyDefinition(definition model.SurveyDefinition) model.SurveyDefinition {
	return model.CloneSurveyDefinition(definition)
}

func convertActions(actions []answerplan.Action) []model.AnswerAction {
	if len(actions) == 0 {
		return nil
	}
	converted := make([]model.AnswerAction, len(actions))
	for i, action := range actions {
		converted[i] = model.AnswerAction{
			QuestionNum:     action.QuestionNum,
			QuestionID:      action.QuestionID,
			Kind:            model.QuestionKind(action.Kind),
			SelectedIndices: append([]int(nil), action.SelectedIndices...),
			MatrixIndices:   append([]int(nil), action.MatrixIndices...),
			TextValues:      append([]string(nil), action.TextValues...),
			SliderValue:     action.SliderValue,
			OptionFillTexts: cloneStringMapInt(action.OptionFillTexts),
		}
	}
	return converted
}

func cloneStringMapInt(src map[int]string) map[int]string {
	if len(src) == 0 {
		return nil
	}
	dst := make(map[int]string, len(src))
	for key, value := range src {
		dst[key] = value
	}
	return dst
}

func cloneAnswerPlan(plan model.AnswerPlan) model.AnswerPlan {
	return model.CloneAnswerPlan(plan)
}

func cloneQuestionStrategies(src []model.QuestionStrategy) []model.QuestionStrategy {
	return model.CloneQuestionStrategies(src)
}
