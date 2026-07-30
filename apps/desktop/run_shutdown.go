package main

import "context"

func (m *runManager) shutdown(ctx context.Context) error {
	m.mu.Lock()
	if !isActiveRunStatus(m.state.Status) {
		m.mu.Unlock()
		return nil
	}
	m.state.Status = RunTaskStatusCanceling
	m.state.PauseReason = ""
	m.stopRequested = true
	if m.pause != nil {
		m.pause.Resume()
	}
	if m.cancel != nil {
		m.cancel()
	}
	done := m.done
	m.mu.Unlock()

	if done == nil {
		return nil
	}
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
