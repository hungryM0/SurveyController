package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime"
	"mime/multipart"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type contactAttachmentPayload struct {
	name        string
	data        []byte
	contentType string
}

func writeContactAttachments(writer *multipart.Writer, request ContactRequest) error {
	attachments, err := buildContactAttachmentPayloads(request)
	if err != nil {
		return err
	}
	for index, attachment := range attachments {
		part, err := createContactFilePart(writer, fmt.Sprintf("file%d", index+1), attachment.name, attachment.contentType)
		if err != nil {
			return err
		}
		if _, err := part.Write(attachment.data); err != nil {
			return err
		}
	}
	return nil
}

func buildContactAttachmentPayloads(request ContactRequest) ([]contactAttachmentPayload, error) {
	payloads := make([]contactAttachmentPayload, 0, maxContactAttachmentCount)
	for _, path := range request.Attachments {
		if strings.TrimSpace(path) == "" {
			continue
		}
		payload, err := contactImageAttachmentPayload(path)
		if err != nil {
			return nil, err
		}
		payloads = append(payloads, payload)
	}
	if isBugReportContact(request.MessageType) {
		autoPayloads, err := buildBugReportAutoAttachmentPayloads(request)
		if err != nil {
			return nil, err
		}
		payloads = append(payloads, autoPayloads...)
	}
	if len(payloads) > maxContactAttachmentCount {
		return nil, fmt.Errorf("附件最多只能选择%d个", maxContactAttachmentCount)
	}
	return payloads, nil
}

func contactImageAttachmentPayload(path string) (contactAttachmentPayload, error) {
	cleanPath := strings.TrimSpace(path)
	info, err := os.Stat(cleanPath)
	if err != nil {
		return contactAttachmentPayload{}, fmt.Errorf("读取附件失败：%s", filepath.Base(cleanPath))
	}
	if info.IsDir() {
		return contactAttachmentPayload{}, fmt.Errorf("附件不能是文件夹：%s", filepath.Base(cleanPath))
	}
	if info.Size() > maxContactAttachmentSize {
		return contactAttachmentPayload{}, fmt.Errorf("附件超过10MB：%s", filepath.Base(cleanPath))
	}
	ext := strings.ToLower(filepath.Ext(cleanPath))
	if !isContactImageExtension(ext) {
		return contactAttachmentPayload{}, fmt.Errorf("请选择有效的图片文件：%s", filepath.Base(cleanPath))
	}
	data, err := os.ReadFile(cleanPath)
	if err != nil {
		return contactAttachmentPayload{}, fmt.Errorf("读取附件失败：%s", filepath.Base(cleanPath))
	}
	if !hasContactImageSignature(ext, data) {
		return contactAttachmentPayload{}, fmt.Errorf("请选择有效的图片文件：%s", filepath.Base(cleanPath))
	}
	return contactAttachmentPayload{
		name:        filepath.Base(cleanPath),
		data:        data,
		contentType: contentTypeByExtension(ext),
	}, nil
}

func buildBugReportAutoAttachmentPayloads(request ContactRequest) ([]contactAttachmentPayload, error) {
	payloads := []contactAttachmentPayload{}
	if request.AutoAttachConfig && request.Config != nil {
		data, err := json.MarshalIndent(request.Config, "", "  ")
		if err != nil {
			return nil, fmt.Errorf("自动导出附件失败：%w", err)
		}
		payloads = append(payloads, contactAttachmentPayload{
			name:        "bug_report_config_" + contactTimestamp() + ".json",
			data:        append(data, '\n'),
			contentType: "application/json",
		})
	}
	if request.AutoAttachLog && len(request.LogLines) > 0 {
		payloads = append(payloads, contactAttachmentPayload{
			name:        "bug_report_log_" + contactTimestamp() + ".txt",
			data:        []byte(strings.Join(request.LogLines, "\n") + "\n"),
			contentType: "text/plain; charset=utf-8",
		})
	}
	if request.AutoAttachLog {
		if payload, ok, err := fatalCrashLogAttachmentPayload(); err != nil {
			return nil, err
		} else if ok {
			payloads = append(payloads, payload)
		}
	}
	return payloads, nil
}

func fatalCrashLogAttachmentPayload() (contactAttachmentPayload, bool, error) {
	path := fatalCrashLogPath()
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return contactAttachmentPayload{}, false, nil
		}
		return contactAttachmentPayload{}, false, fmt.Errorf("自动导出附件失败：%w", err)
	}
	if info.IsDir() || info.Size() <= 0 {
		return contactAttachmentPayload{}, false, nil
	}
	if info.Size() > maxContactAttachmentSize {
		return contactAttachmentPayload{}, false, fmt.Errorf("附件超过10MB：fatal_crash.log")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return contactAttachmentPayload{}, false, fmt.Errorf("自动导出附件失败：%w", err)
	}
	return contactAttachmentPayload{name: "fatal_crash.log", data: data, contentType: "text/plain; charset=utf-8"}, true, nil
}

func createContactFilePart(writer *multipart.Writer, fieldName, fileName, contentType string) (interface{ Write([]byte) (int, error) }, error) {
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", mime.FormatMediaType("form-data", map[string]string{
		"name":     fieldName,
		"filename": fileName,
	}))
	if strings.TrimSpace(contentType) == "" {
		contentType = "application/octet-stream"
	}
	header.Set("Content-Type", contentType)
	return writer.CreatePart(header)
}

func isBugReportContact(value string) bool {
	messageType := strings.TrimSpace(value)
	return messageType == "" || messageType == "报错反馈"
}

func isContactImageExtension(ext string) bool {
	switch strings.ToLower(ext) {
	case ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp":
		return true
	default:
		return false
	}
}

func hasContactImageSignature(ext string, data []byte) bool {
	switch strings.ToLower(ext) {
	case ".png":
		return len(data) >= 8 && bytes.Equal(data[:8], []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	case ".jpg", ".jpeg":
		return len(data) >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff
	case ".gif":
		return len(data) >= 6 && (string(data[:6]) == "GIF87a" || string(data[:6]) == "GIF89a")
	case ".bmp":
		return len(data) >= 2 && string(data[:2]) == "BM"
	case ".webp":
		return len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP"
	default:
		return false
	}
}

func contentTypeByExtension(ext string) string {
	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		return "application/octet-stream"
	}
	return contentType
}

func contactTimestamp() string {
	return time.Now().Format("20060102_150405")
}

func fatalCrashLogPath() string {
	return filepath.Join(userLogsDirectory(), "fatal_crash.log")
}
