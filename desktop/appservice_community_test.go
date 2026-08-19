package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetIPUsageSummaryNormalizesNestedNumericStrings(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", request.Method)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"data":{"remaining_ip":"7.0","records":[{"label":"2026-08-16","total":"2.0"}]}}`))
	}))
	defer server.Close()

	original := communityUsageEndpoint
	communityUsageEndpoint = server.URL
	t.Cleanup(func() { communityUsageEndpoint = original })

	summary, err := (&AppService{}).GetIPUsageSummary(context.Background())
	if err != nil {
		t.Fatalf("GetIPUsageSummary() error = %v", err)
	}
	if summary.RemainingIP == nil || *summary.RemainingIP != 7 {
		t.Fatalf("remaining IP = %#v, want 7", summary.RemainingIP)
	}
	if len(summary.Records) != 1 || summary.Records[0] != (IPUsageRecord{Label: "2026-08-16", Total: 2}) {
		t.Fatalf("records = %#v", summary.Records)
	}
}
