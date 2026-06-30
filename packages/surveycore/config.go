package surveycore

import (
	"context"
	"strings"
)

func (c *Client) DefaultConfig(ctx context.Context, surveyURL string) (*RuntimeConfig, error) {
	cfg := newDefaultRuntimeConfig()
	cfg.URL = strings.TrimSpace(surveyURL)
	if cfg.URL == "" {
		return &cfg, nil
	}
	definition, err := c.Parse(ctx, cfg.URL)
	if err != nil {
		return nil, err
	}
	populateConfigSurveyDefinition(&cfg, definition)
	return &cfg, nil
}

func cloneQuestions(src []QuestionMeta) []QuestionMeta {
	cloned := make([]QuestionMeta, len(src))
	copy(cloned, src)
	for i := range cloned {
		cloned[i].RowTexts = append([]string(nil), src[i].RowTexts...)
		cloned[i].OptionTexts = append([]string(nil), src[i].OptionTexts...)
		cloned[i].TextInputLabels = append([]string(nil), src[i].TextInputLabels...)
		cloned[i].JumpRules = cloneMapList(src[i].JumpRules)
		cloned[i].DisplayConditions = cloneMapList(src[i].DisplayConditions)
		cloned[i].ControlsDisplayTargets = cloneMapList(src[i].ControlsDisplayTargets)
		cloned[i].QuestionMedia = cloneMapList(src[i].QuestionMedia)
		cloned[i].ForcedTexts = append([]string(nil), src[i].ForcedTexts...)
		cloned[i].FillableOptions = append([]int(nil), src[i].FillableOptions...)
		cloned[i].AttachedOptionSelects = cloneMapList(src[i].AttachedOptionSelects)
	}
	return cloned
}
