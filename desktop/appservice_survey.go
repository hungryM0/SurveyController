package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/SurveyController/SurveyCore/pkg/surveycore/configio"
)

func (s *AppService) CreateSurveyDocument(ctx context.Context, request ParseSurveyRequest) (configio.ConfigDocument, error) {
	url := strings.TrimSpace(request.URL)
	if url == "" {
		return configio.ConfigDocument{}, fmt.Errorf("问卷链接不能为空")
	}
	document, err := defaultConfigDocument(ctx, s.runs.survey, url)
	if err != nil {
		return configio.ConfigDocument{}, err
	}
	return document, nil
}
