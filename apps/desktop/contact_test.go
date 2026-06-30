package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"surveycontroller/proxycore"
	"surveycontroller/surveycore"
)

func TestValidateContactEmail(t *testing.T) {
	if !validateContactEmail("") || !validateContactEmail("user@example.com") {
		t.Fatal("valid email was rejected")
	}
	if validateContactEmail("bad@@mail") {
		t.Fatal("invalid email was accepted")
	}
}

func TestBuildContactMessageMatchesMainFormat(t *testing.T) {
	message := buildContactMessage("4.0.1", ContactRequest{
		MessageType: "报错反馈",
		IssueTitle:  "启动失败",
		Email:       "user@example.com",
		Message:     "打不开",
	}, 73952)

	for _, want := range []string{
		"来源：SurveyController v4.0.1",
		"类型：报错反馈",
		"联系邮箱： user@example.com",
		"反馈标题： 启动失败",
		"随机IP用户ID：73952",
		"消息：打不开",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("message missing %q: %s", want, message)
		}
	}
}

func TestSubmitContactMessagePostsMultipartFields(t *testing.T) {
	var fields map[string]string
	var files map[string]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s", r.Method)
		}
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			t.Fatalf("content type = %q", r.Header.Get("Content-Type"))
		}
		var err error
		fields, files, err = readMultipartFields(r)
		if err != nil {
			t.Fatal(err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	t.Setenv("CONTACT_API_URL", server.URL)
	attachmentPath := filepath.Join(t.TempDir(), "log.png")
	if err := os.WriteFile(attachmentPath, []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, 0o600); err != nil {
		t.Fatal(err)
	}
	manager := proxycore.NewOfficialSessionManager(proxycore.OfficialSessionManagerOptions{
		InitialSession: proxycore.RandomIPSession{DeviceID: "device-1", UserID: 73952},
	})
	service := &AppService{
		proxy: &proxyRuntime{officialClient: proxycore.NewOfficialClient(proxycore.OfficialClientOptions{SessionManager: manager})},
	}

	state, err := service.SubmitContactMessage(context.Background(), ContactRequest{
		MessageType: "报错反馈",
		IssueTitle:  "运行失败",
		Email:       "user@example.com",
		Message:     "日志见附件",
		Attachments: []string{attachmentPath},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !state.Sent {
		t.Fatalf("state = %#v", state)
	}
	if fields["messageType"] != "报错反馈" || fields["issueTitle"] != "运行失败" || fields["userId"] != "73952" {
		t.Fatalf("fields = %#v", fields)
	}
	if !strings.Contains(fields["message"], "联系邮箱： user@example.com") || !strings.Contains(fields["message"], "随机IP用户ID：73952") {
		t.Fatalf("message = %q", fields["message"])
	}
	if files["file1"] != "log.png:\x89PNG\r\n\x1a\n" {
		t.Fatalf("files = %#v", files)
	}
}

func TestSubmitContactMessageAddsBugReportAutoAttachments(t *testing.T) {
	var files map[string]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, parsedFiles, err := readMultipartFields(r)
		if err != nil {
			t.Fatal(err)
		}
		files = parsedFiles
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	t.Setenv("CONTACT_API_URL", server.URL)
	service := NewAppService()

	_, err := service.SubmitContactMessage(context.Background(), ContactRequest{
		MessageType:      "报错反馈",
		Message:          "自动附件",
		AutoAttachConfig: true,
		AutoAttachLog:    true,
		Config:           testRuntimeConfig("https://example.com/s/1"),
		LogLines:         []string{"[core] start", "[core] done"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Fatalf("files = %#v", files)
	}
	if !strings.Contains(files["file1"], "bug_report_config_") || !strings.Contains(files["file1"], "https://example.com/s/1") {
		t.Fatalf("config attachment = %q", files["file1"])
	}
	if !strings.Contains(files["file2"], "bug_report_log_") || !strings.Contains(files["file2"], "[core] done") {
		t.Fatalf("log attachment = %q", files["file2"])
	}
}

func TestSubmitContactMessageValidatesInput(t *testing.T) {
	service := NewAppService()
	if _, err := service.SubmitContactMessage(context.Background(), ContactRequest{}); err == nil || !strings.Contains(err.Error(), "请输入消息内容") {
		t.Fatalf("err = %v", err)
	}
	if _, err := service.SubmitContactMessage(context.Background(), ContactRequest{Message: "hello", Email: "bad@@mail"}); err == nil || !strings.Contains(err.Error(), "邮箱格式不正确") {
		t.Fatalf("err = %v", err)
	}
}

func TestSubmitContactMessageValidatesAttachments(t *testing.T) {
	service := NewAppService()
	missingPath := filepath.Join(t.TempDir(), "missing.log")
	_, err := service.SubmitContactMessage(context.Background(), ContactRequest{
		Message:     "hello",
		Attachments: []string{missingPath},
	})
	if err == nil || !strings.Contains(err.Error(), "读取附件失败") {
		t.Fatalf("err = %v", err)
	}
	invalidPath := filepath.Join(t.TempDir(), "log.txt")
	if err := os.WriteFile(invalidPath, []byte("log body"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = service.SubmitContactMessage(context.Background(), ContactRequest{
		Message:     "hello",
		Attachments: []string{invalidPath},
	})
	if err == nil || !strings.Contains(err.Error(), "请选择有效的图片文件") {
		t.Fatalf("err = %v", err)
	}
	invalidImagePath := filepath.Join(t.TempDir(), "fake.png")
	if err := os.WriteFile(invalidImagePath, []byte("not image"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = service.SubmitContactMessage(context.Background(), ContactRequest{
		Message:     "hello",
		Attachments: []string{invalidImagePath},
	})
	if err == nil || !strings.Contains(err.Error(), "请选择有效的图片文件") {
		t.Fatalf("err = %v", err)
	}
}

func TestFormatContactStatusPayload(t *testing.T) {
	online := formatContactStatusPayload(map[string]any{"online": true, "message": "系统正常"})
	if online.Text != "在线：系统正常" || online.Color != "#228B22" {
		t.Fatalf("online = %#v", online)
	}
	offline := formatContactStatusPayload(map[string]any{"online": false})
	if offline.Text != "离线：系统当前不在线" || offline.Color != "#cc0000" {
		t.Fatalf("offline = %#v", offline)
	}
	unknown := formatContactStatusPayload(map[string]any{})
	if unknown.Text != "未知：状态未知" || unknown.Color != "#666666" {
		t.Fatalf("unknown = %#v", unknown)
	}
}

func TestGetContactStatusUsesEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"online":true,"message":"ok"}`))
	}))
	defer server.Close()
	t.Setenv("STATUS_ENDPOINT", server.URL)
	status, err := NewAppService().GetContactStatus(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if status.Text != "在线：ok" {
		t.Fatalf("status = %#v", status)
	}
}

func readMultipartFields(r *http.Request) (map[string]string, map[string]string, error) {
	reader, err := r.MultipartReader()
	if err != nil {
		return nil, nil, err
	}
	fields := map[string]string{}
	files := map[string]string{}
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, nil, err
		}
		data, err := io.ReadAll(part)
		if err != nil {
			return nil, nil, err
		}
		if part.FileName() != "" {
			files[part.FormName()] = part.FileName() + ":" + string(data)
			continue
		}
		fields[part.FormName()] = string(data)
	}
	return fields, files, nil
}

func testRuntimeConfig(url string) *surveycore.RuntimeConfig {
	return &surveycore.RuntimeConfig{
		URL:         url,
		SurveyTitle: "测试问卷",
		Target:      3,
		Threads:     1,
	}
}
