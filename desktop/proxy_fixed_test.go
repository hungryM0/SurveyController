package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/SurveyController/SurveyController/packages/surveycore"
)

func TestAppServiceTestFixedProxyUsesRealHealthCheck(t *testing.T) {
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.String() != "http://target.test/health" {
			t.Fatalf("proxy target = %q", r.URL.String())
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer proxy.Close()

	state := NewAppService().TestFixedProxy(context.Background(), TestFixedProxyRequest{
		Address:   proxy.URL,
		TargetURL: "http://target.test/health",
	})
	if !state.Success || state.Message != "检测通过" || state.StatusCode != http.StatusNoContent {
		t.Fatalf("state = %#v", state)
	}
	if state.Address != strings.TrimPrefix(proxy.URL, "http://") {
		t.Fatalf("masked address = %q", state.Address)
	}
}

func TestAppServiceTestFixedProxyReportsFailure(t *testing.T) {
	state := NewAppService().TestFixedProxy(context.Background(), TestFixedProxyRequest{Address: ""})
	if state.Success || state.Message != "固定代理地址不能为空" {
		t.Fatalf("state = %#v", state)
	}
	state = NewAppService().TestFixedProxy(context.Background(), TestFixedProxyRequest{Address: "ftp://proxy.example:8080"})
	if state.Success || !strings.Contains(state.Message, "HTTP 或 HTTPS") {
		t.Fatalf("unsupported scheme state = %#v", state)
	}
}

func TestAppServiceProxyRuntimeUsesFixedProxyForEveryLease(t *testing.T) {
	service := newTestAppService()
	document := testConfigDocument("https://www.wjx.cn/vm/demo.aspx", surveycore.ProviderWJX)
	document.Execution.Threads = 2
	document.Network.FixedProxyAddress = "127.0.0.1:8080"

	options, err := service.proxy.executionOptions(context.Background(), document)
	if err != nil {
		t.Fatal(err)
	}
	if !options.UseRandomIP || options.LeaseManager == nil {
		t.Fatalf("options = %#v", options)
	}
	first, err := options.LeaseManager.Acquire(context.Background(), "worker-1")
	if err != nil {
		t.Fatal(err)
	}
	second, err := options.LeaseManager.Acquire(context.Background(), "worker-2")
	if err != nil {
		t.Fatal(err)
	}
	if first.Address != "http://127.0.0.1:8080" || second.Address != first.Address || first.Source != "fixed" || second.Source != "fixed" {
		t.Fatalf("leases = %#v, %#v", first, second)
	}
	status := service.GetProxyStatus()
	if status.Source != "fixed" || status.Available != 1 || !strings.Contains(status.Message, "固定代理") {
		t.Fatalf("status = %#v", status)
	}
}

func TestFixedProxyLeaseManagerRejectsUnsupportedScheme(t *testing.T) {
	if _, err := fixedProxyLeaseManager("ftp://proxy.example:8080"); err == nil || !strings.Contains(err.Error(), "HTTP 或 HTTPS") {
		t.Fatalf("ftp proxy error = %v", err)
	}
}
