package surveycore

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

func (c *Client) doAIJSON(ctx context.Context, method string, endpoint string, headers map[string]string, body any, out any) error {
	client := http.DefaultClient
	if c != nil && c.httpClient.Client != nil {
		client = c.httpClient.Client
	}
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	reqCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(reqCtx, method, endpoint, bytes.NewReader(data))
	if err != nil {
		return err
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("AI 请求失败：http %d: %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
	}
	return json.Unmarshal(responseBody, out)
}

func endpointWithSuffix(baseURL string, suffix string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(strings.ToLower(base), suffix) {
		return base
	}
	return base + suffix
}

func resolveAIEndpoint(baseURL string, protocol string) (string, string, bool, error) {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		return "", "", false, fmt.Errorf("AI 配置不完整：缺少 Base URL")
	}
	lower := strings.ToLower(base)
	if strings.HasSuffix(lower, chatCompletionsSuffix) {
		return aiProtocolChat, base, true, nil
	}
	if strings.HasSuffix(lower, responsesSuffix) {
		return aiProtocolResponses, base, true, nil
	}
	if strings.HasSuffix(lower, legacyCompletions) {
		return "", "", false, fmt.Errorf("暂不支持旧版 /completions 协议，请改用 /chat/completions 或 /responses")
	}
	if normalizeAIAPIProtocol(protocol) == aiProtocolResponses {
		return aiProtocolResponses, endpointWithSuffix(base, responsesSuffix), false, nil
	}
	return aiProtocolChat, endpointWithSuffix(base, chatCompletionsSuffix), false, nil
}

func normalizeAIAPIProtocol(protocol string) string {
	switch strings.ToLower(strings.TrimSpace(protocol)) {
	case aiProtocolChat:
		return aiProtocolChat
	case aiProtocolResponses:
		return aiProtocolResponses
	default:
		return aiProtocolAuto
	}
}

func isEndpointMismatchError(err error) bool {
	message := strings.ToLower(strings.TrimSpace(fmt.Sprint(err)))
	for _, marker := range []string{
		"404", "405", "410", "not found", "no route", "no handler",
		"unsupported path", "invalid url", "method not allowed",
	} {
		if strings.Contains(message, marker) {
			return true
		}
	}
	return false
}

func extractAITextParts(content any) []string {
	switch value := content.(type) {
	case nil:
		return nil
	case string:
		if text := strings.TrimSpace(value); text != "" {
			return []string{text}
		}
	case []any:
		parts := make([]string, 0, len(value))
		for _, item := range value {
			parts = append(parts, extractAITextParts(item)...)
		}
		return parts
	case map[string]any:
		itemType := strings.ToLower(strings.TrimSpace(aiStringValue(value["type"])))
		text := firstNonEmpty(aiStringValue(value["text"]), aiStringValue(value["content"]))
		if text == "" {
			return nil
		}
		if itemType == "" || itemType == "text" || itemType == "output_text" || itemType == "input_text" {
			return []string{text}
		}
	}
	return nil
}

func aiStringValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	default:
		return fmt.Sprint(typed)
	}
}
