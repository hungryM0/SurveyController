package main

import (
	"context"
	"fmt"
	"time"

	"github.com/SurveyController/SurveyCore/pkg/surveycore"
	"github.com/SurveyController/SurveyCore/pkg/surveycore/model"
	surveyRuntime "github.com/SurveyController/SurveyCore/pkg/surveycore/runtime"
)

func (m *runManager) launch(
	runID string,
	startedAt time.Time,
	config model.RunRequest,
	proxySource string,
	options surveyRuntime.ExecutionOptions,
	settings AppSettings,
	proxy *proxyRuntime,
) (RunTaskState, error) {
	sink, err := openRunLogSink(settings, startedAt, runID)
	if err != nil {
		return m.failStart(runID, startedAt, err), err
	}
	runCtx, cancel := context.WithCancel(context.Background())
	pause := newRunPauseController()
	options.PauseController = pause
	state, err := m.start(runID, startedAt, cancel, pause, sink)
	if err != nil {
		cancel()
		if sink != nil {
			_ = sink.close()
		}
		return state, err
	}

	sleepAcquired := false
	if settings.PreventSleepDuringRun {
		sleepAcquired = m.sleep.Acquire()
	}
	go m.execute(runCtx, runID, config, proxySource, options, settings, proxy, sleepAcquired)
	return state, nil
}

func (m *runManager) execute(
	ctx context.Context,
	runID string,
	config model.RunRequest,
	proxySource string,
	options surveyRuntime.ExecutionOptions,
	settings AppSettings,
	proxy *proxyRuntime,
	sleepAcquired bool,
) {
	if sleepAcquired {
		defer m.sleep.Release()
	}
	result, err := m.runtime.RunWithExecutionOptions(ctx, &config, func(event surveyRuntime.Event) {
		m.append(surveycore.Event(event))
	}, options)
	state := m.finish(runID, result, err, time.Now())
	if !settings.SubmissionReportTelemetry {
		return
	}
	go func() {
		reportCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		m.reportSubmissionResult(reportCtx, proxy, config, proxySource, state.Result, errorFromRunState(state))
	}()
}

func (m *runManager) reportSubmissionResult(ctx context.Context, proxy *proxyRuntime, config model.RunRequest, proxySource string, result *surveycore.RunResult, runErr error) {
	if m.reporter == nil || proxy == nil {
		return
	}
	session, err := proxy.officialProxyClient().SessionManager().Snapshot(ctx)
	if err != nil || !session.Authenticated() {
		return
	}
	m.reporter.Report(ctx, buildSubmissionReport(session, config, proxySource, result, runErr))
}

func errorFromRunState(state RunTaskState) error {
	if state.Error == "" {
		return nil
	}
	return fmt.Errorf("%s", state.Error)
}
