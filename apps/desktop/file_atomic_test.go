package main

import (
	"errors"
	"os"
	"testing"
)

func TestSaveAppSettingsReplaceFailurePreservesOriginalFile(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	path := settingsPath()
	original := []byte("original settings\n")
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}
	previous := replaceAtomicFile
	replaceAtomicFile = func(string, string) error { return errors.New("replace failed") }
	defer func() { replaceAtomicFile = previous }()

	if _, err := saveAppSettings(defaultAppSettings()); err == nil {
		t.Fatal("expected replace failure")
	}
	actual, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(actual) != string(original) {
		t.Fatalf("original file changed: %q", actual)
	}
}
