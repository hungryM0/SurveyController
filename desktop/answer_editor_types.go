package main

import (
	configio "github.com/SurveyController/SurveyCore/pkg/surveycore/config"
	"github.com/SurveyController/SurveyCore/pkg/surveycore/model"
)

type BuildAnswerEditorViewRequest struct {
	Config configio.ConfigDocument `json:"config"`
}

type AnswerEditorSearchSegment struct {
	Kind  string `json:"kind"`
	Label string `json:"label"`
	Text  string `json:"text"`
}

type AnswerEditorRelation struct {
	ID                string `json:"id"`
	Kind              string `json:"kind"`
	Label             string `json:"label"`
	Summary           string `json:"summary"`
	SourceQuestionNum int    `json:"sourceQuestionNum"`
	TargetQuestionNum int    `json:"targetQuestionNum,omitempty"`
	TerminatesSurvey  bool   `json:"terminatesSurvey,omitempty"`
}

type AnswerEditorQuestionView struct {
	Number            int                         `json:"number"`
	Page              int                         `json:"page"`
	PageQuestionCount int                         `json:"pageQuestionCount"`
	Title             string                      `json:"title"`
	Description       string                      `json:"description,omitempty"`
	QuestionType      model.QuestionKind          `json:"questionType"`
	QuestionTypeLabel string                      `json:"questionTypeLabel"`
	Required          bool                        `json:"required"`
	Unsupported       bool                        `json:"unsupported"`
	UnsupportedReason string                      `json:"unsupportedReason,omitempty"`
	OptionTexts       []string                    `json:"optionTexts,omitempty"`
	RowTexts          []string                    `json:"rowTexts,omitempty"`
	Strategy          *model.QuestionStrategy     `json:"strategy,omitempty"`
	LogicSummary      string                      `json:"logicSummary,omitempty"`
	InboundRelations  []AnswerEditorRelation      `json:"inboundRelations,omitempty"`
	OutboundRelations []AnswerEditorRelation      `json:"outboundRelations,omitempty"`
	SearchSegments    []AnswerEditorSearchSegment `json:"searchSegments"`
}

type AnswerEditorPageView struct {
	Page          int   `json:"page"`
	QuestionCount int   `json:"questionCount"`
	QuestionNums  []int `json:"questionNums"`
}

type AnswerEditorView struct {
	Questions []AnswerEditorQuestionView `json:"questions"`
	Pages     []AnswerEditorPageView     `json:"pages"`
}

type AnswerEditorStrategyDraft struct {
	QuestionNum             int                          `json:"questionNum"`
	DistributionMode        string                       `json:"distributionMode"`
	CustomWeights           model.WeightTable            `json:"customWeights"`
	Texts                   []string                     `json:"texts,omitempty"`
	AIEnabled               bool                         `json:"aiEnabled"`
	OptionFillTexts         []*string                    `json:"optionFillTexts,omitempty"`
	FillableOptionIndices   []int                        `json:"fillableOptionIndices,omitempty"`
	AttachedOptionSelects   []model.AttachedOptionSelect `json:"attachedOptionSelects,omitempty"`
	LocationParts           []string                     `json:"locationParts,omitempty"`
	MultiTextBlankModes     []string                     `json:"multiTextBlankModes,omitempty"`
	MultiTextBlankAIFlags   []bool                       `json:"multiTextBlankAIFlags,omitempty"`
	MultiTextBlankIntRanges [][]int                      `json:"multiTextBlankIntRanges,omitempty"`
	TextRandomMode          string                       `json:"textRandomMode,omitempty"`
	TextRandomIntRange      []int                        `json:"textRandomIntRange,omitempty"`
	Dimension               string                       `json:"dimension,omitempty"`
	PsychoBias              string                       `json:"psychoBias,omitempty"`
}

type ApplyAnswerEditorChangesRequest struct {
	Config  configio.ConfigDocument     `json:"config"`
	Changes []AnswerEditorStrategyDraft `json:"changes"`
}

type AnswerEditorFieldError struct {
	QuestionNum int    `json:"questionNum"`
	Field       string `json:"field"`
	Message     string `json:"message"`
}

type ApplyAnswerEditorChangesResult struct {
	Config *configio.ConfigDocument `json:"config,omitempty"`
	Errors []AnswerEditorFieldError `json:"errors,omitempty"`
}
