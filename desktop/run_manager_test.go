package main

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"surveycontroller/surveycore"
)

func TestRunManagerStateTransitions(t *testing.T) {
	manager := newRunManager()
	ctx, cancel := context.WithCancel(context.Background())
	pause := newRunPauseController()
	state, err := manager.start("run-1", time.Now(), cancel, pause, nil)
	if err != nil || state.Status != RunTaskStatusRunning {
		t.Fatalf("start state=%#v err=%v", state, err)
	}
	state, err = manager.pauseRun("风控")
	if err != nil || state.Status != RunTaskStatusPaused || state.PauseReason != "风控" {
		t.Fatalf("pause state=%#v err=%v", state, err)
	}
	state, err = manager.resumeRun()
	if err != nil || state.Status != RunTaskStatusRunning || state.PauseReason != "" {
		t.Fatalf("resume state=%#v err=%v", state, err)
	}
	state = manager.cancelRun()
	if state.Status != RunTaskStatusCanceling || ctx.Err() != context.Canceled {
		t.Fatalf("cancel state=%#v context=%v", state, ctx.Err())
	}
	state = manager.finish("run-1", nil, context.Canceled, time.Now())
	if state.Status != RunTaskStatusStopped || state.Error != "" {
		t.Fatalf("finish state=%#v", state)
	}
}

func TestRunManagerRejectsDuplicateStart(t *testing.T) {
	manager := newRunManager()
	_, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, err := manager.start("run-1", time.Now(), cancel, newRunPauseController(), nil); err != nil {
		t.Fatal(err)
	}
	state, err := manager.start("run-2", time.Now(), cancel, newRunPauseController(), nil)
	if err == nil || state.RunID != "run-1" || state.Status != RunTaskStatusRunning {
		t.Fatalf("state=%#v err=%v", state, err)
	}
}

func TestRunManagerCursorResetsAcrossRuns(t *testing.T) {
	manager := newRunManager()
	_, cancel := context.WithCancel(context.Background())
	if _, err := manager.start("run-1", time.Now(), cancel, newRunPauseController(), nil); err != nil {
		t.Fatal(err)
	}
	manager.append(surveycore.Event{Message: "first"})
	manager.finish("run-1", nil, nil, time.Now())

	_, cancel = context.WithCancel(context.Background())
	defer cancel()
	if _, err := manager.start("run-2", time.Now(), cancel, newRunPauseController(), nil); err != nil {
		t.Fatal(err)
	}
	manager.append(surveycore.Event{Message: "second"})
	state := manager.snapshot(RunTaskStateRequest{RunID: "run-1", AfterSequence: 100})
	if state.RunID != "run-2" || state.NextSequence != 1 || len(state.Events) != 1 || state.Events[0].Event.Message != "second" {
		t.Fatalf("state = %#v", state)
	}
}

func TestRunManagerLogFailureFailsTask(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SURVEYCONTROLLER_LOCAL_DATA_HOME", root)
	settings := AppSettings{AutoSaveLogs: true, AutosaveLogCount: 1}
	sink, err := openRunLogSink(settings, time.Now(), "run-log-failure")
	if err != nil {
		t.Fatal(err)
	}
	if err := sink.sessionFile.Close(); err != nil {
		t.Fatal(err)
	}

	manager := newRunManager()
	ctx, cancel := context.WithCancel(context.Background())
	if _, err := manager.start("run-1", time.Now(), cancel, newRunPauseController(), sink); err != nil {
		t.Fatal(err)
	}
	manager.append(surveycore.Event{Message: strings.Repeat("x", runLogBufferSize*2)})
	if !errors.Is(ctx.Err(), context.Canceled) {
		t.Fatalf("context error = %v", ctx.Err())
	}
	state := manager.finish("run-1", nil, context.Canceled, time.Now())
	if state.Status != RunTaskStatusFailed || state.Error == "" {
		t.Fatalf("state = %#v", state)
	}
}

func TestRunManagerPersistsFinalRunError(t *testing.T) {
	sink := &trackingRunEventSink{}
	manager := newRunManager()
	_, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, err := manager.start("run-error", time.Now(), cancel, newRunPauseController(), sink); err != nil {
		t.Fatal(err)
	}

	state := manager.finish("run-error", nil, errors.New("提交被拒绝：验证码错误"), time.Now())
	if state.Status != RunTaskStatusFailed || state.Error != "提交被拒绝：验证码错误" {
		t.Fatalf("state = %#v", state)
	}
	if got := sink.lastMessage(); got != "任务失败：提交被拒绝：验证码错误" {
		t.Fatalf("last log message = %q", got)
	}
	if len(state.Events) != 1 || state.Events[0].Event.Message != "任务失败：提交被拒绝：验证码错误" {
		t.Fatalf("events = %#v", state.Events)
	}
}

