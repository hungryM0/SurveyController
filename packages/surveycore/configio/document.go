package configio

import (
	"fmt"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore"
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

const (
	ConfigSchemaVersion = 2

	ReverseFillFormatAuto        = "auto"
	ReverseFillFormatWJXSequence = "wjx_sequence"
	ReverseFillFormatWJXScore    = "wjx_score"
	ReverseFillFormatWJXText     = "wjx_text"
)

type SurveyDocument struct {
	URL        string                 `json:"url"`
	Provider   string                 `json:"provider"`
	Title      string                 `json:"title"`
	Definition model.SurveyDefinition `json:"definition"`
}

type NetworkSettings struct {
	RandomProxyEnabled bool           `json:"randomProxyEnabled"`
	ProxyMode          string         `json:"proxyMode,omitempty"`
	FixedProxyAddress  string         `json:"fixedProxyAddress,omitempty"`
	ProxySource        string         `json:"proxySource"`
	CustomProxyAPI     string         `json:"customProxyApi,omitempty"`
	ProxyAreaCode      string         `json:"proxyAreaCode,omitempty"`
	RandomUAEnabled    bool           `json:"randomUaEnabled"`
	RandomUARatios     map[string]int `json:"randomUaRatios,omitempty"`
}

type ConfigDocument struct {
	SchemaVersion int                      `json:"schemaVersion"`
	Survey        SurveyDocument           `json:"survey"`
	Execution     model.ExecutionPlan      `json:"execution"`
	Network       NetworkSettings          `json:"network"`
	Answers       model.AnswerPlan         `json:"answers"`
	ReverseFill   model.ReverseFillPlan    `json:"reverseFill"`
	Psychometrics model.PsychometricPolicy `json:"psychometrics"`
}

func ConfigDocumentFromRunRequest(config surveycore.RunRequest) ConfigDocument {
	return ConfigDocument{
		SchemaVersion: ConfigSchemaVersion,
		Survey: SurveyDocument{
			URL:        strings.TrimSpace(config.SurveySource.URL),
			Provider:   strings.TrimSpace(config.SurveySource.Provider),
			Title:      strings.TrimSpace(config.SurveyDefinition.Title),
			Definition: model.CloneSurveyDefinition(config.SurveyDefinition),
		},
		Execution:     config.ExecutionPlan,
		Answers:       model.CloneAnswerPlan(config.AnswerPlan),
		ReverseFill:   config.ReverseFillPlan,
		Psychometrics: config.PsychometricPolicy,
	}
}

func RunRequestFromConfigDocument(document ConfigDocument) (surveycore.RunRequest, error) {
	if document.SchemaVersion != ConfigSchemaVersion {
		return surveycore.RunRequest{}, fmt.Errorf("不支持的配置版本：%d", document.SchemaVersion)
	}
	if err := validateAnswerWeights(document.Answers); err != nil {
		return surveycore.RunRequest{}, err
	}
	definition := model.CloneSurveyDefinition(document.Survey.Definition)
	definition.Provider = firstNonEmpty(document.Survey.Provider, definition.Provider)
	definition.Title = firstNonEmpty(document.Survey.Title, definition.Title)
	return surveycore.RunRequest{
		SurveySource:       model.SurveySource{URL: strings.TrimSpace(document.Survey.URL), Provider: firstNonEmpty(document.Survey.Provider, definition.Provider)},
		SurveyDefinition:   definition,
		ExecutionPlan:      document.Execution,
		AnswerPlan:         model.CloneAnswerPlan(document.Answers),
		ReverseFillPlan:    document.ReverseFill,
		PsychometricPolicy: document.Psychometrics,
	}, nil
}

func validateAnswerWeights(plan model.AnswerPlan) error {
	for _, strategy := range plan.Strategies {
		if err := strategy.Probabilities.Validate(); err != nil {
			return err
		}
		if err := strategy.CustomWeights.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func cloneIntValues(values map[string]int) map[string]int {
	if len(values) == 0 {
		return nil
	}
	cloned := make(map[string]int, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}
