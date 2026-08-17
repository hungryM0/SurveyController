package surveycore

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

func TestResolveAIEndpointHandlesExplicitAndLegacyURLs(t *testing.T) {
	protocol, endpoint, explicit, err := resolveAIEndpoint(" https://example.com/v1/chat/completions/ ", "auto")
	if err != nil {
		t.Fatal(err)
	}
	if protocol != aiProtocolChat || endpoint != "https://example.com/v1/chat/completions" || !explicit {
		t.Fatalf("endpoint = %q %q %v", protocol, endpoint, explicit)
	}
	protocol, endpoint, explicit, err = resolveAIEndpoint("https://example.com/v1", "Responses")
	if err != nil {
		t.Fatal(err)
	}
	if protocol != aiProtocolResponses || endpoint != "https://example.com/v1/responses" || explicit {
		t.Fatalf("endpoint = %q %q %v", protocol, endpoint, explicit)
	}
	if _, _, _, err := resolveAIEndpoint("https://example.com/v1/completions", "auto"); err == nil || !strings.Contains(err.Error(), "/completions") {
		t.Fatalf("legacy err = %v", err)
	}
}

func TestDoAIJSONSanitizesNon2xxResponse(t *testing.T) {
	const apiKey = "test-ai-key-7f3c"
	const responseToken = "response-token-4b8d"
	responseBody := `{"message":"upstream rejected request","authorization":"Bearer ` + apiKey + `","api_key":"` + apiKey + `","token":"` + responseToken + `"}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(responseBody))
	}))
	defer server.Close()

	client := New(WithHTTPClient(server.Client()))
	err := client.doAIJSON(
		context.Background(),
		http.MethodPost,
		server.URL+"/v1/responses?api_key="+apiKey,
		map[string]string{"Authorization": "Bearer " + apiKey},
		map[string]string{"prompt": "test"},
		&map[string]any{},
	)
	if err == nil {
		t.Fatal("expected non-2xx error")
	}
	message := err.Error()
	if !strings.Contains(message, "http 401") || !strings.Contains(message, "upstream rejected request") {
		t.Fatal("status code or safe response message was lost")
	}
	for _, secret := range []string{apiKey, responseToken, "Bearer " + apiKey} {
		if strings.Contains(message, secret) {
			t.Fatal("AI error exposed a credential")
		}
	}
}

type aiRoundTripperFunc func(*http.Request) (*http.Response, error)

func (fn aiRoundTripperFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestDoAIJSONSanitizesTransportError(t *testing.T) {
	const apiKey = "test-transport-key-9a2e"
	client := New(WithHTTPClient(&http.Client{
		Transport: aiRoundTripperFunc(func(_ *http.Request) (*http.Response, error) {
			return nil, errors.New("upstream unavailable; Authorization: Bearer " + apiKey + "; api_key=" + apiKey)
		}),
	}))

	err := client.doAIJSON(
		context.Background(),
		http.MethodPost,
		"https://example.invalid/v1/responses?api_key="+apiKey,
		map[string]string{"Authorization": "Bearer " + apiKey},
		map[string]string{"prompt": "test"},
		&map[string]any{},
	)
	if err == nil {
		t.Fatal("expected transport error")
	}
	message := err.Error()
	if !strings.Contains(message, "upstream unavailable") {
		t.Fatal("safe transport message was lost")
	}
	if strings.Contains(message, apiKey) || strings.Contains(message, "Bearer "+apiKey) {
		t.Fatal("transport error exposed a credential")
	}
}

func TestProviderAIReadsChatCompletionContentParts(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload["model"] != "demo-model" {
			t.Fatalf("payload = %#v", payload)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{
				"message": map[string]any{
					"content": []map[string]any{
						{"type": "text", "text": "第一句"},
						{"type": "output_text", "text": "第二句"},
					},
				},
			}},
		})
	}))
	defer server.Close()

	client := New()
	answers, err := client.callProviderAI(context.Background(), model.AIProfile{
		Mode: "provider", Provider: "custom", APIKey: "test-key", BaseURL: server.URL + "/v1/chat/completions", Model: "demo-model", APIProtocol: "auto",
	}, nil, AITextRequest{QuestionNum: 1, Title: "问题", BlankCount: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(answers) != 1 || answers[0] != "第一句\n第二句" {
		t.Fatalf("answers = %#v", answers)
	}
}

func TestProviderAIAutoFallsBackToResponsesOnEndpointMismatch(t *testing.T) {
	paths := make([]string, 0, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if r.URL.Path == "/v1/chat/completions" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"output_text": "回退成功"})
	}))
	defer server.Close()

	client := New()
	answers, err := client.callProviderAI(context.Background(), model.AIProfile{
		Mode: "provider", Provider: "custom", APIKey: "test-key", BaseURL: server.URL + "/v1", Model: "demo-model", APIProtocol: "auto",
	}, nil, AITextRequest{QuestionNum: 1, Title: "问题", BlankCount: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(answers) != 1 || answers[0] != "回退成功" {
		t.Fatalf("answers = %#v", answers)
	}
	if len(paths) != 2 || paths[0] != "/v1/chat/completions" || paths[1] != "/v1/responses" {
		t.Fatalf("paths = %#v", paths)
	}
}

func TestProviderAICustomRequiresBaseURLAndModel(t *testing.T) {
	client := New()
	_, err := client.callProviderAI(context.Background(), model.AIProfile{
		Mode: "provider", Provider: "custom", APIKey: "test-key", Model: "demo-model",
	}, nil, AITextRequest{QuestionNum: 1, Title: "问题", BlankCount: 1})
	if err == nil || !strings.Contains(err.Error(), "Base URL") {
		t.Fatalf("err = %v", err)
	}
	_, err = client.callProviderAI(context.Background(), model.AIProfile{
		Mode: "provider", Provider: "custom", APIKey: "test-key", BaseURL: "https://example.com/v1",
	}, nil, AITextRequest{QuestionNum: 1, Title: "问题", BlankCount: 1})
	if err == nil || !strings.Contains(err.Error(), "模型") {
		t.Fatalf("err = %v", err)
	}
}

func TestDefaultAISystemPromptMatchesModes(t *testing.T) {
	freePrompt := defaultAISystemPromptForMode("free")
	providerPrompt := defaultAISystemPromptForMode("provider")
	if !strings.Contains(freePrompt, "不是AI助手") || strings.Contains(freePrompt, "|| 分隔") {
		t.Fatalf("free prompt = %q", freePrompt)
	}
	if !strings.Contains(providerPrompt, "|| 分隔") {
		t.Fatalf("provider prompt = %q", providerPrompt)
	}
}

func TestTestAIConnectionReturnsPreview(t *testing.T) {
	client := New(WithAITextResolver(AITextResolverFunc(func(_ context.Context, _ model.AIProfile, _ *model.Persona, request AITextRequest) ([]string, error) {
		if request.BlankCount != 1 || !strings.Contains(request.Title, "连接成功") {
			t.Fatalf("request = %#v", request)
		}
		return []string{"连接成功"}, nil
	})))

	message, err := client.TestAIConnection(context.Background(), model.AIProfile{Mode: "provider"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(message, "连接成功！AI 回复: 连接成功") {
		t.Fatalf("message = %q", message)
	}
}
