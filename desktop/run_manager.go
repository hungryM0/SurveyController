package main

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/SurveyController/SurveyController/packages/surveycore"
)

var runIDCounter atomic.Uint64

type runManager struct {
	startMu       sync.Mutex
	mu            sync.Mutex
	state         RunTaskState
	events        runEventWindow
	cancel        context.CancelFunc
	done          chan struct{}
	pause         *runPauseController
	logSink       runEventSink
	logErr        error
	stopRequested bool
	survey        *surveycore.Client
	sleep         sleepBlocker
	reporter      submissionReporter
}

type runEventSink interface {
	write(surveycore.Event) error
	close() error
}

func newRunManager() *runManager {
	return &runManager{
		state:    RunTaskState{Status: RunTaskStatusIdle},
		events:   newRunEventWindow(),
		survey:   surveycore.New(),
		sleep:    newSystemSleepBlocker(),
		reporter: newHTTPSubmissionReporter(),
	}
}

func newRunID(now time.Time) string {
	return fmt.Sprintf("run-%d-%d", now.UnixNano(), runIDCounter.Add(1))
}

func (m *runManager) start(runID string, startedAt time.Time, cancel context.CancelFunc, pause *runPauseController, sink runEventSink) (RunTaskState, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if isActiveRunStatus(m.state.Status) {
		return m.snapshotLocked(RunTaskStateRequest{}), fmt.Errorf("任务正在运行")
	}
	m.state = RunTaskState{
		RunID:     runID,
		Status:    RunTaskStatusRunning,
		StartedAt: startedAt,
	}
	m.events = newRunEventWindow()
	m.cancel = cancel
	m.done = make(chan struct{})
	m.pause = pause
	m.logSink = sink
	m.logErr = nil
	m.stopRequested = false
	return m.snapshotLocked(RunTaskStateRequest{}), nil
}

func (m *runManager) failStart(runID string, startedAt time.Time, err error) RunTaskState {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.state = RunTaskState{
		RunID:     runID,
		Status:    RunTaskStatusFailed,
		Error:     err.Error(),
		StartedAt: startedAt,
		EndedAt:   time.Now(),
	}
	m.events = newRunEventWindow()
	m.cancel = nil
	m.done = nil
	m.pause = nil
	m.logSink = nil
	m.logErr = nil
	m.stopRequested = false
	return m.snapshotLocked(RunTaskStateRequest{})
}

func (m *runManager) append(event surveycore.Event) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !isActiveRunStatus(m.state.Status) {
		return
	}
	m.events.append(RunTaskEvent{Event: event})
	if m.logErr != nil || m.logSink == nil {
		return
	}
	if err := m.logSink.write(event); err != nil {
		m.logErr = err
		m.state.Status = RunTaskStatusCanceling
		if m.pause != nil {
			m.pause.Resume()
		}
		if m.cancel != nil {
			m.cancel()
		}
	}
}

func (m *runManager) finish(runID string, result *surveycore.RunResult, runErr error, endedAt time.Time) RunTaskState {
	m.mu.Lock()
	defer m.mu.Unlock()
	if runID != m.state.RunID || !isActiveRunStatus(m.state.Status) {
		return m.snapshotLocked(RunTaskStateRequest{})
	}
	done := m.done
	if runErr != nil && m.logSink != nil && m.logErr == nil {
		event := surveycore.Event{
			Worker:  "core",
			Message: "任务失败：" + runErr.Error(),
			Fail:    true,
			Time:    endedAt,
		}
		m.events.append(RunTaskEvent{Event: event})
		if err := m.logSink.write(event); err != nil {
			m.logErr = err
		}
	}
	if m.logSink != nil {
		if err := m.logSink.close(); err != nil && m.logErr == nil {
			m.logErr = err
		}
	}
	if m.logErr != nil {
		runErr = m.logErr
	}
	m.state.Result = result
	m.state.EndedAt = endedAt
	m.state.PauseReason = ""
	switch {
	case m.stopRequested && (runErr == nil || errors.Is(runErr, context.Canceled)):
		m.state.Status = RunTaskStatusStopped
		m.state.Error = ""
	case runErr != nil:
		m.state.Status = RunTaskStatusFailed
		m.state.Error = runErr.Error()
	default:
		m.state.Status = RunTaskStatusSucceeded
		m.state.Error = ""
	}
	m.cancel = nil
	m.done = nil
	m.pause = nil
	m.logSink = nil
	m.logErr = nil
	m.stopRequested = false
	state := m.snapshotLocked(RunTaskStateRequest{})
	if done != nil {
		close(done)
	}
	return state
}

func (m *runManager) cancelRun() RunTaskState {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.Status == RunTaskStatusRunning || m.state.Status == RunTaskStatusPaused {
		m.state.Status = RunTaskStatusCanceling
		m.state.PauseReason = ""
		m.stopRequested = true
		if m.pause != nil {
			m.pause.Resume()
		}
		if m.cancel != nil {
			m.cancel()
		}
	}
	return m.snapshotLocked(RunTaskStateRequest{})
}

func (m *runManager) pauseRun(reason string) (RunTaskState, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.Status != RunTaskStatusRunning {
		return m.snapshotLocked(RunTaskStateRequest{}), fmt.Errorf("没有正在运行的任务")
	}
	m.state.Status = RunTaskStatusPaused
	m.state.PauseReason = reason
	if m.pause != nil {
		m.pause.Pause(reason)
	}
	return m.snapshotLocked(RunTaskStateRequest{}), nil
}

func (m *runManager) resumeRun() (RunTaskState, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.Status != RunTaskStatusPaused {
		return m.snapshotLocked(RunTaskStateRequest{}), fmt.Errorf("任务未暂停")
	}
	if m.pause != nil {
		m.pause.Resume()
	}
	m.state.Status = RunTaskStatusRunning
	m.state.PauseReason = ""
	return m.snapshotLocked(RunTaskStateRequest{}), nil
}

func (m *runManager) snapshot(request RunTaskStateRequest) RunTaskState {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshotLocked(request)
}

func (m *runManager) snapshotLocked(request RunTaskStateRequest) RunTaskState {
	state := m.state
	afterSequence := request.AfterSequence
	if request.RunID != "" && request.RunID != state.RunID {
		afterSequence = 0
	}
	state.Events = m.events.snapshot(afterSequence)
	state.NextSequence = m.events.nextSequence()
	state.DroppedEvents = m.events.droppedEvents()
	return state
}

func isActiveRunStatus(status RunTaskStatus) bool {
	return status == RunTaskStatusRunning || status == RunTaskStatusPaused || status == RunTaskStatusCanceling
}
