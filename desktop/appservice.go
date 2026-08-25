package main

import (
	"github.com/SurveyController/SurveyCore/pkg/surveycore"
	surveyRuntime "github.com/SurveyController/SurveyCore/pkg/surveycore/runtime"
)

type AppService struct {
	runs        *runManager
	configs     configRepository
	credentials credentialStore
	proxy       *proxyRuntime
}

func NewAppService() *AppService {
	proxy := newProxyRuntime()
	runs := newRunManager()
	runs.parser = surveycore.New()
	runs.runtime = newSurveyRuntimeClient(proxy)
	return &AppService{
		runs:        runs,
		configs:     fileConfigRepository{},
		proxy:       proxy,
		credentials: newCredentialStore(),
	}
}

func newSurveyRuntimeClient(proxy *proxyRuntime) *surveyRuntime.Client {
	return surveyRuntime.New(surveyRuntime.WithFreeAIIdentityProvider(proxy))
}
