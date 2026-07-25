package surveycore

import (
	"fmt"
	"sync"
	"time"
)

type executionState struct {
	mu       sync.Mutex
	target   int
	success  int
	fail     int
	progress []ThreadProgress
	handler  EventHandler
	now      func() time.Time
}

func newExecutionState(target int, threads int, handler EventHandler, now func() time.Time) *executionState {
	progress := make([]ThreadProgress, threads)
	for index := range progress {
		progress[index] = ThreadProgress{
			ThreadName:  fmt.Sprintf("Worker-%d", index+1),
			ThreadIndex: index,
			StepTotal:   target,
			StatusText:  "等待任务",
			LastUpdate:  now(),
		}
	}
	return &executionState{target: target, progress: progress, handler: handler, now: now}
}

func (s *executionState) setProgress(index int, worker string, status string, running bool) {
	s.mu.Lock()
	if index >= 0 && index < len(s.progress) {
		s.progress[index].ThreadName = worker
		s.progress[index].ThreadIndex = index
		s.progress[index].StepTotal = s.target
		s.progress[index].StatusText = status
		s.progress[index].Running = running
		s.progress[index].LastUpdate = s.now()
	}
	s.mu.Unlock()
}

func (s *executionState) forward(index int, worker string, event Event) {
	if event.Time.IsZero() {
		event.Time = s.now()
	}
	event.Worker = worker
	s.mu.Lock()
	if index >= 0 && index < len(s.progress) {
		if event.Message != "" {
			s.progress[index].StatusText = event.Message
		}
		s.progress[index].Running = true
		s.progress[index].LastUpdate = event.Time
	}
	current := s.success + s.fail
	s.mu.Unlock()
	event.Current = current
	event.Total = s.target
	s.callHandler(event)
}

func (s *executionState) addSuccess(index int, worker string, status string) {
	s.mu.Lock()
	s.success++
	current := s.success + s.fail
	now := s.now()
	if index >= 0 && index < len(s.progress) {
		s.progress[index].SuccessCount++
		s.progress[index].StepCurrent = current
		s.progress[index].StepTotal = s.target
		s.progress[index].StatusText = status
		s.progress[index].Running = true
		s.progress[index].LastUpdate = now
	}
	s.mu.Unlock()
	s.callHandler(Event{Worker: worker, Message: status, Success: true, Current: current, Total: s.target, Time: now})
}

func (s *executionState) addFail(index int, worker string, status string) {
	s.mu.Lock()
	s.fail++
	current := s.success + s.fail
	now := s.now()
	if index >= 0 && index < len(s.progress) {
		s.progress[index].FailCount++
		s.progress[index].StepCurrent = current
		s.progress[index].StepTotal = s.target
		s.progress[index].StatusText = status
		s.progress[index].Running = true
		s.progress[index].LastUpdate = now
	}
	s.mu.Unlock()
	s.callHandler(Event{Worker: worker, Message: status, Fail: true, Current: current, Total: s.target, Time: now})
}

func (s *executionState) emit(worker string, message string, success bool, fail bool) {
	s.mu.Lock()
	current := s.success + s.fail
	now := s.now()
	s.mu.Unlock()
	s.callHandler(Event{Worker: worker, Message: message, Success: success, Fail: fail, Current: current, Total: s.target, Time: now})
}

func (s *executionState) callHandler(event Event) {
	if s.handler != nil {
		s.handler(event)
	}
}

func (s *executionState) result() *RunResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	progress := make([]ThreadProgress, len(s.progress))
	copy(progress, s.progress)
	return &RunResult{
		Success:        s.success,
		Fail:           s.fail,
		ThreadProgress: progress,
	}
}