func TestRunManagerShutdownCancelsAndWaitsForFinish(t *testing.T) {
	sink := &trackingRunEventSink{}
	manager := newRunManager()
	runCtx, cancel := context.WithCancel(context.Background())
	if _, err := manager.start("run-shutdown", time.Now(), cancel, newRunPauseController(), sink); err != nil {
		t.Fatal(err)
	}

	shutdownDone := make(chan error, 1)
	go func() {
		shutdownDone <- manager.shutdown(context.Background())
	}()
	select {
	case <-runCtx.Done():
	case <-time.After(time.Second):
		t.Fatal("shutdown did not cancel the run")
	}
	select {
	case err := <-shutdownDone:
		t.Fatalf("shutdown returned before finish: %v", err)
	default:
	}

	state := manager.finish("run-shutdown", nil, context.Canceled, time.Now())
	if state.Status != RunTaskStatusStopped {
		t.Fatalf("state = %#v", state)
	}
	select {
	case err := <-shutdownDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("shutdown did not return after finish")
	}
	if sink.closedCount() != 1 {
		t.Fatalf("sink close calls = %d", sink.closedCount())
	}
}

func TestRunManagerShutdownHonorsTimeout(t *testing.T) {
	manager := newRunManager()
	_, cancel := context.WithCancel(context.Background())
	if _, err := manager.start("run-timeout", time.Now(), cancel, newRunPauseController(), nil); err != nil {
		t.Fatal(err)
	}
	shutdownCtx, stopWaiting := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer stopWaiting()
	if err := manager.shutdown(shutdownCtx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err = %v", err)
	}
	state := manager.snapshot(RunTaskStateRequest{})
	if state.Status != RunTaskStatusCanceling {
		t.Fatalf("state = %#v", state)
	}
	manager.finish("run-timeout", nil, context.Canceled, time.Now())
}

func TestRunManagerAppliesLogBackpressureWithoutGrowingEventWindow(t *testing.T) {
	sink := &blockingRunEventSink{entered: make(chan struct{}), release: make(chan struct{})}
	manager := newRunManager()
	_, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, err := manager.start("run-backpressure", time.Now(), cancel, newRunPauseController(), sink); err != nil {
		t.Fatal(err)
	}

	appendDone := make(chan struct{})
	go func() {
		manager.append(surveycore.Event{Message: "blocked"})
		close(appendDone)
	}()
	select {
	case <-sink.entered:
	case <-time.After(time.Second):
		t.Fatal("log sink was not reached")
	}
	select {
	case <-appendDone:
		t.Fatal("append bypassed log backpressure")
	case <-time.After(20 * time.Millisecond):
	}
	close(sink.release)
	select {
	case <-appendDone:
	case <-time.After(time.Second):
		t.Fatal("append did not resume")
	}
	state := manager.snapshot(RunTaskStateRequest{})
	if len(state.Events) != 1 || len(manager.events.events) != maxRunTaskStateEvents || cap(manager.events.events) != maxRunTaskStateEvents {
		t.Fatalf("state=%#v storage len=%d cap=%d", state, len(manager.events.events), cap(manager.events.events))
	}
}

func TestRunManagerConcurrentSnapshotsRemainOrdered(t *testing.T) {
	manager := newRunManager()
	_, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, err := manager.start("run-concurrent", time.Now(), cancel, newRunPauseController(), nil); err != nil {
		t.Fatal(err)
	}

	var writers sync.WaitGroup
	for worker := 0; worker < 8; worker++ {
		writers.Add(1)
		go func(worker int) {
			defer writers.Done()
			for current := 0; current < 2_000; current++ {
				manager.append(surveycore.Event{Worker: string(rune('a' + worker)), Current: current})
			}
		}(worker)
	}
	for snapshot := 0; snapshot < 500; snapshot++ {
		assertRunEventsOrdered(t, manager.snapshot(RunTaskStateRequest{}).Events)
	}
	writers.Wait()
	state := manager.snapshot(RunTaskStateRequest{})
	assertRunEventsOrdered(t, state.Events)
	if len(state.Events) != maxRunTaskStateEvents || state.NextSequence != 16_000 || state.DroppedEvents != 16_000-maxRunTaskStateEvents {
		t.Fatalf("state = %#v", state)
	}
}

func assertRunEventsOrdered(t *testing.T, events []RunTaskEvent) {
	t.Helper()
	for index := 1; index < len(events); index++ {
		if events[index-1].Sequence >= events[index].Sequence {
			t.Fatalf("events are not ordered at %d: %#v", index, events)
		}
	}
}

type blockingRunEventSink struct {
	once    sync.Once
	entered chan struct{}
	release chan struct{}
}

type trackingRunEventSink struct {
	mu         sync.Mutex
	closeCalls int
	events     []surveycore.Event
}

func (s *trackingRunEventSink) write(event surveycore.Event) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, event)
	return nil
}

func (s *trackingRunEventSink) close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closeCalls++
	return nil
}

func (s *trackingRunEventSink) closedCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closeCalls
}

func (s *trackingRunEventSink) lastMessage() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.events) == 0 {
		return ""
	}
	return s.events[len(s.events)-1].Message
}

func (s *blockingRunEventSink) write(surveycore.Event) error {
	s.once.Do(func() { close(s.entered) })
	<-s.release
	return nil
}

func (*blockingRunEventSink) close() error {
	return nil
}
