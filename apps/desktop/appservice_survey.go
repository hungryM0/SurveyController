package main

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"surveycontroller/surveycore"
)

func (s *AppService) ParseSurvey(ctx context.Context, request ParseSurveyRequest) (SurveyCoreState, error) {
	url := strings.TrimSpace(request.URL)
	if url == "" {
		return SurveyCoreState{}, fmt.Errorf("问卷链接不能为空")
	}
	definition, err := s.surveyClient().Parse(ctx, url)
	if err != nil {
		return SurveyCoreState{}, err
	}
	return SurveyCoreState{Definition: definition}, nil
}

func (s *AppService) BuildDefaultConfig(ctx context.Context, request ParseSurveyRequest) (SurveyCoreState, error) {
	url := strings.TrimSpace(request.URL)
	if url == "" {
		return SurveyCoreState{}, fmt.Errorf("问卷链接不能为空")
	}
	config, err := s.surveyClient().DefaultConfig(ctx, url)
	if err != nil {
		return SurveyCoreState{}, err
	}
	settings, err := loadAppSettings()
	if err != nil {
		return SurveyCoreState{}, err
	}
	*config = applyAIRuntimeDefaults(*config, settings, false)
	return SurveyCoreState{Config: config}, nil
}

func (s *AppService) RunSurvey(ctx context.Context, request RunSurveyRequest) (SurveyCoreState, error) {
	var (
		events   []surveycore.Event
		eventsMu sync.Mutex
	)
	options, err := s.proxyRuntime().executionOptions(ctx, request.Config)
	if err != nil {
		return SurveyCoreState{}, err
	}
	if settings, err := loadAppSettings(); err == nil {
		_, _ = saveAppSettings(settingsWithAIRuntimeDefaults(settings, request.Config))
	}
	result, err := s.surveyClient().RunWithExecutionOptions(ctx, &request.Config, func(event surveycore.Event) {
		eventsMu.Lock()
		events = append(events, event)
		eventsMu.Unlock()
	}, options)
	if err != nil {
		return SurveyCoreState{Result: result, Events: events}, err
	}
	return SurveyCoreState{Result: result, Events: events}, nil
}
