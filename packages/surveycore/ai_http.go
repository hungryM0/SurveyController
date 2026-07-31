package surveycore

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	aiSensitiveFieldPattern = regexp.MustCompile(`(?i)(\b(?:authorization|proxy-authorization|api[\s_-]*key|openai[\s_-]*api[\s_-]*key|access[\s_-]*token|refresh[\s_-]*token|client[\s_-]*secret|password|secret|token|key)\b\s*["']?\s*[:=]\s*["']?)[^,;\}\"'\r\n&]+`)
	aiBearerPattern         = regexp.MustCompile(`(?i)(\bbearer\s+)[^\s,;\}\"']+`)
	aiQuerySensitivePattern = regexp.MustCompile(`(?i)([?&](?:api[\s_-]*key|apikey|authorization|access[\s_-]*token|refresh[\s_-]*token|token)=)[^&#\s\"']+`)
)

func (c *Client) doAIJSON(ctx context.Context, method string, endpoint string, headers map[string]string, body any, out any) error {
	client := http.DefaultClient
	if c != nil && c.httpClient.Client != nil {
		client = c.httpClient.Client
	}
	sensitiveValues := collectAISensitiveValues(endpoint, headers)
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("AI 请求数据编码失败：%s", sanitizeAIErrorText(err.Error(), sensitiveValues))
	}
	reqCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(reqCtx, method, endpoint, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("AI 请求创建失败：%s", sanitizeAIErrorText(err.Error(), sensitiveValues))
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("AI 网络请求失败：%s", sanitizeAIErrorText(err.Error(), sensitiveValues))
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return fmt.Errorf("AI 响应读取失败：%s", sanitizeAIErrorText(err.Error(), sensitiveValues))
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("AI 请求失败：http %d: %s", response.StatusCode, sanitizeAIErrorText(string(responseBody), sensitiveValues))
	}
	if err := json.Unmarshal(responseBody, out); err != nil {
		return fmt.Errorf("AI 响应解析失败：%s", sanitizeAIErrorText(err.Error(), sensitiveValues))
	}
	return nil
}

func collectAISensitiveValues(endpoint string, headers map[string]string) []string {
	values := make([]string, 0, len(headers)+2)
	for name, value := range headers {
		if isAISensitiveName(name) {
			values = append(values, value)
		}
	}
	if parsed, err := url.Parse(endpoint); err == nil {
		if parsed.User != nil {
			if password, ok := parsed.User.Password(); ok {
				values = append(values, password)
			}
		}
		for name, queryValues := range parsed.Query() {
			if isAISensitiveName(name) {
				values = append(values, queryValues...)
			}
		}
	}
	return uniqueAISensitiveValues(values)
}

func isAISensitiveName(value string) bool {
	compact := strings.ToLower(strings.NewReplacer("-", "", "_", "", " ", "").Replace(value))
	return compact == "authorization" ||
		compact == "proxyauthorization" ||
		strings.Contains(compact, "apikey") ||
		strings.Contains(compact, "accesstoken") ||
		strings.Contains(compact, "refreshtoken") ||
		strings.HasSuffix(compact, "token") ||
		strings.HasSuffix(compact, "secret") ||
		compact == "password"
}

func uniqueAISensitiveValues(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	unique := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		unique = append(unique, value)
	}
	return unique
}

func sanitizeAIErrorText(raw string, sensitiveValues []string) string {
	message := strings.TrimSpace(raw)
	if message == "" {
		return "未提供安全错误消息"
	}
	variants := make([]string, 0, len(sensitiveValues)*4)
	for _, value := range sensitiveValues {
		variants = append(variants, aiSensitiveValueVariants(value)...)
	}
	variants = uniqueAISensitiveValues(variants)
	sort.SliceStable(variants, func(left int, right int) bool {
		return len(variants[left]) > len(variants[right])
	})
	for _, value := range variants {
		message = strings.ReplaceAll(message, value, "[REDACTED]")
	}
	message = aiQuerySensitivePattern.ReplaceAllString(message, "$1[REDACTED]")
	message = aiSensitiveFieldPattern.ReplaceAllString(message, "$1[REDACTED]")
	message = aiBearerPattern.ReplaceAllString(message, "$1[REDACTED]")
	return strings.TrimSpace(message)
}

func aiSensitiveValueVariants(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	variants := []string{value}
	if lower := strings.ToLower(value); lower != "bearer" && lower != "basic" && lower != "token" {
		if strings.HasPrefix(lower, "bearer ") {
			variants = append(variants, strings.TrimSpace(value[len("Bearer "):]))
		}
	}
	if decoded, err := url.QueryUnescape(value); err == nil {
		variants = append(variants, decoded)
	}
	variants = append(variants, url.QueryEscape(value), url.PathEscape(value))
	return uniqueAISensitiveValues(variants)
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
