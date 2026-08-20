package main

import "github.com/SurveyController/SurveyCore/pkg/surveycore"

type AppService struct {
	runs        *runManager
	configs     configRepository
	credentials credentialStore
	proxy       *proxyRuntime
}

func NewAppService() *AppService {
	proxy := newProxyRuntime()
	runs := newRunManager()
	runs.survey = newSurveyClient(proxy)
	return &AppService{
		runs:        runs,
		configs:     fileConfigRepository{},
		proxy:       proxy,
		credentials: newCredentialStore(),
	}
}

func newSurveyClient(proxy *proxyRuntime) *surveycore.Client {
	return surveycore.New(surveycore.WithFreeAIIdentityProvider(proxy))
}
