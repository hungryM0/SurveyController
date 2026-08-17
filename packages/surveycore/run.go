package surveycore

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/SurveyController/SurveyController/packages/surveycore/credamo"
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
	"github.com/SurveyController/SurveyController/packages/surveycore/tencent"
	"github.com/SurveyController/SurveyController/packages/surveycore/wjx"
)

type EventHandler func(Event)

func (c *Client) Run(ctx context.Context, cfg *RunRequest) (*RunResult, error) {
	return c.RunWithEvents(ctx, cfg, nil)
}

func (c *Client) RunWithEvents(ctx context.Context, cfg *RunRequest, handler EventHandler) (*RunResult, error) {
	return c.RunWithExecutionOptions(ctx, cfg, handler, ExecutionOptionsFromConfig(cfg))
}

func (c *Client) RunWithExecutionOptions(ctx context.Context, cfg *RunRequest, handler EventHandler, options ExecutionOptions) (*RunResult, error) {
	if cfg == nil {
		return nil, fmt.Errorf("%w: 配置为空", ErrInvalidConfig)
	}
	if strings.TrimSpace(cfg.SurveySource.URL) == "" {
		return nil, fmt.Errorf("%w: 必须提供问卷链接", ErrInvalidConfig)
	}
	provider := detectProvider(cfg.SurveySource.URL)
	if cfg.SurveySource.Provider != "" {
		provider = cfg.SurveySource.Provider
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
	baseRequest := model.SubmissionRequest{
		Source:               runCfg.SurveySource,
		Definition:           cloneSurveyDefinition(runCfg.SurveyDefinition),
		AnswerDuration:       runCfg.AnswerDuration,
		AnswerDatetimeWindow: runCfg.AnswerDatetimeWindow,
		Context: model.SubmissionContext{
			AIProfile: runOptions.AIProfile,
			Runtime:   runOptions.AnswerRuntime,
		},
	}
	userAgent := model.RuntimeUserAgent(runOptions.UserAgent)
	if provider == model.ProviderQQ {
		runner := tencent.Runner{HTTP: httpClientOrDefault(c.httpClient), UserAgent: userAgent}
		prepared, prepareErr := runner.Prepare(ctx, &baseRequest)
		if prepareErr != nil {
			return nil, wrapRunError(prepareErr)
		}
		if len(runCfg.SurveyDefinition.Questions) == 0 {
			runCfg.SurveyDefinition = prepared.Definition
		}
		emitPrepared(handler)
		result, err := RunExecution(ctx, runCfg, func(runCtx context.Context, local *model.SubmissionRequest, localHandler EventHandler) (*RunResult, error) {
			localRunner := runner
			localRunner.UserAgent = local.Context.UserAgent
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
		runner := wjx.Runner{Client: c.httpClient.Client, UserAgent: userAgent}
		prepared, prepareErr := runner.Prepare(ctx, &baseRequest)
		if prepareErr != nil {
			return nil, wrapRunError(prepareErr)
		}
		if len(runCfg.SurveyDefinition.Questions) == 0 {
			runCfg.SurveyDefinition = prepared.Definition
		}
		emitPrepared(handler)
		result, err := RunExecution(ctx, runCfg, func(runCtx context.Context, local *model.SubmissionRequest, localHandler EventHandler) (*RunResult, error) {
			localRunner := runner
			localRunner.UserAgent = local.Context.UserAgent
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
	runner := credamo.Runner{HTTP: httpClientOrDefault(c.httpClient), UserAgent: userAgent}
	prepared, prepareErr := runner.Prepare(ctx, &baseRequest)
	if prepareErr != nil {
		return nil, wrapRunError(prepareErr)
	}
	if len(runCfg.SurveyDefinition.Questions) == 0 {
		runCfg.SurveyDefinition = prepared.Definition
	}
	emitPrepared(handler)
	result, err := RunExecution(ctx, runCfg, func(runCtx context.Context, local *model.SubmissionRequest, localHandler EventHandler) (*RunResult, error) {
		localRunner := runner
		localRunner.UserAgent = local.Context.UserAgent
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
