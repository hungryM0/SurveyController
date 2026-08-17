package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var (
	communityContactEndpoint = "https://bot.hungrym0.com"
	communityStatusEndpoint  = "https://api-wjx.hungrym0.com/api/status"
	communityUsageEndpoint   = "https://api-wjx.hungrym0.com/ipzan/usage"
)

func (s *AppService) SendContact(ctx context.Context, request SendContactRequest) (map[string]string, error) {
	message := strings.TrimSpace(request.Message)
	if message == "" {
		return nil, fmt.Errorf("消息内容不能为空")
	}

	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	fields := map[string]string{
		"message":     message,
		"messageType": strings.TrimSpace(request.MessageType),
		"timestamp":   time.Now().Format(time.RFC3339),
		"email":       strings.TrimSpace(request.Email),
	}
	if title := strings.TrimSpace(request.IssueTitle); title != "" {
		fields["issueTitle"] = title
	}
	for key, value := range fields {
		if err := form.WriteField(key, value); err != nil {
			return nil, fmt.Errorf("构造联系请求: %w", err)
		}
	}
	if err := form.Close(); err != nil {
		return nil, fmt.Errorf("关闭联系请求: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, communityContactEndpoint, &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("User-Agent", "SurveyController")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("联系服务返回 %d", response.StatusCode)
	}
	return map[string]string{"message": "消息已发送"}, nil
}

func (s *AppService) GetCommunityStatus(ctx context.Context) (CommunityStatus, error) {
	var payload map[string]any
	if err := communityJSONGet(ctx, communityStatusEndpoint, &payload); err != nil {
		return CommunityStatus{}, err
	}
	status := CommunityStatus{Message: strings.TrimSpace(stringValue(payload["message"]))}
	if online, ok := payload["online"].(bool); ok {
		status.Online = &online
	}
	if status.Message == "" {
		status.Message = "状态未知"
	}
	return status, nil
}

func (s *AppService) GetIPUsageSummary(ctx context.Context) (IPUsageSummary, error) {
	var payload any
	if err := communityJSONGet(ctx, communityUsageEndpoint, &payload); err != nil {
		return IPUsageSummary{}, err
	}
	result := IPUsageSummary{Records: extractIPUsageRecords(payload)}
	if remaining, ok := extractRemainingIP(payload); ok {
		result.RemainingIP = &remaining
	}
	return result, nil
}

func communityJSONGet(ctx context.Context, endpoint string, target any) error {
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "SurveyController")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("服务返回 %d", response.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(target); err != nil {
		return err
	}
	return nil
}

func extractIPUsageRecords(payload any) []IPUsageRecord {
	for _, candidate := range usageRecordCandidates(payload) {
		if len(candidate) == 0 {
			continue
		}
		result := make([]IPUsageRecord, 0, len(candidate))
		for _, item := range candidate {
			label := strings.TrimSpace(stringValue(item["label"]))
			if label == "" {
				label = strings.TrimSpace(stringValue(item["date"]))
			}
			total, ok := integerValue(item["total"])
			if !ok {
				total, ok = integerValue(item["count"])
			}
			if label == "" || !ok {
				continue
			}
			result = append(result, IPUsageRecord{Label: label, Total: communityMaxInt(0, total)})
		}
		if len(result) > 0 {
			return result
		}
	}
	return nil
}

func usageRecordCandidates(payload any) [][]map[string]any {
	var result [][]map[string]any
	var visit func(any)
	visit = func(value any) {
		switch typed := value.(type) {
		case []any:
			items := make([]map[string]any, 0, len(typed))
			for _, item := range typed {
				if object, ok := item.(map[string]any); ok {
					items = append(items, object)
				}
			}
			if len(items) > 0 {
				result = append(result, items)
			}
			for _, item := range typed {
				visit(item)
			}
		case map[string]any:
			for _, key := range []string{"records", "history", "items", "list"} {
				if nested, ok := typed[key]; ok {
					visit(nested)
				}
			}
			for _, item := range typed {
				visit(item)
			}
		}
	}
	visit(payload)
	return result
}

func extractRemainingIP(payload any) (int, bool) {
	switch typed := payload.(type) {
	case map[string]any:
		for _, key := range []string{"remaining_ip", "remainingIp", "ip_remaining", "remaining"} {
			if value, ok := integerValue(typed[key]); ok {
				return communityMaxInt(0, value), true
			}
		}
		for _, value := range typed {
			if result, ok := extractRemainingIP(value); ok {
				return result, true
			}
		}
	case []any:
		for _, value := range typed {
			if result, ok := extractRemainingIP(value); ok {
				return result, true
			}
		}
	}
	return 0, false
}

func integerValue(value any) (int, bool) {
	switch typed := value.(type) {
	case float64:
		return integerFromFloat(typed)
	case json.Number:
		parsed, err := strconv.ParseFloat(string(typed), 64)
		if err != nil {
			return 0, false
		}
		return integerFromFloat(parsed)
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		if err != nil {
			return 0, false
		}
		return integerFromFloat(parsed)
	default:
		return 0, false
	}
}

func integerFromFloat(value float64) (int, bool) {
	maximum := int(^uint(0) >> 1)
	minimum := -maximum - 1
	if math.IsNaN(value) || math.IsInf(value, 0) || value > float64(maximum) || value < float64(minimum) {
		return 0, false
	}
	return int(value), true
}

func stringValue(value any) string {
	if value == nil {
		return ""
	}
	return fmt.Sprint(value)
}

func communityMaxInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}
