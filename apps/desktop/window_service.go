package main

import "sync"

type WindowService struct {
	mu             sync.Mutex
	closeConfirmed bool
}

func (s *WindowService) ConfirmClose() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closeConfirmed = true
}

func (s *WindowService) consumeCloseConfirmed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.closeConfirmed {
		return false
	}
	s.closeConfirmed = false
	return true
}
