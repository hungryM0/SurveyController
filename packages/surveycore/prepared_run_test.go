package surveycore

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestRunWJXPreparesSurveyOnce(t *testing.T) {
	var parseCalls atomic.Int32
	var submitCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/vm/demo.aspx":
			parseCalls.Add(1)
			_, _ = w.Write([]byte(`<html><head><title>测试 - 问卷星</title></head><body><div id="divQuestion"><fieldset><div topic="1" id="div1" type="3"><div class="topichtml">1. 单选</div><div class="ui-controlgroup"><div><span class="label">A</span></div><div><span class="label">B</span></div></div></div></fieldset></div></body></html>`))
		case "/joinnew/processjq.ashx":
			submitCalls.Add(1)
			_, _ = w.Write([]byte("10"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	cfg := &RunRequest{SurveySource: SurveySource{URL: "https://www.wjx.cn/vm/demo.aspx", Provider: ProviderWJX}, ExecutionPlan: ExecutionPlan{Target: 3, Threads: 3}}
	result, err := New(WithHTTPClient(rewriteWJXHTTPClient(server.URL))).Run(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if result.Success != 3 || parseCalls.Load() != 1 || submitCalls.Load() != 3 {
		t.Fatalf("result=%#v parse=%d submit=%d", result, parseCalls.Load(), submitCalls.Load())
	}
}

func TestRunCredamoPreparesSurveyOnce(t *testing.T) {
	var detailCalls atomic.Int32
	var initCalls atomic.Int32
	var submitCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/survey/noauth/detail/get/demoano":
			detailCalls.Add(1)
			writeTestJSON(t, w, map[string]any{"success": true, "data": map[string]any{
				"surveyTitle": "见数测试",
				"questions":   []map[string]any{{"qstNo": "Q1", "qstTitle": "单选题", "questionType": 2, "selector": 1, "qstId": 101, "choices": []map[string]any{{"choiceId": 1, "display": "A"}, {"choiceId": 2, "display": "B"}}}},
			}})
		case "/v1/survey/answer/noauth/init/demoano":
			initCalls.Add(1)
			writeTestJSON(t, w, map[string]any{"success": true, "data": map[string]any{"answerToken": "token", "timestamp": 1700000000000}})
		case "/v1/survey/answer/noauth/save":
			submitCalls.Add(1)
			writeTestJSON(t, w, map[string]any{"success": true, "data": map[string]any{"ok": true}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	cfg := &RunRequest{SurveySource: SurveySource{URL: server.URL + "/s/demo_", Provider: ProviderCredamo}, ExecutionPlan: ExecutionPlan{Target: 3, Threads: 3}}
	result, err := New().Run(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if result.Success != 3 || detailCalls.Load() != 1 || initCalls.Load() != 3 || submitCalls.Load() != 3 {
		t.Fatalf("result=%#v detail=%d init=%d submit=%d", result, detailCalls.Load(), initCalls.Load(), submitCalls.Load())
	}
}

func TestRunTencentPreparesQuestionsOnceAndKeepsSessionPerSubmission(t *testing.T) {
	var questionCalls atomic.Int32
	var sessionCalls atomic.Int32
	var submitCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v2/respondent/surveys/123/questions":
			questionCalls.Add(1)
			writeTestJSON(t, w, map[string]any{"code": "OK", "data": map[string]any{"questions": []map[string]any{
				{"id": "q1", "type": "radio", "title": "单选", "page_id": "p1", "page": 1, "options": []map[string]any{{"id": "a", "text": "A"}, {"id": "b", "text": "B"}}},
			}}})
		case "/api/v2/respondent/surveys/123/session":
			sessionCalls.Add(1)
			writeTestJSON(t, w, map[string]any{"code": "OK", "data": map[string]any{}})
		case "/api/v2/respondent/surveys/123/answers":
			submitCalls.Add(1)
			writeTestJSON(t, w, map[string]any{"code": "OK", "data": map[string]any{"answer_hash": "hash-ok"}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	cfg := &RunRequest{SurveySource: SurveySource{URL: "https://wj.qq.com/s2/123/hashvalue/", Provider: ProviderQQ}, ExecutionPlan: ExecutionPlan{Target: 3, Threads: 3}}
	result, err := New(WithHTTPClient(rewriteTencentHTTPClient(server.URL))).Run(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if result.Success != 3 || questionCalls.Load() != 1 || sessionCalls.Load() != 3 || submitCalls.Load() != 3 {
		t.Fatalf("result=%#v questions=%d sessions=%d submit=%d", result, questionCalls.Load(), sessionCalls.Load(), submitCalls.Load())
	}
}
