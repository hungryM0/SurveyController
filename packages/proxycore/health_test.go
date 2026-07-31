package proxycore

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCheckProxyHealthUsesProxyAndTarget(t *testing.T) {
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.String() != "http://target.example/health" {
			t.Fatalf("proxy request URL = %q", r.URL.String())
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer proxy.Close()

	result := CheckProxyHealth(context.Background(), ProxyLease{Address: proxy.URL}, HealthCheckOptions{
		TargetURL: "http://target.example/health",
		Timeout:   time.Second,
	})
	if !result.OK || result.StatusCode != http.StatusNoContent || result.Duration <= 0 {
		t.Fatalf("result = %#v", result)
	}
}

func TestCheckProxyHealthReportsBadStatusAndBadLease(t *testing.T) {
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer proxy.Close()

	result := CheckProxyHealth(context.Background(), ProxyLease{Address: proxy.URL}, HealthCheckOptions{
		TargetURL: "http://target.example/health",
		Timeout:   time.Second,
	})
	if result.OK || result.StatusCode != http.StatusInternalServerError || result.Error == "" {
		t.Fatalf("bad status result = %#v", result)
	}

	result = CheckProxyHealth(context.Background(), ProxyLease{}, HealthCheckOptions{})
	if result.OK || result.Error == "" {
		t.Fatalf("bad lease result = %#v", result)
	}
}

func TestNormalizeHTTPProxyAddressRejectsUnsupportedSchemes(t *testing.T) {
	if normalized, ok := NormalizeHTTPProxyAddress("127.0.0.1:8080"); !ok || normalized != "http://127.0.0.1:8080" {
		t.Fatalf("normalized = %q, ok = %v", normalized, ok)
	}
	if _, ok := NormalizeHTTPProxyAddress("ftp://127.0.0.1:8080"); ok {
		t.Fatal("ftp proxy address should be rejected")
	}
}
