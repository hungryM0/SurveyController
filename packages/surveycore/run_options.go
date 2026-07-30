package surveycore

import "time"

const defaultFailStopThreshold = 5

func ExecutionOptionsFromConfig(cfg *RunRequest) ExecutionOptions {
	if cfg == nil {
		return ExecutionOptions{}
	}
	target := cfg.ExecutionPlan.Target
	if target <= 0 {
		target = 1
	}
	threads := cfg.ExecutionPlan.Threads
	if cfg.ReverseFillPlan.Enabled && cfg.ReverseFillPlan.Threads > 0 {
		threads = cfg.ReverseFillPlan.Threads
	}
	if threads <= 0 {
		threads = 1
	}
	maxRetries := 0
	if cfg.PsychometricPolicy.Enabled {
		maxRetries = 1
	}
	return ExecutionOptions{
		Target:            target,
		Threads:           threads,
		MaxRetries:        maxRetries,
		FailStop:          cfg.FailStop,
		FailStopThreshold: defaultFailStopThreshold,
		CooldownOnError:   30 * time.Second,
	}
}

func failStopThreshold(options ExecutionOptions) int {
	if options.FailStopThreshold > 0 {
		return options.FailStopThreshold
	}
	return defaultFailStopThreshold
}
