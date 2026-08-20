package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestMain(m *testing.M) {
	root, err := os.MkdirTemp("", "surveycontroller-desktop-test-")
	if err != nil {
		fmt.Fprintf(os.Stderr, "create desktop test root: %v\n", err)
		os.Exit(1)
	}

	if err := os.Setenv("SURVEYCONTROLLER_CONFIG_HOME", filepath.Join(root, "config")); err != nil {
		fmt.Fprintf(os.Stderr, "set desktop test config root: %v\n", err)
		_ = os.RemoveAll(root)
		os.Exit(1)
	}
	if err := os.Setenv("SURVEYCONTROLLER_LOCAL_DATA_HOME", filepath.Join(root, "local")); err != nil {
		fmt.Fprintf(os.Stderr, "set desktop test local data root: %v\n", err)
		_ = os.RemoveAll(root)
		os.Exit(1)
	}

	exitCode := m.Run()
	if err := os.RemoveAll(root); err != nil {
		fmt.Fprintf(os.Stderr, "remove desktop test root: %v\n", err)
		if exitCode == 0 {
			exitCode = 1
		}
	}
	os.Exit(exitCode)
}
