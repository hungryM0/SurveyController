package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type ipUsageStore struct {
	mu   sync.Mutex
	path string
}

func newIPUsageStore() *ipUsageStore {
	return &ipUsageStore{
		path: filepath.Join(userConfigRoot(), "ip_usage.json"),
	}
}

func (s *ipUsageStore) add(now time.Time, delta int) {
	if delta <= 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	file := s.loadLocked()
	if file.Records == nil {
		file.Records = map[string]int{}
	}
	key := now.Local().Format("2006-01-02")
	file.Records[key] += delta
	_ = s.saveLocked(file)
}

func (s *ipUsageStore) snapshot() []IPUsageRecord {
	s.mu.Lock()
	defer s.mu.Unlock()

	file := s.loadLocked()
	if len(file.Records) == 0 {
		return nil
	}
	keys := make([]string, 0, len(file.Records))
	for key := range file.Records {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	records := make([]IPUsageRecord, 0, len(keys))
	for _, key := range keys {
		records = append(records, IPUsageRecord{
			Label: key,
			Total: file.Records[key],
		})
	}
	return records
}

type ipUsageFile struct {
	Records map[string]int `json:"records"`
}

func (s *ipUsageStore) loadLocked() ipUsageFile {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return ipUsageFile{Records: map[string]int{}}
	}
	var file ipUsageFile
	if err := json.Unmarshal(data, &file); err != nil {
		return ipUsageFile{Records: map[string]int{}}
	}
	if file.Records == nil {
		file.Records = map[string]int{}
	}
	return file
}

func (s *ipUsageStore) saveLocked(file ipUsageFile) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, append(data, '\n'), 0o644)
}
