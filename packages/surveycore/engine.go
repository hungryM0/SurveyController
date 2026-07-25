package surveycore

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

func RunExecution(ctx context.Context, cfg *RunRequest, submit SubmitFunc, handler EventHandler, options ExecutionOptions) (*RunResult, error) {
	if cfg == nil {
		return nil, fmt.Errorf("%w: 配置为空", ErrInvalidConfig)
	}
	if submit == nil {
		return nil, fmt.Errorf("%w: 提交器为空", ErrInvalidConfig)
	}
	target := options.Target
	if target <= 0 {
		target = cfg.ExecutionPlan.Target
	}
	if target <= 0 {
		target = 1
	}
	threads := options.Threads
	if threads <= 0 {
		threads = cfg.ExecutionPlan.Threads
	}
	if threads <= 0 {
		threads = 1
	}
	if threads > target {
		threads = target
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	state := newExecutionState(target, threads, handler, now)
	jobs := make(chan int)
	var workers sync.WaitGroup
	var errorMu sync.Mutex
	var firstErr error
	recordError := func(err error) {
		if err == nil {
			return
		}
		errorMu.Lock()
		defer errorMu.Unlock()
		if firstErr == nil {
			firstErr = err
		}
	}

	for workerIndex := 0; workerIndex < threads; workerIndex++ {
		workerName := fmt.Sprintf("Worker-%d", workerIndex+1)
		workers.Add(1)
		go func(workerIndex int, workerName string) {
			defer workers.Done()
			runExecutionWorker(runCtx, cfg, submit, options, state, workerIndex, workerName, jobs, recordError, cancel)
		}(workerIndex, workerName)
	}

feedLoop:
	for jobIndex := 0; jobIndex < target; jobIndex++ {
		select {
		case <-runCtx.Done():
			break feedLoop
		case jobs <- jobIndex:
		}
	}
	close(jobs)
	workers.Wait()

	result := state.result()
	if ctx.Err() != nil && firstErr == nil {
		firstErr = ctx.Err()
	}
	result.Stopped = errors.Is(firstErr, context.Canceled) || errors.Is(firstErr, context.DeadlineExceeded)
	if firstErr != nil {
		return result, firstErr
	}
	return result, nil
}
