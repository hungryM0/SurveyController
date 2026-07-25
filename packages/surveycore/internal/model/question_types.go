package model

type JumpRule struct {
	OptionIndex      int     `json:"option_index"`
	TargetQuestion   int     `json:"jumpto"`
	OptionText       *string `json:"option_text,omitempty"`
	TerminatesSurvey bool    `json:"terminates_survey,omitempty"`
}

type DisplayCondition struct {
	QuestionNum   int    `json:"condition_question_num"`
	Mode          string `json:"condition_mode"`
	OptionIndices []int  `json:"condition_option_indices"`
	RowIndex      *int   `json:"condition_row_index,omitempty"`
}

type DisplayControl struct {
	TargetQuestionNum int    `json:"target_question_num"`
	Mode              string `json:"condition_mode"`
	OptionIndices     []int  `json:"condition_option_indices"`
	RowIndex          *int   `json:"condition_row_index,omitempty"`
}

type QuestionLogic struct {
	LogicStatus              string             `json:"logic_parse_status"`
	HasJump                  bool               `json:"has_jump"`
	JumpRules                []JumpRule         `json:"jump_rules,omitempty"`
	HasDisplayCondition      bool               `json:"has_display_condition"`
	DisplayConditions        []DisplayCondition `json:"display_conditions,omitempty"`
	HasDependentDisplayLogic bool               `json:"has_dependent_display_logic"`
	ControlsDisplayTargets   []DisplayControl   `json:"controls_display_targets,omitempty"`
}

type QuestionMedia struct {
	Kind      string `json:"kind"`
	Scope     string `json:"scope"`
	Index     *int   `json:"index,omitempty"`
	SourceURL string `json:"source_url"`
	Label     string `json:"label"`
}

type AttachedOptionSelect struct {
	OptionIndex int      `json:"option_index"`
	OptionText  string   `json:"option_text"`
	SelectTexts []string `json:"select_texts"`
}

type SliderRange struct {
	SliderMin  string `json:"slider_min,omitempty"`
	SliderMax  string `json:"slider_max,omitempty"`
	SliderStep string `json:"slider_step,omitempty"`
}

type QuestionMeta struct {
	Num             int      `json:"num"`
	Title           string   `json:"title"`
	DisplayNum      *int     `json:"display_num,omitempty"`
	Description     string   `json:"description"`
	TypeCode        string   `json:"type_code"`
	Options         int      `json:"options"`
	Rows            int      `json:"rows"`
	RowTexts        []string `json:"row_texts"`
	Page            int      `json:"page"`
	OptionTexts     []string `json:"option_texts"`
	Provider        string   `json:"provider"`
	ProviderID      string   `json:"provider_question_id"`
	ProviderPageID  string   `json:"provider_page_id"`
	ProviderType    string   `json:"provider_type"`
	Required        bool     `json:"required"`
	IsDescription   bool     `json:"is_description"`
	IsLocation      bool     `json:"is_location"`
	IsRating        bool     `json:"is_rating"`
	RatingMax       int      `json:"rating_max"`
	TextInputs      int      `json:"text_inputs"`
	TextInputLabels []string `json:"text_input_labels"`
	IsTextLike      bool     `json:"is_text_like"`
	IsMultiText     bool     `json:"is_multi_text"`
	IsSliderMatrix  bool     `json:"is_slider_matrix"`
	QuestionLogic
	SliderRange
	QuestionMedia           []QuestionMedia        `json:"question_media,omitempty"`
	MultiMinLimit           *int                   `json:"multi_min_limit,omitempty"`
	MultiMaxLimit           *int                   `json:"multi_max_limit,omitempty"`
	ForcedOptionIdx         *int                   `json:"forced_option_index,omitempty"`
	ForcedOption            string                 `json:"forced_option_text"`
	ForcedTexts             []string               `json:"forced_texts"`
	FillableOptions         []int                  `json:"fillable_options"`
	AttachedOptionSelects   []AttachedOptionSelect `json:"attached_option_selects,omitempty"`
	HasAttachedOptionSelect bool                   `json:"has_attached_option_select"`
	Unsupported             bool                   `json:"unsupported"`
	UnsupportedReason       string                 `json:"unsupported_reason"`
}
