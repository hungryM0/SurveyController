package surveycore

import (
	"context"
	"fmt"

	"surveycontroller/surveycore/internal/psychometrics"
)

func (c *Client) preparePsychometricExecution(ctx context.Context, cfg *RunRequest, options ExecutionOptions) (*RunRequest, ExecutionOptions, error) {
	if cfg == nil {
		return nil, options, fmt.Errorf("%w: 配置为空", ErrInvalidConfig)
	}
	runCfg := cloneRunRequest(cfg)
	if runCfg.ReverseFillPlan.Enabled || !runCfg.PsychometricPolicy.Enabled {
		return &runCfg, options, nil
	}
	if len(runCfg.SurveyDefinition.Questions) == 0 {
		definition, err := c.Parse(ctx, runCfg.SurveySource.URL)
		if err != nil {
			return nil, options, fmt.Errorf("%w: 信效度计划需要先解析问卷: %v", ErrParseFailed, err)
		}
		populateConfigSurveyDefinition(&runCfg, definition)
	}
	ensureQuestionStrategies(&runCfg)
	target := options.Target
	if target <= 0 {
		target = runCfg.Target
	}
	if target <= 0 {
		target = 1
	}
	plan := psychometrics.BuildJointPlan(&runCfg)
	if plan == nil {
		return &runCfg, options, nil
	}
	configure := options.ConfigureJob
	options.ConfigureJob = func(ctx context.Context, jobIndex int, attempt int, job *JobRequest) error {
		if configure != nil {
			if err := configure(ctx, jobIndex, attempt, job); err != nil {
				return err
			}
		}
		if jobIndex < 0 || jobIndex >= plan.SampleCount {
			return fmt.Errorf("%w: 信效度样本序号超出范围", ErrPrepareConfigFailed)
		}
		job.Answers.Strategies = psychometrics.ApplySample(job.Answers.Strategies, job.Submission.Definition.Questions, plan, jobIndex)
		return nil
	}
	return &runCfg, options, nil
}
