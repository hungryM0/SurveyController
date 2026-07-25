package tencent

import (
	"context"
	"fmt"
	"strings"

	"surveycontroller/surveycore/internal/model"
	"surveycontroller/surveycore/internal/runerror"
)

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
	surveyID, hashValue, err := extractIdentifiers(request.Source.URL)
	if err != nil {
		return nil, runerror.Wrap(runerror.KindParse, err)
	}
	page := pageURL(surveyID, hashValue)
	headers := apiHeaders(page, r.UserAgent)
	seedAnswerSession, seedSessionData, err := r.fetchAnswerSession(ctx, surveyID, hashValue, headers)
	if err != nil {
		return nil, runerror.Wrap(runerror.KindParse, fmt.Errorf("解析问卷失败: %w", err))
	}
	questionHeaders := cloneStringMap(headers)
	if seedAnswerSession != "" {
		questionHeaders["X-Answer-Session"] = seedAnswerSession
	}
	var rawQuestions []map[string]any
	var lastErr error
	for _, locale := range locales {
		questionData, requestErr := r.requestAPI(ctx, surveyID, "questions", hashValue, questionHeaders, map[string]string{"locale": locale}, "")
		if requestErr != nil {
			lastErr = requestErr
			continue
		}
		rawQuestions = asMapList(questionData["questions"])
		if len(rawQuestions) > 0 {
			break
		}
		lastErr = fmt.Errorf("腾讯问卷题目接口未返回可提交题目（locale=%s）", locale)
	}
	if len(rawQuestions) == 0 {
		if lastErr == nil {
			lastErr = fmt.Errorf("腾讯问卷题目接口未返回可提交题目")
		}
		return nil, runerror.Wrap(runerror.KindParse, fmt.Errorf("解析问卷失败: %w", lastErr))
	}
	definition, definitionErr := buildDefinition(rawQuestions, request.Definition.Title)
	if definitionErr != nil {
		return nil, runerror.Wrap(runerror.KindParse, definitionErr)
	}
	return &PreparedSurvey{
		Definition:        definition,
		SurveyID:          surveyID,
		Hash:              hashValue,
		PageURL:           page,
		RawQuestions:      rawQuestions,
		seedAnswerSession: seedAnswerSession,
		seedSessionData:   seedSessionData,
	}, nil
}

func (r Runner) RunPrepared(ctx context.Context, request *model.SubmissionRequest, prepared *PreparedSurvey, handler EventHandler) (Result, error) {
	result := pendingResult(request)
	if request == nil {
		return result, runerror.Wrap(runerror.KindConfig, fmt.Errorf("配置为空"))
	}
	if prepared == nil || prepared.SurveyID == "" || prepared.Hash == "" || len(prepared.RawQuestions) == 0 {
		return result, runerror.Wrap(runerror.KindParse, fmt.Errorf("解析问卷失败: 缺少已准备的问卷数据"))
	}
	target := result.Target
	userAgent := strings.TrimSpace(request.Context.UserAgent)
	if userAgent == "" {
		userAgent = r.UserAgent
	}
	headers := apiHeaders(prepared.PageURL, userAgent)
	for index := 0; index < target; index++ {
		if err := ctx.Err(); err != nil {
			result.Status = "stopped"
			return result, err
		}
		answerSessionID, sessionData, seeded := prepared.takeSeedSession()
		var err error
		if !seeded {
			answerSessionID, sessionData, err = r.fetchAnswerSession(ctx, prepared.SurveyID, prepared.Hash, headers)
		}
		if err != nil {
			result.Fail++
			emit(handler, "初始化失败", false, true, result.Success+result.Fail, target)
			return result, runerror.Wrap(runerror.KindRun, fmt.Errorf("初始化失败: %w", err))
		}
		body, err := buildSubmitBody(request, prepared.SurveyID, prepared.Hash, prepared.RawQuestions, userAgent)
		if err != nil {
			result.Fail++
			emit(handler, "生成答案失败", false, true, result.Success+result.Fail, target)
			if runerror.HasKind(err, runerror.KindUnsupported) {
				return result, err
			}
			return result, runerror.Wrap(runerror.KindConfig, fmt.Errorf("生成答案失败: %w", err))
		}
		if err := r.submitAnswers(ctx, request, prepared.SurveyID, prepared.Hash, prepared.PageURL, answerSessionID, body); err != nil {
			result.Fail++
			emit(handler, "提交失败", false, true, result.Success+result.Fail, target)
			return result, runerror.Wrap(runerror.KindRun, fmt.Errorf("提交失败: %w", err))
		}
		if err := r.confirmSubmit(ctx, prepared.SurveyID, prepared.Hash, headers, answerSessionID, sessionData); err != nil {
			result.Fail++
			emit(handler, "校验失败", false, true, result.Success+result.Fail, target)
			return result, runerror.Wrap(runerror.KindRun, fmt.Errorf("提交失败: %w", err))
		}
		result.Success++
		emit(handler, "提交成功", true, false, result.Success+result.Fail, target)
	}
	result.Status = "success"
	return result, nil
}

func (r Runner) fetchAnswerSession(ctx context.Context, surveyID string, hashValue string, headers map[string]string) (string, map[string]any, error) {
	sessionData, err := r.requestAPI(ctx, surveyID, "session", hashValue, headers, nil, "")
	if err != nil {
		return "", nil, err
	}
	answerSessionID := strings.TrimSpace(stringValue(sessionData["answer_session_id"]))
	return answerSessionID, sessionData, nil
}

func pendingResult(_ *model.SubmissionRequest) Result {
	return Result{Target: 1, Status: "pending"}
}
