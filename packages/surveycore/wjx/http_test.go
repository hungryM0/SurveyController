package wjx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

const weChatClientGateHTML = `<html><body><script>document.body.innerHTML = '<h4>请在微信客户端打开链接</h4>';</script></body></html>`

func TestParserRetriesTransientWeChatClientGate(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if requests.Add(1) == 1 {
			_, _ = w.Write([]byte(weChatClientGateHTML))
			return
		}
		_, _ = w.Write([]byte(sampleHTML()))
	}))
	defer server.Close()

	definition, err := (Parser{Client: server.Client()}).Parse(context.Background(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if requests.Load() != 2 || len(definition.Questions) == 0 {
		t.Fatalf("requests = %d, definition = %#v", requests.Load(), definition)
	}
}

func TestParserReportsPersistentWeChatClientGate(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		_, _ = w.Write([]byte(weChatClientGateHTML))
	}))
	defer server.Close()

	_, err := (Parser{Client: server.Client()}).Parse(context.Background(), server.URL)
	if err == nil || !strings.Contains(err.Error(), "只允许在微信客户端打开") {
		t.Fatalf("err = %v", err)
	}
	if requests.Load() != maxHTMLFetchAttempts {
		t.Fatalf("requests = %d", requests.Load())
	}
}
