package surveycore

import (
	"context"
	"fmt"
	"strings"
	"time"

	"surveycontroller/surveycore/credamo"
	"surveycontroller/surveycore/internal/model"
	"surveycontroller/surveycore/tencent"
	"surveycontroller/surveycore/wjx"
)

type EventHandler func(Event)

func (c *Client) Run(ctx context.Context, cfg *RuntimeConfig) (*RunResult, error) {
	return c.RunWithEvents(ctx, cfg, nil)
}

func (c *Client) RunWithEvents(ctx context.Context, cfg *RuntimeConfig, handler EventHandler) (*RunResult, error) {
	return c.RunWithExecutionOptions(ctx, cfg, handler, ExecutionOptionsFromConfig(cfg))
}

func (c *Client) RunWithExecutionOptions(ctx context.Context, cfg *RuntimeConfig, handler EventHandler, options ExecutionOptions) (*RunResult, error) {
	if cfg == nil {
		return nil, fmt.Errorf("%w: 配置为空", ErrInvalidConfig)
	}
	if strings.TrimSpace(cfg.URL) == "" {
		return nil, fmt.Errorf("%w: 必须提供问卷链接", ErrInvalidConfig)
	}
	provider := detectProvider(cfg.URL)
	if cfg.SurveyProvider != "" {
		provider = cfg.SurveyProvider
	}
	runCfg, runOptions, err := c.prepareReverseFillExecution(ctx, cfg, provider, options)
	if err != nil {
		return nil, err
	}
	if err := prepareAnswerDatetimeWindowExecution(runCfg, provider); err != nil {
		return nil, err
	}
	runCfg, runOptions = c.prepareAnswerRuntimeExecution(runCfg, runOptions)
	runCfg, runOptions, err = c.prepareAIExecution(ctx, runCfg, runOptions)
	if err != nil {
		return nil, err
	}
	runCfg, runOptions, err = c.preparePsychometricExecution(ctx, runCfg, runOptions)
	if err != nil {
		return nil, err
	}
	if provider == model.ProviderQQ {
		runner := tencent.Runner{HTTP: httpClientOrDefault(c.httpClient), UserAgent: model.RuntimeUserAgent(runCfg)}
		prepared, prepareErr := runner.Prepare(ctx, runCfg)
		if prepareErr != nil {
			return nil, wrapRunError(prepareErr)
		}
		emitPrepared(handler)
		result, err := RunExecution(ctx, runCfg, func(runCtx context.Context, local *RuntimeConfig, localHandler EventHandler) (*RunResult, error) {
			localRunner := runner
			localRunner.UserAgent = model.RuntimeUserAgent(local)
			runResult, runErr := localRunner.RunPrepared(runCtx, local, prepared, func(event tencent.Event) {
				if localHandler == nil {
					return
				}
				localHandler(Event{
					Worker:  event.Worker,
					Message: event.Message,
					Success: event.Success,
					Fail:    event.Fail,
					Current: event.Current,
					Total:   event.Total,
					Time:    event.Time,
				})
			})
			return resultFromTencent(runResult), runErr
		}, handler, runOptions)
		if err != nil {
			return result, wrapRunError(err)
		}
		return result, nil
	}
	if provider == model.ProviderWJX {
		runner := wjx.Runner{Client: c.httpClient.Client, UserAgent: model.RuntimeUserAgent(runCfg)}
		prepared, prepareErr := runner.Prepare(ctx, runCfg)
		if prepareErr != nil {
			return nil, wrapRunError(prepareErr)
		}
		emitPrepared(handler)
		result, err := RunExecution(ctx, runCfg, func(runCtx context.Context, local *RuntimeConfig, localHandler EventHandler) (*RunResult, error) {
			localRunner := runner
			localRunner.UserAgent = model.RuntimeUserAgent(local)
			runResult, runErr := localRunner.RunPrepared(runCtx, local, prepared, func(event wjx.Event) {
				if localHandler == nil {
					return
				}
				localHandler(Event{
					Worker:  event.Worker,
					Message: event.Message,
					Success: event.Success,
					Fail:    event.Fail,
					Current: event.Current,
					Total:   event.Total,
					Time:    event.Time,
				})
			})
			return resultFromWJX(runResult), runErr
		}, handler, runOptions)
		if err != nil {
			return result, wrapRunError(err)
		}
		return result, nil
	}
	if provider != model.ProviderCredamo {
		return nil, fmt.Errorf("%w: unsupported provider %q", ErrUnsupportedOperation, provider)
	}
	runner := credamo.Runner{HTTP: httpClientOrDefault(c.httpClient), UserAgent: model.RuntimeUserAgent(runCfg)}
	prepared, prepareErr := runner.Prepare(ctx, runCfg)
	if prepareErr != nil {
		return nil, wrapRunError(prepareErr)
	}
	emitPrepared(handler)
	result, err := RunExecution(ctx, runCfg, func(runCtx context.Context, local *RuntimeConfig, localHandler EventHandler) (*RunResult, error) {
		localRunner := runner
		localRunner.UserAgent = model.RuntimeUserAgent(local)
		runResult, runErr := localRunner.RunPrepared(runCtx, local, prepared, func(event credamo.Event) {
			if localHandler == nil {
				return
			}
			localHandler(Event{
				Worker:  event.Worker,
				Message: event.Message,
				Success: event.Success,
				Fail:    event.Fail,
				Current: event.Current,
				Total:   event.Total,
				Time:    event.Time,
			})
		})
		return resultFromCredamo(runResult), runErr
	}, handler, runOptions)
	if err != nil {
		return result, wrapRunError(err)
	}
	return result, nil
}

