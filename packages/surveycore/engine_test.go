package surveycore

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"surveycontroller/surveycore/internal/runerror"
)

func TestRunExecutionRunsTargetWithConcurrency(t *testing.T) {
	var mu sync.Mutex
	active := 0
	maxActive := 0
	result, err := RunExecution(context.Background(), &RuntimeConfig{URL: "https://example.test", Target: 5, Threads: 3}, func(ctx context.Context, cfg *RuntimeConfig, _ EventHandler) (*RunResult, error) {
		if cfg.Target != 1 {
			t.Fatalf("cfg.Target = %d, want 1", cfg.Target)
		}
		mu.Lock()
		active++
		if active > maxActive {
			maxActive = active
		}
		mu.Unlock()
		time.Sleep(10 * time.Millisecond)
		mu.Lock()
		active--
		mu.Unlock()
		return &RunResult{Success: 1}, nil
	}, nil, ExecutionOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Success != 5 || result.Fail != 0 || len(result.ThreadProgress) != 3 {
		t.Fatalf("result = %#v", result)
	}
	if maxActive < 2 || maxActive > 3 {
		t.Fatalf("maxActive = %d", maxActive)
	}
}

func TestRunExecutionRetriesRunError(t *testing.T) {
	var attempts int
	var events []Event
	result, err := RunExecution(context.Background(), &RuntimeConfig{URL: "https://example.test", Target: 1, Threads: 1}, func(_ context.Context, _ *RuntimeConfig, _ EventHandler) (*RunResult, error) {
		attempts++
		if attempts == 1 {
			return &RunResult{Fail: 1}, errors.New("temporary network failure")
		}
		return &RunResult{Success: 1}, nil
	}, func(event Event) {
		events = append(events, event)
	}, ExecutionOptions{MaxRetries: 1})
	if err != nil {
		t.Fatal(err)
	}
	if attempts != 2 || result.Success != 1 || result.Fail != 0 {
		t.Fatalf("attempts=%d result=%#v", attempts, result)
	}
	if len(events) == 0 {
		t.Fatal("expected retry events")
	}
}

func TestRunExecutionDoesNotClassifyChineseErrorText(t *testing.T) {
	var attempts int
	_, err := RunExecution(context.Background(), &RuntimeConfig{URL: "https://example.test", Target: 1, Threads: 1}, func(_ context.Context, _ *RuntimeConfig, _ EventHandler) (*RunResult, error) {
		attempts++
		if attempts == 1 {
			return &RunResult{Fail: 1}, errors.New("临时网络错误：解析配置答案服务不可用")
		}
		return &RunResult{Success: 1}, nil
	}, nil, ExecutionOptions{MaxRetries: 1})
	if err != nil {
		t.Fatal(err)
	}
	if attempts != 2 {
		t.Fatalf("attempts = %d", attempts)
	}
}

func TestRunExecutionUsesStructuredErrorKind(t *testing.T) {
	tests := []struct {
		name string
		kind runerror.Kind
		want int
	}{
		{name: "parse", kind: runerror.KindParse, want: 1},
		{name: "config", kind: runerror.KindConfig, want: 1},
		{name: "unsupported", kind: runerror.KindUnsupported, want: 1},
		{name: "run", kind: runerror.KindRun, want: 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			attempts := 0
			_, _ = RunExecution(context.Background(), &RuntimeConfig{URL: "https://example.test", Target: 1, Threads: 1}, func(_ context.Context, _ *RuntimeConfig, _ EventHandler) (*RunResult, error) {
				attempts++
				return &RunResult{Fail: 1}, runerror.Wrap(tt.kind, errors.New("同一段错误文案"))
			}, nil, ExecutionOptions{MaxRetries: 1})
			if attempts != tt.want {
				t.Fatalf("attempts = %d, want %d", attempts, tt.want)
			}
		})
	}
}

func TestRunExecutionCancelsAndStopsWorkers(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	var started sync.WaitGroup
	started.Add(1)
	result, err := RunExecution(ctx, &RuntimeConfig{URL: "https://example.test", Target: 3, Threads: 1}, func(ctx context.Context, _ *RuntimeConfig, _ EventHandler) (*RunResult, error) {
		started.Done()
		cancel()
		<-ctx.Done()
		return &RunResult{}, ctx.Err()
	}, nil, ExecutionOptions{})
	started.Wait()
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v", err)
	}
	if result == nil || !result.Stopped {
		t.Fatalf("result = %#v", result)
	}
}

func TestRunExecutionLeaseLifecycle(t *testing.T) {
	leases := &fakeLeaseManager{}
	result, err := RunExecution(context.Background(), &RuntimeConfig{
		URL:             "https://example.test",
		Target:          2,
		Threads:         1,
		RandomIPEnabled: true,
	}, func(_ context.Context, cfg *RuntimeConfig, _ EventHandler) (*RunResult, error) {
		if cfg.ActiveProxyAddress == "" {
			t.Fatal("missing active proxy address")
		}
		return &RunResult{Success: 1}, nil
	}, nil, ExecutionOptions{LeaseManager: leases})
	if err != nil {
		t.Fatal(err)
	}
	if result.Success != 2 {
		t.Fatalf("result = %#v", result)
	}
	if leases.acquired != 2 || leases.released != 2 || leases.success != 2 {
		t.Fatalf("leases = %#v", leases)
	}
}

