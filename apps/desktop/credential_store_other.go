//go:build !windows

package main

import (
	"context"
	"strings"
	"sync"
)

// Non-Windows builds keep credentials in memory so tests and source-only
// tooling never write API keys to a plaintext file.
type processCredentialStore struct {
	mu     sync.Mutex
	values map[string]string
}

var defaultProcessCredentialStore = &processCredentialStore{values: map[string]string{}}

func newCredentialStore() credentialStore {
	return defaultProcessCredentialStore
}

func (s *processCredentialStore) Read(_ context.Context, target string) (string, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	value, ok := s.values[target]
	return value, ok && strings.TrimSpace(value) != "", nil
}

func (s *processCredentialStore) Write(_ context.Context, target string, secret string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if strings.TrimSpace(secret) == "" {
		delete(s.values, target)
		return nil
	}
	s.values[target] = secret
	return nil
}

func (s *processCredentialStore) Delete(_ context.Context, target string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.values, target)
	return nil
}