func emitPrepared(handler EventHandler) {
	if handler != nil {
		handler(Event{Message: "解析成功", Time: time.Now()})
	}
}

func ExecutionOptionsFromConfig(cfg *RuntimeConfig) ExecutionOptions {
	if cfg == nil {
		return ExecutionOptions{}
	}
	target := cfg.Target
	if target <= 0 {
		target = 1
	}
	threads := cfg.Threads
	if cfg.ReverseFillEnabled && cfg.ReverseFillThreads > 0 {
		threads = cfg.ReverseFillThreads
	}
	if threads <= 0 {
		threads = 1
	}
	maxRetries := 0
	if cfg.ReliabilityModeEnabled {
		maxRetries = 1
	}
	return ExecutionOptions{
		Target:          target,
		Threads:         threads,
		MaxRetries:      maxRetries,
		FailStop:        cfg.FailStopEnabled,
		CooldownOnError: 30 * time.Second,
	}
}

func resultFromTencent(result tencent.Result) *RunResult {
	progress := ThreadProgress{
		ThreadName:   "Worker-1",
		ThreadIndex:  0,
		SuccessCount: result.Success,
		FailCount:    result.Fail,
		StepCurrent:  result.Success + result.Fail,
		StepTotal:    result.Target,
		StatusText:   result.Status,
		Running:      false,
		LastUpdate:   time.Now(),
	}
	return &RunResult{
		Success:        result.Success,
		Fail:           result.Fail,
		Stopped:        result.Status == "stopped",
		ThreadProgress: []ThreadProgress{progress},
	}
}

func resultFromWJX(result wjx.Result) *RunResult {
	progress := ThreadProgress{
		ThreadName:   "Worker-1",
		ThreadIndex:  0,
		SuccessCount: result.Success,
		FailCount:    result.Fail,
		StepCurrent:  result.Success + result.Fail,
		StepTotal:    result.Target,
		StatusText:   result.Status,
		Running:      false,
		LastUpdate:   time.Now(),
	}
	return &RunResult{
		Success:        result.Success,
		Fail:           result.Fail,
		Stopped:        result.Status == "stopped",
		ThreadProgress: []ThreadProgress{progress},
	}
}

func resultFromCredamo(result credamo.Result) *RunResult {
	progress := ThreadProgress{
		ThreadName:   "Worker-1",
		ThreadIndex:  0,
		SuccessCount: result.Success,
		FailCount:    result.Fail,
		StepCurrent:  result.Success + result.Fail,
		StepTotal:    result.Target,
		StatusText:   result.Status,
		Running:      false,
		LastUpdate:   time.Now(),
	}
	return &RunResult{
		Success:        result.Success,
		Fail:           result.Fail,
		Stopped:        false,
		ThreadProgress: []ThreadProgress{progress},
	}
}

func wrapRunError(err error) error {
	if err == nil {
		return nil
	}
	switch ClassifyRunError(err) {
	case ErrorKindCanceled:
		return err
	case ErrorKindParse:
		return fmt.Errorf("%w: %w", ErrParseFailed, err)
	case ErrorKindConfig:
		return fmt.Errorf("%w: %w", ErrPrepareConfigFailed, err)
	case ErrorKindUnsupported:
		return fmt.Errorf("%w: %w", ErrUnsupportedOperation, err)
	default:
		return fmt.Errorf("%w: %w", ErrRunFailed, err)
	}
}
