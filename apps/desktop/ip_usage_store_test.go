package main

import (
	"testing"
	"time"
)

func TestIPUsageStoreSnapshotPersistsSorted(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())

	store := newIPUsageStore()
	store.add(time.Date(2026, 6, 30, 10, 0, 0, 0, time.Local), 2)
	store.add(time.Date(2026, 6, 29, 10, 0, 0, 0, time.Local), 1)
	store.add(time.Date(2026, 6, 30, 12, 0, 0, 0, time.Local), 3)

	records := store.snapshot()
	if len(records) != 2 {
		t.Fatalf("records = %#v", records)
	}
	if records[0].Label != "2026-06-29" || records[0].Total != 1 {
		t.Fatalf("first record = %#v", records[0])
	}
	if records[1].Label != "2026-06-30" || records[1].Total != 5 {
		t.Fatalf("second record = %#v", records[1])
	}
}

func TestAppServiceGetIPUsageSummaryUsesUsageStore(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())

	service := NewAppService()
	service.proxyRuntime().usage.add(time.Date(2026, 6, 30, 10, 0, 0, 0, time.Local), 4)

	summary := service.GetIPUsageSummary()
	if summary.Source == "" {
		t.Fatal("summary source is empty")
	}
	if len(summary.Records) != 1 || summary.Records[0].Total != 4 {
		t.Fatalf("summary = %#v", summary)
	}
}
