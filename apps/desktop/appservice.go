package main

import (
	"context"
	"sync"

	"surveycontroller/surveycore"
)

type AppService struct {
	survey   *surveycore.Client
	reporter submissionReporter
	runMu    sync.Mutex
	closeMu  sync.Mutex

	proxyMu        sync.Mutex
	run            RunTaskState
	cancel         context.CancelFunc
	proxy          *proxyRuntime
	pause          *runPauseController
	sleep          sleepBlocker
	closeConfirmed bool
}

func NewAppService() *AppService {
	proxy := newProxyRuntime(newIPUsageStore())
	return &AppService{
		survey:   surveycore.New(surveycore.WithFreeAIIdentityProvider(proxy)),
		proxy:    proxy,
		sleep:    newSystemSleepBlocker(),
		reporter: newHTTPSubmissionReporter(),
	}
}

func (s *AppService) surveyClient() *surveycore.Client {
	if s.survey != nil {
		return s.survey
	}
	return surveycore.New(surveycore.WithFreeAIIdentityProvider(s.proxyRuntime()))
}

func (s *AppService) proxyRuntime() *proxyRuntime {
	s.proxyMu.Lock()
	defer s.proxyMu.Unlock()
	if s.proxy == nil {
		s.proxy = newProxyRuntime(newIPUsageStore())
	}
	return s.proxy
}

func (s *AppService) sleepBlocker() sleepBlocker {
	if s.sleep == nil {
		s.sleep = newSystemSleepBlocker()
	}
	return s.sleep
}
