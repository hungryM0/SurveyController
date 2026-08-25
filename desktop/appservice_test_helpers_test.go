package main

import (
	"context"
	"errors"
	"strings"
	"sync"

	configio "github.com/SurveyController/SurveyCore/pkg/surveycore/config"
	"github.com/SurveyController/SurveyCore/pkg/surveycore/model"
)

type memoryCredentialStore struct {
	mu        sync.Mutex
	values    map[string]string
	readErr   error
	writeErr  error
	deleteErr error
}

func newMemoryCredentialStore() *memoryCredentialStore {
	return &memoryCredentialStore{values: map[string]string{}}
}

func (s *memoryCredentialStore) Read(ctx context.Context, target string) (string, bool, error) {
	if err := ctx.Err(); err != nil {
		return "", false, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.readErr != nil {
		return "", false, s.readErr
	}
	value, ok := s.values[target]
	return value, ok && strings.TrimSpace(value) != "", nil
}

func (s *memoryCredentialStore) Write(ctx context.Context, target string, secret string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.writeErr != nil {
		return s.writeErr
	}
	if strings.TrimSpace(secret) == "" {
		delete(s.values, target)
		return nil
	}
	s.values[target] = secret
	return nil
}

func (s *memoryCredentialStore) Delete(ctx context.Context, target string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.deleteErr != nil {
		return s.deleteErr
	}
	delete(s.values, target)
	return nil
}

func (s *memoryCredentialStore) secret(target string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.values[target]
}

func newTestAppService() *AppService {
	service := NewAppService()
	service.credentials = newMemoryCredentialStore()
	return service
}

func testConfigDocument(url string, provider string) configio.ConfigDocument {
	if strings.TrimSpace(provider) == "" {
		provider = model.ProviderWJX
	}
	return configio.ConfigDocument{
		SchemaVersion: configio.ConfigSchemaVersion,
		Survey: configio.SurveyDocument{
			URL:      strings.TrimSpace(url),
			Provider: provider,
			Definition: model.SurveyDefinition{
				Provider: provider,
			},
		},
		Execution: model.ExecutionPlan{
			Target:               1,
			Threads:              1,
			AnswerDuration:       [2]int{60, 120},
			FailStop:             true,
			PauseOnAliyunCaptcha: true,
		},
		Network:       defaultNetworkSettings(),
		Answers:       model.AnswerPlan{},
		ReverseFill:   model.ReverseFillPlan{Format: configio.ReverseFillFormatAuto, StartRow: 1, Threads: 1},
		Psychometrics: model.PsychometricPolicy{Enabled: true, TargetAlpha: 0.85},
	}
}

func credentialError(message string) error {
	return errors.New(message)
}
