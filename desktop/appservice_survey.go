package main

import (
	"context"
	"fmt"
	"strings"

	configio "github.com/SurveyController/SurveyCore/pkg/surveycore/config"
)

func (s *AppService) CreateSurveyDocument(ctx context.Context, request ParseSurveyRequest) (configio.ConfigDocument, error) {
	url := strings.TrimSpace(request.URL)
	if url == "" {
		return configio.ConfigDocument{}, fmt.Errorf("问卷链接不能为空")
	}
	document, err := defaultConfigDocument(ctx, s.runs.parser, url)
	if err != nil {
		return configio.ConfigDocument{}, err
	}
	return document, nil
}
