package credamo

import (
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/httpjson"
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/proxyhttp"
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/runerror"
)

const resolution = "1920px*1080px"

func (r Runner) Run(ctx context.Context, request *model.SubmissionRequest, handler EventHandler) (Result, error) {
	prepared, err := r.Prepare(ctx, request)
	if err != nil {
		return pendingResult(request), err
	}
	return r.RunPrepared(ctx, request, prepared, handler)
}

func (r Runner) Prepare(ctx context.Context, request *model.SubmissionRequest) (*PreparedSurvey, error) {
	if request == nil || strings.TrimSpace(request.Source.URL) == "" {
		return nil, runerror.Wrap(runerror.KindConfig, fmt.Errorf("配置为空"))
	}
	parser := Parser{HTTP: r.HTTP, UserAgent: r.UserAgent}
	origin, shortURL, detail, err := parser.FetchDetailForRun(ctx, request.Source.URL)
	if err != nil {
		return nil, runerror.Wrap(runerror.KindParse, fmt.Errorf("解析问卷失败: %w", err))
	}
	rawQuestions := iterRawQuestions(detail)
	if len(rawQuestions) == 0 {
		return nil, runerror.Wrap(runerror.KindParse, fmt.Errorf("解析问卷失败: 见数详情接口未返回可提交题目"))
	}
	definition := model.SurveyDefinition{Provider: model.ProviderCredamo, Title: surveyTitle(detail), Questions: normalizeSubmitQuestions(rawQuestions)}
	return &PreparedSurvey{
		Definition:   definition,
		Origin:       origin,
		ShortURL:     shortURL,
		Title:        surveyTitle(detail),
		RawQuestions: rawQuestions,
	}, nil
}

func (r Runner) RunPrepared(ctx context.Context, request *model.SubmissionRequest, prepared *PreparedSurvey, handler EventHandler) (Result, error) {
	result := pendingResult(request)
	if request == nil {
		return result, runerror.Wrap(runerror.KindConfig, fmt.Errorf("配置为空"))
	}
	if prepared == nil || prepared.Origin == "" || prepared.ShortURL == "" || len(prepared.RawQuestions) == 0 {
		return result, runerror.Wrap(runerror.KindParse, fmt.Errorf("解析问卷失败: 缺少已准备的问卷数据"))
	}
	target := result.Target
	for i := 0; i < target; i++ {
		if err := ctx.Err(); err != nil {
			result.Status = "stopped"
			return result, err
		}
		initData, err := r.initAnswer(ctx, prepared.Origin, prepared.ShortURL, request.Context.ProxyAddress)
		if err != nil {
			result.Fail++
			emit(handler, "初始化失败", false, true, result.Success+result.Fail, target)
			return result, runerror.Wrap(runerror.KindRun, fmt.Errorf("提交失败: %w", err))
		}
		answers, err := buildAnswerItems(prepared.RawQuestions, request)
		if err != nil {
			result.Fail++
			emit(handler, "生成答案失败", false, true, result.Success+result.Fail, target)
			if runerror.HasKind(err, runerror.KindUnsupported) {
				return result, err
			}
			return result, runerror.Wrap(runerror.KindConfig, fmt.Errorf("生成答案失败: %w", err))
		}
		durationSeconds := defaultDurationSeconds(request)
		answerStartedAt := sampleAnswerStartTimeMS(request, initData.TimestampMS, durationSeconds)
		body := map[string]any{
			"answerStartTime": answerStartedAt,
			"answerEndTime":   answerStartedAt + int64(durationSeconds)*1000,
			"status":          1,
			"answerQstList":   answers,
			"shortUrl":        prepared.ShortURL,
			"resolution":      resolution,
			"sourceDetail":    1,
		}
		if err := r.saveAnswers(ctx, prepared.Origin, prepared.ShortURL, initData, body, request.Context.ProxyAddress); err != nil {
			result.Fail++
			emit(handler, "提交失败", false, true, result.Success+result.Fail, target)
			return result, runerror.Wrap(runerror.KindRun, fmt.Errorf("提交失败: %w", err))
		}
		result.Success++
		emit(handler, "提交成功", true, false, result.Success+result.Fail, target)
	}
	result.Status = "success"
	return result, nil
}

