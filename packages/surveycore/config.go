package surveycore

import (
	"context"
	"strings"

	"surveycontroller/surveycore/internal/model"
)

func (c *Client) DefaultConfig(ctx context.Context, surveyURL string) (*RunRequest, error) {
	cfg := newDefaultRunRequest()
	cfg.SurveySource.URL = strings.TrimSpace(surveyURL)
	if cfg.SurveySource.URL == "" {
		return &cfg, nil
	}
	definition, err := c.Parse(ctx, cfg.SurveySource.URL)
	if err != nil {
		return nil, err
	}
	populateConfigSurveyDefinition(&cfg, definition)
	return &cfg, nil
}

func cloneQuestions(src []QuestionMeta) []QuestionMeta {
	return model.CloneQuestions(src)
}

func cloneAttachedOptionSelects(src []model.AttachedOptionSelect) []model.AttachedOptionSelect {
	return model.CloneAttachedOptionSelects(src)
}
