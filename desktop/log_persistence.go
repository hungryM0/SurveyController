package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/SurveyController/SurveyController/packages/surveycore"
)

func runEventLogLine(event surveycore.Event) string {
	worker := strings.TrimSpace(event.Worker)
	if worker == "" {
		worker = "core"
	}
	message := strings.TrimSpace(event.Message)
	if message == "" {
		return ""
	}
	return fmt.Sprintf("[%s] %s", worker, message)
}

func pruneSessionLogFiles(logsDir string, keepCount int) (int, error) {
	if keepCount <= 0 {
		keepCount = 1
	}
	entries, err := os.ReadDir(logsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	type candidate struct {
		path string
		mod  time.Time
	}
	candidates := []candidate{}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasPrefix(name, "session_") || !strings.HasSuffix(name, ".log") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		candidates = append(candidates, candidate{path: filepath.Join(logsDir, name), mod: info.ModTime()})
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].mod.Equal(candidates[j].mod) {
			return candidates[i].path > candidates[j].path
		}
		return candidates[i].mod.After(candidates[j].mod)
	})
	if len(candidates) <= keepCount {
		return 0, nil
	}
	removed := 0
	for _, item := range candidates[keepCount:] {
		if err := os.Remove(item.path); err != nil {
			return removed, err
		}
		removed++
	}
	return removed, nil
}

func userLogsDirectory() string {
	return filepath.Join(userLocalDataRoot(), "logs")
}
