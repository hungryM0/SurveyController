package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	proxycore "github.com/SurveyController/SurveyCore/pkg/surveycore/proxy"
)

func TestCustomProxyAPITestState(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeAppJSON(t, w, map[string]any{"data": []string{"user:pass@1.2.3.4:9000"}})
	}))
	defer server.Close()

	state := testCustomProxyAPI(context.Background(), server.URL)
	if !state.Success || state.Message != "检测通过" {
		t.Fatalf("state = %#v", state)
	}
	if len(state.Proxies) != 1 || state.Proxies[0] != "1.2.3.4:9000" {
		t.Fatalf("proxies = %#v", state.Proxies)
	}
}

func TestCustomProxyAPITestRejectsInvalidInput(t *testing.T) {
	if state := testCustomProxyAPI(context.Background(), ""); state.Success || state.Message != "API地址不能为空" {
		t.Fatalf("empty state = %#v", state)
	}
	if state := testCustomProxyAPI(context.Background(), "ftp://example.test"); state.Success || state.Message == "" {
		t.Fatalf("scheme state = %#v", state)
	}
}

func TestAppServiceTestCustomProxyAPI(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeAppJSON(t, w, map[string]any{"data": []string{"1.2.3.4:9000"}})
	}))
	defer server.Close()

	service := NewAppService()
	state := service.TestCustomProxyAPI(context.Background(), TestCustomProxyAPIRequest{URL: server.URL})
	if !state.Success || len(state.Proxies) != 1 {
		t.Fatalf("state = %#v", state)
	}
	status := service.GetProxyStatus()
	if status.Source != proxycore.DefaultCustomProxySource || status.Available != 1 || status.Message != "自定义代理已连接" {
		t.Fatalf("success status = %#v", status)
	}

	state = service.TestCustomProxyAPI(context.Background(), TestCustomProxyAPIRequest{})
	if state.Success || state.Message != "API地址不能为空" {
		t.Fatalf("failure state = %#v", state)
	}
	status = service.GetProxyStatus()
	if status.Source != proxycore.DefaultCustomProxySource || status.Available != 0 || status.InUse != 0 || status.Message != "API地址不能为空" {
		t.Fatalf("failure status = %#v", status)
	}
}
