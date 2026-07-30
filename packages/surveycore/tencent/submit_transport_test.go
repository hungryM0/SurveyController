package tencent

import (
	"context"
	"strings"
	"testing"
)

type jsonDoerFunc func(ctx context.Context, method string, url string, headers map[string]string, body any, out any) error

func (f jsonDoerFunc) DoJSON(ctx context.Context, method string, url string, headers map[string]string, body any, out any) error {
	return f(ctx, method, url, headers, body, out)
}

func TestSubmitAnswersRequiresAnswerHash(t *testing.T) {
	runner := Runner{HTTP: jsonDoerFunc(func(_ context.Context, _ string, _ string, _ map[string]string, _ any, out any) error {
		payload := out.(*apiEnvelope)
		*payload = apiEnvelope{Code: "OK", Data: map[string]any{"ok": true}}
		return nil
	})}

	err := runner.submitAnswers(context.Background(), nil, "123", "hash", "https://wj.qq.com/s2/123/hash/", "", map[string]any{})
	if err == nil || !strings.Contains(err.Error(), "answer_hash") {
		t.Fatalf("err = %v", err)
	}
}

func TestConfirmSubmitRejectsUnchangedAnswerID(t *testing.T) {
	calls := 0
	runner := Runner{HTTP: jsonDoerFunc(func(_ context.Context, _ string, _ string, _ map[string]string, _ any, out any) error {
		calls++
		payload := out.(*apiEnvelope)
		*payload = apiEnvelope{Code: "OK", Data: map[string]any{
			"answer_session": map[string]any{"last_submitted_at": 100, "last_answer_id": 42},
		}}
		return nil
	})}
	initial := map[string]any{
		"answer_session": map[string]any{"last_submitted_at": 100, "last_answer_id": 42},
	}

	err := runner.confirmSubmit(context.Background(), "123", "hash", map[string]string{}, "session", initial)
	if err == nil || !strings.Contains(err.Error(), "未确认") {
		t.Fatalf("err = %v", err)
	}
	if calls != 3 {
		t.Fatalf("calls = %d", calls)
	}
}

func TestConfirmSubmitAcceptsChangedAnswerID(t *testing.T) {
	runner := Runner{HTTP: jsonDoerFunc(func(_ context.Context, _ string, _ string, _ map[string]string, _ any, out any) error {
		payload := out.(*apiEnvelope)
		*payload = apiEnvelope{Code: "OK", Data: map[string]any{
			"answer_session": map[string]any{"last_submitted_at": 100, "last_answer_id": 43},
		}}
		return nil
	})}
	initial := map[string]any{
		"answer_session": map[string]any{"last_submitted_at": 100, "last_answer_id": 42},
	}

	if err := runner.confirmSubmit(context.Background(), "123", "hash", map[string]string{}, "session", initial); err != nil {
		t.Fatal(err)
	}
}
