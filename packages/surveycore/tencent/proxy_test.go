package tencent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

func TestSubmitAnswersUsesActiveProxy(t *testing.T) {
	var connects atomic.Int32
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodConnect {
			t.Fatalf("method = %s url = %s", r.Method, r.URL.String())
		}
		connects.Add(1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer proxy.Close()

	request := &model.SubmissionRequest{Context: model.SubmissionContext{ProxyAddress: proxy.URL}}
	err := (Runner{}).submitAnswers(context.Background(), request, "123", "hash", "https://wj.qq.com/s2/123/hash/", "session", map[string]any{
		"answer_survey": map[string]any{"pages": []any{}},
	})
	if err == nil {
		t.Fatal("expected proxy CONNECT failure")
	}
	if connects.Load() != 1 {
		t.Fatalf("proxy connects = %d", connects.Load())
	}
}
