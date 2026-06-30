package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"surveycontroller/surveycore"
)

func autoSaveRunLog(settings AppSettings, events []surveycore.Event, endedAt time.Time) (string, error) {
	logsDir := userLogsDirectory()
	lastPath := filepath.Join(logsDir, "last_session.log")
	if !settings.AutoSaveLogs {
		_ = os.Remove(lastPath)
		return "", nil
	}
	if err := os.MkdirAll(logsDir, 0o755); err != nil {
		return "", err
	}
	if endedAt.IsZero() {
		endedAt = time.Now()
	}
	content := strings.Join(runEventLogLines(events), "\n")
	if content != "" {
		content += "\n"
	}
	sessionPath := filepath.Join(logsDir, fmt.Sprintf("session_%s.log", endedAt.Format("20060102_150405")))
	if err := os.WriteFile(sessionPath, []byte(content), 0o644); err != nil {
		return "", err
	}
	if err := os.WriteFile(lastPath, []byte(content), 0o644); err != nil {
		return "", err
	}
	_, _ = pruneSessionLogFiles(logsDir, settings.AutosaveLogCount)
	return sessionPath, nil
}

func runEventLogLines(events []surveycore.Event) []string {
	lines := make([]string, 0, len(events))
	for _, event := range events {
		worker := strings.TrimSpace(event.Worker)
		if worker == "" {
			worker = "core"
		}
		message := strings.TrimSpace(event.Message)
		if message == "" {
			continue
		}
		lines = append(lines, fmt.Sprintf("[%s] %s", worker, message))
	}
	return lines
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
