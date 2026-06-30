package main

import (
	"context"
	"strings"
	"sync"
)

type runPauseController struct {
	mu     sync.Mutex
	paused bool
	reason string
	resume chan struct{}
}

func newRunPauseController() *runPauseController {
	return &runPauseController{resume: make(chan struct{})}
}

func (c *runPauseController) Pause(reason string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.paused {
		c.reason = normalizePauseReason(reason)
		return
	}
	c.paused = true
	c.reason = normalizePauseReason(reason)
	c.resume = make(chan struct{})
}

func (c *runPauseController) Resume() {
	c.mu.Lock()
	if !c.paused {
		c.mu.Unlock()
		return
	}
	resume := c.resume
	c.paused = false
	c.reason = ""
	c.mu.Unlock()
	close(resume)
}

func (c *runPauseController) WaitIfPaused(ctx context.Context) error {
	c.mu.Lock()
	if !c.paused {
		c.mu.Unlock()
		return nil
	}
	resume := c.resume
	c.mu.Unlock()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-resume:
		return nil
	}
}

func (c *runPauseController) IsPaused() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.paused
}

func (c *runPauseController) Snapshot() (bool, string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.paused, c.reason
}

func normalizePauseReason(reason string) string {
	text := strings.TrimSpace(reason)
	if text == "" {
		return "手动暂停"
	}
	return text
}
