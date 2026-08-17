package surveycore

import (
	"context"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

const (
	ProviderWJX     = model.ProviderWJX
	ProviderQQ      = model.ProviderQQ
	ProviderCredamo = model.ProviderCredamo

	LogicParseStatusNone    = model.LogicParseStatusNone
	LogicParseStatusUnknown = model.LogicParseStatusUnknown
)

type SurveyDefinition = model.SurveyDefinition
type QuestionMeta = model.QuestionMeta
type SurveySource = model.SurveySource
type ExecutionPlan = model.ExecutionPlan
type AnswerPlan = model.AnswerPlan
type ReverseFillPlan = model.ReverseFillPlan
type PsychometricPolicy = model.PsychometricPolicy
type RunRequest = model.RunRequest
type QuestionKind = model.QuestionKind
type QuestionStrategy = model.QuestionStrategy
type WeightTable = model.WeightTable
type ConsistencyRule = model.ConsistencyRule
type QuestionLogic = model.QuestionLogic
type JumpRule = model.JumpRule
type DisplayCondition = model.DisplayCondition
type DisplayControl = model.DisplayControl
type QuestionMedia = model.QuestionMedia
type AttachedOptionSelect = model.AttachedOptionSelect
type SliderRange = model.SliderRange
type SubmissionContext = model.SubmissionContext
type SubmissionRequest = model.SubmissionRequest
type AIProfile = model.AIProfile
type UserAgentSettings = model.UserAgentSettings
type RunResult = model.RunResult
type ThreadProgress = model.ThreadProgress
type Event = model.Event

type Parser interface {
	Parse(ctx context.Context, surveyURL string) (SurveyDefinition, error)
}
