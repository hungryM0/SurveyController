package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/SurveyController/SurveyController/packages/surveycore"
)

const runLogBufferSize = 32 * 1024

type runLogSink struct {
	sessionPath string
	lastPath    string
	sessionFile *os.File
	lastFile    *os.File
	session     *bufio.Writer
	last        *bufio.Writer
	keepCount   int
}

func openRunLogSink(settings AppSettings, startedAt time.Time, runID string) (*runLogSink, error) {
	if !settings.AutoSaveLogs {
		return nil, nil
	}
	logsDir := userLogsDirectory()
	if err := os.MkdirAll(logsDir, 0o755); err != nil {
		return nil, fmt.Errorf("创建日志目录: %w", err)
	}
	if startedAt.IsZero() {
		startedAt = time.Now()
	}
	safeRunID := strings.NewReplacer(":", "-", "/", "-", "\\", "-").Replace(runID)
	sessionPath := filepath.Join(logsDir, fmt.Sprintf("session_%s_%s.log", startedAt.Format("20060102_150405.000"), safeRunID))
	lastPath := filepath.Join(logsDir, "last_session.log")
	sessionFile, err := os.OpenFile(sessionPath, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o644)
	if err != nil {
		return nil, fmt.Errorf("创建任务日志: %w", err)
	}
	lastFile, err := os.OpenFile(lastPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		_ = sessionFile.Close()
		_ = os.Remove(sessionPath)
		return nil, fmt.Errorf("创建最近任务日志: %w", err)
	}
	keepCount := settings.AutosaveLogCount
	if keepCount <= 0 {
		keepCount = 1
	}
	return &runLogSink{
		sessionPath: sessionPath,
		lastPath:    lastPath,
		sessionFile: sessionFile,
		lastFile:    lastFile,
		session:     bufio.NewWriterSize(sessionFile, runLogBufferSize),
		last:        bufio.NewWriterSize(lastFile, runLogBufferSize),
		keepCount:   keepCount,
	}, nil
}

func (s *runLogSink) write(event surveycore.Event) error {
	if s == nil {
		return nil
	}
	line := runEventLogLine(event)
	if line == "" {
		return nil
	}
	line += "\n"
	if _, err := s.session.WriteString(line); err != nil {
		return fmt.Errorf("写入任务日志: %w", err)
	}
	if _, err := s.last.WriteString(line); err != nil {
		return fmt.Errorf("写入最近任务日志: %w", err)
	}
	return nil
}

func (s *runLogSink) close() error {
	if s == nil {
		return nil
	}
	var firstErr error
	for _, step := range []func() error{
		s.session.Flush,
		s.last.Flush,
		s.sessionFile.Sync,
		s.lastFile.Sync,
		s.sessionFile.Close,
		s.lastFile.Close,
	} {
		if err := step(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if firstErr != nil {
		return fmt.Errorf("完成任务日志: %w", firstErr)
	}
	if _, err := pruneSessionLogFiles(filepath.Dir(s.sessionPath), s.keepCount); err != nil {
		return fmt.Errorf("清理历史任务日志: %w", err)
	}
	return nil
}
