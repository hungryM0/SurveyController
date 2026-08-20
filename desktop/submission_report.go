package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/SurveyController/SurveyCore/pkg/proxycore"
	"github.com/SurveyController/SurveyCore/pkg/surveycore"
)

const defaultSubmissionReportEndpoint = "https://api-wjx.hungrym0.com/api/submission/report"

type submissionReporter interface {
	Report(ctx context.Context, report submissionReport) bool
}

type submissionReport struct {
	UserID        int    `json:"user_id"`
	SurveyURL     string `json:"survey_url"`
	Result        string `json:"result"`
	ProxyProvider string `json:"proxy_provider"`
	ClientVersion string `json:"client_version"`
	DeviceID      string `json:"-"`
}

type httpSubmissionReporter struct {
	endpoint   string
	httpClient *http.Client
}

func newHTTPSubmissionReporter() *httpSubmissionReporter {
	endpoint := strings.TrimSpace(os.Getenv("SUBMISSION_REPORT_ENDPOINT"))
	if endpoint == "" {
		endpoint = defaultSubmissionReportEndpoint
	}
	return &httpSubmissionReporter{
		endpoint:   endpoint,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (r *httpSubmissionReporter) Report(ctx context.Context, report submissionReport) bool {
	if report.UserID <= 0 || strings.TrimSpace(r.endpoint) == "" {
		return false
	}
	payload, err := json.Marshal(report)
	if err != nil {
		return false
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(payload))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Device-ID", strings.TrimSpace(report.DeviceID))
	response, err := r.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode >= 200 && response.StatusCode < 300
}

func buildSubmissionReport(session proxycore.RandomIPSession, cfg surveycore.RunRequest, proxySource string, result *surveycore.RunResult, runErr error) submissionReport {
	resultText := "unknown"
	if runErr != nil {
		resultText = "failed"
	}
	if result != nil && result.Success > 0 && result.Fail == 0 && runErr == nil {
		resultText = "success"
	}
	if result != nil && result.Success > 0 && result.Fail > 0 {
		resultText = "partial"
	}
	return submissionReport{
		UserID:        session.UserID,
		SurveyURL:     strings.TrimSpace(cfg.SurveySource.URL),
		Result:        resultText,
		ProxyProvider: normalizeSubmissionProxyProvider(proxySource),
		ClientVersion: displayAppVersion(),
		DeviceID:      session.DeviceID,
	}
}

func normalizeSubmissionProxyProvider(source string) string {
	switch normalizeDesktopProxySource(source) {
	case proxycore.OfficialSourceBenefit:
		return "idiot"
	case proxycore.OfficialSourceDefault:
		return "default"
	case "":
		return "unknown"
	default:
		return "unknown"
	}
}
