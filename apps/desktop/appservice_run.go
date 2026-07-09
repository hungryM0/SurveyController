package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"surveycontroller/surveycore"
)

const maxRunTaskStateEvents = 200

func (s *AppService) StartRun(ctx context.Context, request RunSurveyRequest) (RunTaskState, error) {
	s.runMu.Lock()
	if s.run.Running {
		state := s.cloneRunStateLocked()
		s.runMu.Unlock()
		return state, fmt.Errorf("任务正在运行")
	}
	cfg := request.Config
	if settings, err := loadAppSettings(); err == nil {
		_, _ = saveAppSettings(settingsWithAIRuntimeDefaults(settings, cfg))
	}
	options, err := s.proxyRuntime().executionOptions(ctx, cfg)
	if err != nil {
		state := s.cloneRunStateLocked()
		s.runMu.Unlock()
		return state, err
	}
	settings, err := loadAppSettings()
	if err != nil {
		state := s.cloneRunStateLocked()
		s.runMu.Unlock()
		return state, err
	}
	sleepAcquired := false
	if settings.PreventSleepDuringRun {
		sleepAcquired = s.sleepBlocker().Acquire()
	}
	runCtx, cancel := context.WithCancel(context.Background())
	pause := newRunPauseController()
	options.PauseController = pause
	s.cancel = cancel
	s.pause = pause
	s.run = RunTaskState{
		Running:   true,
		StartedAt: time.Now(),
		Config:    &cfg,
		Events:    []surveycore.Event{},
	}
	state := s.cloneRunStateLocked()
	s.runMu.Unlock()

	go s.runSurveyTask(runCtx, cfg, options, sleepAcquired)
	return state, nil
}

func (s *AppService) GetRunTaskState() RunTaskState {
	s.runMu.Lock()
	defer s.runMu.Unlock()
	return s.cloneRunStateLocked()
}

func (s *AppService) CancelRun(_ context.Context) (RunTaskState, error) {
	s.runMu.Lock()
	if s.cancel != nil && s.run.Running {
		s.run.Canceling = true
		if s.pause != nil {
			s.pause.Resume()
		}
		s.cancel()
	}
	state := s.cloneRunStateLocked()
	s.runMu.Unlock()
	return state, nil
}

func (s *AppService) PauseRun(_ context.Context, reason string) (RunTaskState, error) {
	s.runMu.Lock()
	if !s.run.Running {
		state := s.cloneRunStateLocked()
		s.runMu.Unlock()
		return state, fmt.Errorf("没有正在运行的任务")
	}
	s.run.Paused = true
	s.run.PauseReason = strings.TrimSpace(reason)
	if s.run.PauseReason == "" {
		s.run.PauseReason = "手动暂停"
	}
	if s.pause != nil {
		s.pause.Pause(s.run.PauseReason)
	}
	state := s.cloneRunStateLocked()
	s.runMu.Unlock()
	return state, nil
}

func (s *AppService) ResumeRun(_ context.Context) (RunTaskState, error) {
	s.runMu.Lock()
	if s.pause != nil {
		s.pause.Resume()
	}
	s.run.Paused = false
	s.run.PauseReason = ""
	state := s.cloneRunStateLocked()
	s.runMu.Unlock()
	return state, nil
}

func (s *AppService) runSurveyTask(ctx context.Context, cfg surveycore.RuntimeConfig, options surveycore.ExecutionOptions, sleepAcquired bool) {
	if sleepAcquired {
		defer s.sleepBlocker().Release()
	}
	result, err := s.surveyClient().RunWithExecutionOptions(ctx, &cfg, func(event surveycore.Event) {
		s.runMu.Lock()
		s.run.Events = append(s.run.Events, event)
		s.runMu.Unlock()
	}, options)
	s.runMu.Lock()
	defer s.runMu.Unlock()
	s.run.Running = false
	s.run.Canceling = false
	s.run.Paused = false
	s.run.PauseReason = ""
	s.run.Result = result
	s.run.EndedAt = time.Now()
	if err != nil {
		s.run.Error = err.Error()
	} else {
		s.run.Error = ""
	}
	events := append([]surveycore.Event(nil), s.run.Events...)
	endedAt := s.run.EndedAt
	s.cancel = nil
	s.pause = nil
	// 任务结束后重读设置，确保运行期间的设置变更能对本次日志和上报生效。
	finalSettings, _ := loadAppSettings()
	go func() {
		_, _ = autoSaveRunLog(finalSettings, events, endedAt)
	}()
	if finalSettings.SubmissionReportTelemetry {
		go func() {
			reportCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			s.reportSubmissionResult(reportCtx, cfg, result, err)
		}()
	}
}

func (s *AppService) reportSubmissionResult(ctx context.Context, cfg surveycore.RuntimeConfig, result *surveycore.RunResult, runErr error) {
	if s.reporter == nil {
		return
	}
	session, err := s.proxyRuntime().officialProxyClient().SessionManager().Snapshot(ctx)
	if err != nil || !session.Authenticated() {
		return
	}
	s.reporter.Report(ctx, buildSubmissionReport(session, cfg, result, runErr))
}

func (s *AppService) cloneRunStateLocked() RunTaskState {
	state := s.run
	events := s.run.Events
	if len(events) > maxRunTaskStateEvents {
		events = events[len(events)-maxRunTaskStateEvents:]
	}
	state.Events = append([]surveycore.Event(nil), events...)
	if s.run.Config != nil {
		cfg := *s.run.Config
		state.Config = &cfg
	}
	return state
}
