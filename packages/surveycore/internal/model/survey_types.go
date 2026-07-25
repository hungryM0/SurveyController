package model

const (
	ProviderWJX     = "wjx"
	ProviderQQ      = "qq"
	ProviderCredamo = "credamo"

	LogicParseStatusComplete = "complete"
	LogicParseStatusNone     = "none"
	LogicParseStatusUnknown  = "unknown"
)

type QuestionKind string

const (
	QuestionKindSingle    QuestionKind = "single"
	QuestionKindMultiple  QuestionKind = "multiple"
	QuestionKindDropdown  QuestionKind = "dropdown"
	QuestionKindScale     QuestionKind = "scale"
	QuestionKindMatrix    QuestionKind = "matrix"
	QuestionKindOrder     QuestionKind = "order"
	QuestionKindSlider    QuestionKind = "slider"
	QuestionKindText      QuestionKind = "text"
	QuestionKindMultiText QuestionKind = "multi_text"
)

type SurveySource struct {
	URL      string `json:"url"`
	Provider string `json:"provider,omitempty"`
}

type SurveyDefinition struct {
	Provider  string         `json:"provider"`
	Title     string         `json:"title"`
	Questions []QuestionMeta `json:"questions"`
}
