package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetCommunityStatusReadsOnlineState(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", request.Method)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"online":true,"message":"系统正常运行中"}`))
	}))
	defer server.Close()

	original := communityStatusEndpoint
	communityStatusEndpoint = server.URL
	t.Cleanup(func() { communityStatusEndpoint = original })

	status, err := (&AppService{}).GetCommunityStatus(context.Background())
	if err != nil {
		t.Fatalf("GetCommunityStatus() error = %v", err)
	}
	if status.Online == nil || !*status.Online || status.Message != "系统正常运行中" {
		t.Fatalf("GetCommunityStatus() = %#v", status)
	}
}

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

func TestSendContactPostsMultipartPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", request.Method)
		}
		if err := request.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		if request.FormValue("message") != "需要协助" || request.FormValue("messageType") != "报错反馈" {
			t.Fatalf("form = %#v", request.MultipartForm.Value)
		}
		writer.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	original := communityContactEndpoint
	communityContactEndpoint = server.URL
	t.Cleanup(func() { communityContactEndpoint = original })

	result, err := (&AppService{}).SendContact(context.Background(), SendContactRequest{
		Message:     "需要协助",
		MessageType: "报错反馈",
	})
	if err != nil {
		t.Fatalf("SendContact() error = %v", err)
	}
	if result["message"] != "消息已发送" {
		t.Fatalf("SendContact() = %#v", result)
	}
}