func TestRunExecutionCommitsAnswerRuntimeOnlyOnSuccess(t *testing.T) {
	runtime := newAnswerRuntimeState()
	cfg := &RuntimeConfig{URL: "https://example.test", Target: 1, Threads: 1, AnswerRuntime: runtime}
	result, err := RunExecution(context.Background(), cfg, func(_ context.Context, local *RuntimeConfig, _ EventHandler) (*RunResult, error) {
		if local.AnswerRuntimeOwner == "" {
			t.Fatal("missing answer runtime owner")
		}
		local.AnswerRuntime.AppendPendingDistributionChoice(local.AnswerRuntimeOwner, "q:1", 1, 2)
		return &RunResult{Success: 1}, nil
	}, nil, ExecutionOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Success != 1 {
		t.Fatalf("result = %#v", result)
	}
	total, counts := runtime.SnapshotDistributionStats("q:1", 2)
	if total != 1 || counts[1] != 1 {
		t.Fatalf("total=%d counts=%#v", total, counts)
	}

	runtime = newAnswerRuntimeState()
	cfg = &RuntimeConfig{URL: "https://example.test", Target: 1, Threads: 1, AnswerRuntime: runtime}
	_, _ = RunExecution(context.Background(), cfg, func(_ context.Context, local *RuntimeConfig, _ EventHandler) (*RunResult, error) {
		local.AnswerRuntime.AppendPendingDistributionChoice(local.AnswerRuntimeOwner, "q:1", 1, 2)
		return &RunResult{Fail: 1}, errors.New("temporary network failure")
	}, nil, ExecutionOptions{})
	total, counts = runtime.SnapshotDistributionStats("q:1", 2)
	if total != 0 || counts[1] != 0 {
		t.Fatalf("failed submit polluted stats: total=%d counts=%#v", total, counts)
	}
}

func TestRunExecutionClassifiesUnsupportedWithoutRetry(t *testing.T) {
	var attempts int
	result, err := RunExecution(context.Background(), &RuntimeConfig{URL: "https://example.test", Target: 1, Threads: 1}, func(_ context.Context, _ *RuntimeConfig, _ EventHandler) (*RunResult, error) {
		attempts++
		return &RunResult{}, fmt.Errorf("%w: no runner", ErrUnsupportedOperation)
	}, nil, ExecutionOptions{MaxRetries: 3})
	if !errors.Is(err, ErrUnsupportedOperation) {
		t.Fatalf("err = %v", err)
	}
	if attempts != 1 {
		t.Fatalf("attempts = %d", attempts)
	}
	if result == nil || result.Fail != 1 {
		t.Fatalf("result = %#v", result)
	}
}

func TestRunExecutionWaitsWhilePaused(t *testing.T) {
	controller := newFakePauseController(true)
	done := make(chan struct {
		result *RunResult
		err    error
	}, 1)
	var attempts int
	go func() {
		result, err := RunExecution(context.Background(), &RuntimeConfig{URL: "https://example.test", Target: 1, Threads: 1}, func(_ context.Context, _ *RuntimeConfig, _ EventHandler) (*RunResult, error) {
			attempts++
			return &RunResult{Success: 1}, nil
		}, nil, ExecutionOptions{PauseController: controller})
		done <- struct {
			result *RunResult
			err    error
		}{result: result, err: err}
	}()

	select {
	case <-done:
		t.Fatal("run finished while paused")
	case <-time.After(20 * time.Millisecond):
	}
	if attempts != 0 {
		t.Fatalf("attempts while paused = %d", attempts)
	}
	controller.Resume()

	select {
	case got := <-done:
		if got.err != nil {
			t.Fatal(got.err)
		}
		if got.result == nil || got.result.Success != 1 {
			t.Fatalf("result = %#v", got.result)
		}
	case <-time.After(time.Second):
		t.Fatal("run did not resume")
	}
}

type fakeLeaseManager struct {
	acquired int
	released int
	success  int
	cooldown int
}

func (m *fakeLeaseManager) Acquire(_ context.Context, _ string) (ExecutionLease, error) {
	m.acquired++
	return ExecutionLease{Address: fmt.Sprintf("http://127.0.0.%d:8000", m.acquired), Source: "fake"}, nil
}

func (m *fakeLeaseManager) Release(_ string) (ExecutionLease, bool) {
	m.released++
	return ExecutionLease{}, true
}

func (m *fakeLeaseManager) MarkSuccess(_ string) bool {
	m.success++
	return true
}

func (m *fakeLeaseManager) MarkCooldown(_ string, _ time.Duration) {
	m.cooldown++
}

type fakePauseController struct {
	mu     sync.Mutex
	paused bool
	resume chan struct{}
}

func newFakePauseController(paused bool) *fakePauseController {
	return &fakePauseController{paused: paused, resume: make(chan struct{})}
}

func (c *fakePauseController) IsPaused() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.paused
}

func (c *fakePauseController) WaitIfPaused(ctx context.Context) error {
	c.mu.Lock()
	if !c.paused {
		c.mu.Unlock()
		return nil
	}
	resume := c.resume
	c.mu.Unlock()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-resume:
		return nil
	}
}

func (c *fakePauseController) Resume() {
	c.mu.Lock()
	if !c.paused {
		c.mu.Unlock()
		return
	}
	resume := c.resume
	c.paused = false
	c.mu.Unlock()
	close(resume)
}
