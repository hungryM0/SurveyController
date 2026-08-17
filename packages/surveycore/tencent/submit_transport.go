package tencent

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/httpjson"
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/proxyhttp"
)

func (r Runner) submitAnswers(ctx context.Context, request *model.SubmissionRequest, surveyID string, hashValue string, pageURL string, answerSessionID string, body map[string]any) error {
	userAgent := r.UserAgent
	if request != nil && strings.TrimSpace(request.Context.UserAgent) != "" {
		userAgent = request.Context.UserAgent
	}
	headers := apiHeaders(pageURL, userAgent)
	headers["Accept"] = "application/json, text/plain, */*"
	headers["Content-Type"] = "application/json;charset=UTF-8"
	if answerSessionID != "" {
		headers["X-Answer-Session"] = answerSessionID
	}
	endpoint := apiEndpoint(surveyID, "answers") + fmt.Sprintf("?pv_uid=%d&hash=%s&_=%d", time.Now().UnixNano(), hashValue, time.Now().UnixMilli())
	var payload apiEnvelope
	proxyAddress := ""
	if request != nil {
		proxyAddress = request.Context.ProxyAddress
	}
	doer, err := r.httpDoer(proxyAddress)
	if err != nil {
		return err
	}
	if err := doer.DoJSON(ctx, http.MethodPost, endpoint, headers, body, &payload); err != nil {
		return err
	}
	code := strings.ToUpper(strings.TrimSpace(stringValue(payload.Code)))
	if code != "OK" && code != "0" {
		return fmt.Errorf("腾讯问卷提交失败：%s", firstString(payload.Message, payload.Msg, payload.Code, "unknown"))
	}
	data, ok := payload.Data.(map[string]any)
	if !ok || strings.TrimSpace(stringValue(data["answer_hash"])) == "" {
		return fmt.Errorf("腾讯问卷提交返回缺少 answer_hash，无法确认服务端是否已收录")
	}
	return nil
}

func (r Runner) confirmSubmit(ctx context.Context, surveyID string, hashValue string, headers map[string]string, answerSessionID string, initial map[string]any) error {
	initialSubmittedAt, initialAnswerID := answerSessionState(initial)
	if answerSessionID == "" {
		return nil
	}
	verifyHeaders := cloneStringMap(headers)
	verifyHeaders["X-Answer-Session"] = answerSessionID
	for attempt := 0; attempt < 3; attempt++ {
		sessionData, err := r.requestAPI(ctx, surveyID, "session", hashValue, verifyHeaders, nil, "")
		if err != nil {
			return err
		}
		lastSubmittedAt, lastAnswerID := answerSessionState(sessionData)
		if lastSubmittedAt > initialSubmittedAt || (lastAnswerID > 0 && lastAnswerID != initialAnswerID) {
			return nil
		}
		if attempt < 2 {
			time.Sleep(200 * time.Millisecond)
		}
	}
	return fmt.Errorf("腾讯问卷提交后未确认到服务端已记录答案")
}

func answerSessionState(sessionData map[string]any) (int, int) {
	answerSession, ok := sessionData["answer_session"].(map[string]any)
	if !ok {
		return 0, 0
	}
	return intValue(answerSession["last_submitted_at"]), intValue(answerSession["last_answer_id"])
}

func (r Runner) requestAPI(ctx context.Context, surveyID string, endpoint string, hashValue string, headers map[string]string, extraParams map[string]string, proxyAddress string) (map[string]any, error) {
	query := fmt.Sprintf("hash=%s&_=%d", hashValue, time.Now().UnixMilli())
	for key, value := range extraParams {
		query += "&" + key + "=" + value
	}
	url := apiEndpoint(surveyID, endpoint) + "?" + query
	var payload apiEnvelope
	doer, err := r.httpDoer(proxyAddress)
	if err != nil {
		return nil, err
	}
	if err := doer.DoJSON(ctx, http.MethodGet, url, headers, nil, &payload); err != nil {
		return nil, err
	}
	return ensureAPIOK(payload, endpoint)
}

func (r Runner) httpDoer(proxyAddress string) (interface {
	DoJSON(ctx context.Context, method string, url string, headers map[string]string, body any, out any) error
}, error) {
	if strings.TrimSpace(proxyAddress) == "" {
		return httpDoerOrDefault(r.HTTP), nil
	}
	client, err := proxyhttp.Client(nil, proxyAddress)
	if err != nil {
		return nil, err
	}
	return httpjson.Client{Client: client}, nil
}

func cloneStringMap(src map[string]string) map[string]string {
	dst := make(map[string]string, len(src))
	for key, value := range src {
		dst[key] = value
	}
	return dst
}
