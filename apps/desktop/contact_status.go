package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

const defaultContactStatusURL = "https://api-wjx.hungrym0.com/api/status"

func contactStatusURL() string {
	if value := strings.TrimSpace(os.Getenv("STATUS_ENDPOINT")); value != "" {
		return value
	}
	return defaultContactStatusURL
}

func (s *AppService) GetContactStatus(ctx context.Context) (ContactStatus, error) {
	endpoint := contactStatusURL()
	if endpoint == "" {
		return ContactStatus{Text: "未知：状态接口未配置", Color: "#666666"}, nil
	}
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(reqCtx, http.MethodGet, endpoint, nil)
	if err != nil {
		return ContactStatus{}, err
	}
	request.Header.Set("User-Agent", "SurveyController/"+displayAppVersion())
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return ContactStatus{Text: "未知：状态获取失败", Color: "#666666"}, nil
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		return ContactStatus{Text: "未知：状态获取失败", Color: "#666666"}, nil
	}
	var payload map[string]any
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return ContactStatus{Text: "未知：状态未知", Color: "#666666"}, nil
	}
	return formatContactStatusPayload(payload), nil
}

func formatContactStatusPayload(payload map[string]any) ContactStatus {
	online, ok := payload["online"].(bool)
	message := strings.TrimSpace(fmt.Sprint(payload["message"]))
	if message == "" || message == "<nil>" {
		if ok && online {
			message = "系统正常运行中"
		} else if ok {
			message = "系统当前不在线"
		} else {
			message = "状态未知"
		}
	}
	if ok && online {
		return ContactStatus{Text: "在线：" + message, Color: "#228B22"}
	}
	if ok {
		return ContactStatus{Text: "离线：" + message, Color: "#cc0000"}
	}
	return ContactStatus{Text: "未知：" + message, Color: "#666666"}
}
