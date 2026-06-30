package main

import (
	"bytes"
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"surveycontroller/surveycore"
)

const defaultContactAPIURL = "https://bot.hungrym0.com"
const maxContactAttachmentCount = 3
const maxContactAttachmentSize = 10 * 1024 * 1024

type ContactRequest struct {
	MessageType      string                    `json:"messageType"`
	IssueTitle       string                    `json:"issueTitle"`
	Email            string                    `json:"email"`
	Message          string                    `json:"message"`
	Attachments      []string                  `json:"attachments"`
	AutoAttachConfig bool                      `json:"autoAttachConfig"`
	AutoAttachLog    bool                      `json:"autoAttachLog"`
	Config           *surveycore.RuntimeConfig `json:"config,omitempty"`
	LogLines         []string                  `json:"logLines,omitempty"`
}

type ContactState struct {
	Sent    bool   `json:"sent"`
	Message string `json:"message"`
}

type ContactStatus struct {
	Text  string `json:"text"`
	Color string `json:"color"`
}

func validateContactEmail(email string) bool {
	email = strings.TrimSpace(email)
	if email == "" {
		return true
	}
	ok, err := regexp.MatchString(`^[^@\s]+@[^@\s]+\.[^@\s]+$`, email)
	return err == nil && ok
}

func buildContactMessage(version string, request ContactRequest, userID int) string {
	messageType := strings.TrimSpace(request.MessageType)
	if messageType == "" {
		messageType = "报错反馈"
	}
	lines := []string{
		fmt.Sprintf("来源：SurveyController v%s", strings.TrimSpace(version)),
		fmt.Sprintf("类型：%s", messageType),
	}
	if email := strings.TrimSpace(request.Email); email != "" {
		lines = append(lines, fmt.Sprintf("联系邮箱： %s", email))
	}
	if title := strings.TrimSpace(request.IssueTitle); title != "" && messageType == "报错反馈" {
		lines = append(lines, fmt.Sprintf("反馈标题： %s", title))
	}
	if userID > 0 {
		lines = append(lines, fmt.Sprintf("随机IP用户ID：%d", userID))
	}
	lines = append(lines, "", fmt.Sprintf("消息：%s", strings.TrimSpace(request.Message)))
	return strings.Join(lines, "\n")
}

func contactAPIURL() string {
	if value := strings.TrimSpace(os.Getenv("CONTACT_API_URL")); value != "" {
		return value
	}
	return defaultContactAPIURL
}

func (s *AppService) SubmitContactMessage(ctx context.Context, request ContactRequest) (ContactState, error) {
	if strings.TrimSpace(request.Message) == "" {
		return ContactState{}, fmt.Errorf("请输入消息内容")
	}
	if !validateContactEmail(request.Email) {
		return ContactState{}, fmt.Errorf("邮箱格式不正确")
	}
	userID := 0
	if s.proxy != nil {
		session, err := s.proxyRuntime().officialProxyClient().SessionManager().Snapshot(ctx)
		if err == nil {
			userID = session.UserID
		}
	}
	endpoint := contactAPIURL()
	if endpoint == "" {
		return ContactState{}, fmt.Errorf("联系API未配置")
	}
	fullMessage := buildContactMessage(displayAppVersion(), request, userID)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	fields := map[string]string{
		"message":     fullMessage,
		"messageType": normalizedContactMessageType(request.MessageType),
		"timestamp":   time.Now().Format(time.RFC3339),
	}
	if title := strings.TrimSpace(request.IssueTitle); title != "" {
		fields["issueTitle"] = title
	}
	if userID > 0 {
		fields["userId"] = strconv.Itoa(userID)
	}
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			return ContactState{}, err
		}
	}
	if err := writeContactAttachments(writer, request); err != nil {
		return ContactState{}, err
	}
	if err := writer.Close(); err != nil {
		return ContactState{}, err
	}
	httpClient := &http.Client{Timeout: 25 * time.Second}
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
	if err != nil {
		return ContactState{}, err
	}
	httpRequest.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := httpClient.Do(httpRequest)
	if err != nil {
		return ContactState{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return ContactState{}, fmt.Errorf("发送失败：%d", response.StatusCode)
	}
	return ContactState{Sent: true, Message: "消息已发送"}, nil
}

func normalizedContactMessageType(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "报错反馈"
	}
	return value
}
