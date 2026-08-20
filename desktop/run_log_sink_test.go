package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/SurveyController/SurveyCore/pkg/surveycore"
)

func TestRunLogSinkStreamsEveryEvent(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SURVEYCONTROLLER_LOCAL_DATA_HOME", root)
	sink, err := openRunLogSink(AppSettings{AutoSaveLogs: true, AutosaveLogCount: 2}, time.Now(), "run-stream")
	if err != nil {
		t.Fatal(err)
	}
	for index := 1; index <= 1_000; index++ {
		if err := sink.write(surveycore.Event{Worker: "worker", Message: "event"}); err != nil {
			t.Fatal(err)
		}
	}
	if err := sink.close(); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(sink.sessionPath)
	if err != nil {
		t.Fatal(err)
	}
	if lines := strings.Count(string(data), "[worker] event\n"); lines != 1_000 {
		t.Fatalf("lines = %d", lines)
	}
	last, err := os.ReadFile(filepath.Join(root, "logs", "last_session.log"))
	if err != nil {
		t.Fatal(err)
	}
	if string(last) != string(data) {
		t.Fatal("last_session.log differs from session log")
	}
}

func TestRunLogSinkDisabledCreatesNoTaskLog(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SURVEYCONTROLLER_LOCAL_DATA_HOME", root)
	sink, err := openRunLogSink(AppSettings{AutoSaveLogs: false}, time.Now(), "run-disabled")
	if err != nil || sink != nil {
		t.Fatalf("sink=%#v err=%v", sink, err)
	}
	if _, err := os.Stat(filepath.Join(root, "logs")); !os.IsNotExist(err) {
		t.Fatalf("logs directory exists: %v", err)
	}
}
