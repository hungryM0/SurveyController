package model

type WeightTable struct {
	Options []float64   `json:"options,omitempty"`
	Rows    [][]float64 `json:"rows,omitempty"`
}

type QuestionStrategy struct {
	QuestionType            QuestionKind           `json:"question_type"`
	Probabilities           WeightTable            `json:"probabilities"`
	Texts                   []string               `json:"texts,omitempty"`
	Rows                    int                    `json:"rows,omitempty"`
	OptionCount             int                    `json:"option_count,omitempty"`
	DistributionMode        string                 `json:"distribution_mode,omitempty"`
	CustomWeights           WeightTable            `json:"custom_weights,omitempty"`
	QuestionNum             *int                   `json:"question_num,omitempty"`
	QuestionTitle           *string                `json:"question_title,omitempty"`
	SurveyProvider          string                 `json:"survey_provider,omitempty"`
	ProviderQuestionID      *string                `json:"provider_question_id,omitempty"`
	ProviderPageID          *string                `json:"provider_page_id,omitempty"`
	AIEnabled               bool                   `json:"ai_enabled,omitempty"`
	OptionFillTexts         []*string              `json:"option_fill_texts,omitempty"`
	FillableOptionIndices   []int                  `json:"fillable_option_indices,omitempty"`
	AttachedOptionSelects   []AttachedOptionSelect `json:"attached_option_selects,omitempty"`
	IsLocation              bool                   `json:"is_location,omitempty"`
	LocationParts           []string               `json:"location_parts,omitempty"`
	MultiTextBlankModes     []string               `json:"multi_text_blank_modes,omitempty"`
	MultiTextBlankAIFlags   []bool                 `json:"multi_text_blank_ai_flags,omitempty"`
	MultiTextBlankIntRanges [][]int                `json:"multi_text_blank_int_ranges,omitempty"`
	TextRandomMode          string                 `json:"text_random_mode,omitempty"`
	TextRandomIntRange      []int                  `json:"text_random_int_range,omitempty"`
	Dimension               string                 `json:"dimension,omitempty"`
	PsychoBias              string                 `json:"psycho_bias,omitempty"`
}

type ConsistencyRule struct {
	ID                     string `json:"id,omitempty"`
	ConditionQuestionNum   int    `json:"condition_question_num"`
	ConditionMode          string `json:"condition_mode"`
	ConditionOptionIndices []int  `json:"condition_option_indices"`
	ConditionRowIndex      *int   `json:"condition_row_index,omitempty"`
	TargetQuestionNum      int    `json:"target_question_num"`
	ActionMode             string `json:"action_mode"`
	TargetOptionIndices    []int  `json:"target_option_indices"`
	TargetRowIndex         *int   `json:"target_row_index,omitempty"`
}

type AnswerPlan struct {
	Rules      []ConsistencyRule  `json:"rules,omitempty"`
	Dimensions []string           `json:"dimensions,omitempty"`
	Strategies []QuestionStrategy `json:"questions,omitempty"`
}
