package surveycore

import (
	"context"
	"time"

	"surveycontroller/surveycore/internal/model"
)

func waitSubmitInterval(ctx context.Context, interval [2]int, state *executionState, workerIndex int, workerName string) {
	seconds := model.SampleSubmitIntervalSeconds(interval)
	if seconds <= 0 {
		return
	}
	state.setProgress(workerIndex, workerName, "等待提交间隔", true)
	sleepRetry(ctx, time.Duration(seconds)*time.Second)
}

func waitIfExecutionPaused(ctx context.Context, options ExecutionOptions, state *executionState, workerIndex int, workerName string) bool {
	if options.PauseController == nil || !options.PauseController.IsPaused() {
		return false
	}
	state.setProgress(workerIndex, workerName, "已暂停", true)
	if err := options.PauseController.WaitIfPaused(ctx); err != nil {
		state.setProgress(workerIndex, workerName, "已停止", false)
		return true
	}
	state.setProgress(workerIndex, workerName, "等待任务", true)
	return false
}

func acquireExecutionLease(ctx context.Context, options ExecutionOptions, state *executionState, workerIndex int, workerName string, owner string) (ExecutionLease, bool, error) {
	if !options.UseRandomIP || options.LeaseManager == nil {
		return ExecutionLease{}, false, nil
	}
	state.setProgress(workerIndex, workerName, "申请代理", true)
	lease, err := options.LeaseManager.Acquire(ctx, owner)
	if err != nil {
		return ExecutionLease{}, false, err
	}
	if lease.Address != "" {
		state.emit(workerName, "代理已分配", false, false)
	}
	return lease, true, nil
}

func releaseExecutionLease(options ExecutionOptions, owner string, lease ExecutionLease, leased bool, submitErr error) {
	if !leased || options.LeaseManager == nil {
		return
	}
	if submitErr == nil {
		options.LeaseManager.MarkSuccess(lease.Address)
	} else if options.CooldownOnError > 0 {
		options.LeaseManager.MarkCooldown(lease.Address, options.CooldownOnError)
	}
	options.LeaseManager.Release(owner)
}

func shouldRetry(err error, attempt int, attempts int) bool {
	return attempt < attempts && isRetryableRunError(err)
}

func isRetryableRunError(err error) bool {
	return ClassifyRunError(err) == ErrorKindRun
}

func sleepRetry(ctx context.Context, delay time.Duration) {
	if delay <= 0 {
		return
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
	case <-timer.C:
	}
}

func statusFromRunResult(result *RunResult, err error) string {
	if result != nil && len(result.ThreadProgress) > 0 && result.ThreadProgress[0].StatusText != "" {
		return result.ThreadProgress[0].StatusText
	}
	switch ClassifyRunError(err) {
	case ErrorKindUnsupported:
		return "unsupported"
	case ErrorKindCanceled:
		return "stopped"
	case ErrorKindParse:
		return "parse_failed"
	case ErrorKindConfig:
		return "config_failed"
	default:
		return "failed"
	}
}