func pendingResult(_ *model.SubmissionRequest) Result {
	return Result{Target: 1, Status: "pending"}
}

func (r Runner) initAnswer(ctx context.Context, origin string, shortURL string, proxyAddress string) (answerInit, error) {
	timeCode := fmt.Sprintf("%d", time.Now().UnixNano())
	headers := requestHeaders(origin, shortURL, r.UserAgent, "")
	endpoint := fmt.Sprintf("%s/v1/survey/answer/noauth/init/%s?timeCode=%s&accountCode=CDM&resolution=%s", strings.TrimRight(origin, "/"), shortURL, timeCode, resolution)
	var payload apiEnvelope
	doer, err := r.httpDoer(proxyAddress)
	if err != nil {
		return answerInit{}, err
	}
	if err := doer.DoJSON(ctx, http.MethodGet, endpoint, headers, nil, &payload); err != nil {
		return answerInit{}, err
	}
	data, err := ensureAPIOK(payload, "初始化")
	if err != nil {
		return answerInit{}, err
	}
	token := strings.TrimSpace(stringValue(data["answerToken"]))
	if token == "" {
		return answerInit{}, fmt.Errorf("见数初始化接口未返回 answerToken")
	}
	timestamp := int64Value(data["timestamp"])
	if timestamp <= 0 {
		timestamp = time.Now().UnixMilli()
	}
	return answerInit{AnswerToken: token, TimestampMS: timestamp, TimeCode: timeCode}, nil
}

func (r Runner) saveAnswers(ctx context.Context, origin string, shortURL string, initData answerInit, body map[string]any, proxyAddress string) error {
	headers := requestHeaders(origin, shortURL, r.UserAgent, initData.AnswerToken)
	headers["Origin"] = strings.TrimRight(origin, "/")
	headers["Content-Type"] = "application/json"
	endpoint := fmt.Sprintf("%s/v1/survey/answer/noauth/save?timeCode=%s&answerToken=%s", strings.TrimRight(origin, "/"), initData.TimeCode, initData.AnswerToken)
	var payload apiEnvelope
	doer, err := r.httpDoer(proxyAddress)
	if err != nil {
		return err
	}
	if err := doer.DoJSON(ctx, http.MethodPost, endpoint, headers, body, &payload); err != nil {
		return err
	}
	_, err = ensureAPIOK(payload, "提交")
	return err
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

func defaultDurationSeconds(request *model.SubmissionRequest) int {
	if request != nil {
		if seconds := model.SampleAnswerDurationSeconds(request.AnswerDuration, 90); seconds > 0 {
			return seconds
		}
	}
	return 90
}

func sampleAnswerStartTimeMS(request *model.SubmissionRequest, fallbackMS int64, durationSeconds int) int64 {
	if request == nil {
		return fallbackMS
	}
	startMS, endMS := model.AnswerDatetimeWindowToEpochMS(request.AnswerDatetimeWindow)
	if startMS <= 0 || endMS <= startMS {
		return fallbackMS
	}
	durationMS := int64(durationSeconds) * 1000
	if durationMS <= 0 {
		durationMS = 1
	}
	latestStartMS := endMS - durationMS
	if latestStartMS <= startMS {
		return startMS
	}
	return startMS + rand.Int63n(latestStartMS-startMS+1)
}

func emit(handler EventHandler, message string, success bool, fail bool, current int, total int) {
	if handler == nil {
		return
	}
	handler(Event{
		Worker:  "Worker-1",
		Message: message,
		Success: success,
		Fail:    fail,
		Current: current,
		Total:   total,
		Time:    time.Now(),
	})
}
