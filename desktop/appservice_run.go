package main

import (
	"context"
	"fmt"
	"strings"
	"time"
)

func (s *AppService) StartRun(ctx context.Context, request RunSurveyRequest) (RunTaskState, error) {
	manager := s.runs
	manager.startMu.Lock()
	defer manager.startMu.Unlock()

	current := manager.snapshot(RunTaskStateRequest{})
	if isActiveRunStatus(current.Status) {
		return current, fmt.Errorf("任务正在运行")
	}

	document := request.Config
	cfg, err := coreRunRequest(document)
	if err != nil {
		state := manager.failStart(newRunID(time.Now()), time.Now(), err)
		return state, err
	}
	startedAt := time.Now()
	runID := newRunID(startedAt)
	settings, err := s.loadAppSettings(ctx)
	if err != nil {
		return manager.failStart(runID, startedAt, err), err
	}
	checked := s.CheckTask(ctx, CheckTaskRequest{Config: document, AIProfile: &settings.AIProfile})
	if checked.Status == TaskCheckBlocked {
		err := taskCheckError(checked)
		return manager.failStart(runID, startedAt, err), err
	}

	options, err := s.proxy.executionOptions(ctx, document)
	if err != nil {
		state := manager.failStart(runID, startedAt, err)
		return state, err
	}
	profile, configured, err := aiProfileForSettings(ctx, s.credentials, settings.AIProfile)
	if err != nil {
		state := manager.failStart(runID, startedAt, err)
		return state, err
	}
	if strings.EqualFold(profile.Mode, "provider") && !configured && answerPlanUsesAI(cfg.AnswerPlan) {
		err := fmt.Errorf("AI 配置不完整：缺少 API Key")
		state := manager.failStart(runID, startedAt, err)
		return state, err
	}
	options.AIProfile = profile
	return manager.launch(runID, startedAt, cfg, document.Network.ProxySource, options, settings, s.proxy)
}

func (s *AppService) GetRunTaskState(request RunTaskStateRequest) RunTaskState {
	return s.runs.snapshot(request)
}

func (s *AppService) CancelRun(_ context.Context) (RunTaskState, error) {
	return s.runs.cancelRun(), nil
}

func (s *AppService) PauseRun(_ context.Context, reason string) (RunTaskState, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "手动暂停"
	}
	return s.runs.pauseRun(reason)
}

func (s *AppService) ResumeRun(_ context.Context) (RunTaskState, error) {
	return s.runs.resumeRun()
}
