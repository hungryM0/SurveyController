package main

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/SurveyController/SurveyCore/pkg/surveycore"
	configio "github.com/SurveyController/SurveyCore/pkg/surveycore/config"
	"github.com/SurveyController/SurveyCore/pkg/surveycore/model"
	proxycore "github.com/SurveyController/SurveyCore/pkg/surveycore/proxy"
)

const (
	taskCheckStepSurvey      = "survey"
	taskCheckStepAnswers     = "answers"
	taskCheckStepTask        = "task"
	taskCheckStepNetwork     = "network"
	answerDatetimeLayout     = "2006-01-02 15:04:05"
	maxAnswerDurationSeconds = 1800
)

func (s *AppService) CheckTask(_ context.Context, request CheckTaskRequest) TaskCheckState {
	problems := make([]TaskCheckProblem, 0, 5)
	if _, err := configio.RunRequestFromConfigDocument(request.Config); err != nil {
		problems = append(problems, TaskCheckProblem{
			Code:     "config_invalid",
			Message:  err.Error(),
			Step:     taskCheckStepAnswers,
			Severity: "error",
		})
	}

	checkSurvey(request.Config, &problems)
	checkAnswers(request.Config, &problems)
	checkExecution(request.Config, &problems)
	checkNetwork(request.Config, &problems)
	checkAI(request, &problems)
	return taskCheckState(problems)
}

func checkSurvey(config configio.ConfigDocument, problems *[]TaskCheckProblem) {
	parsedURL := strings.TrimSpace(config.Survey.URL)
	if parsedURL == "" {
		*problems = append(*problems, TaskCheckProblem{"survey_url_missing", "问卷链接不能为空", taskCheckStepSurvey, "error"})
		return
	}
	parsed, err := url.ParseRequestURI(parsedURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		*problems = append(*problems, TaskCheckProblem{"survey_url_invalid", "问卷链接必须是有效的 HTTP 或 HTTPS 地址", taskCheckStepSurvey, "error"})
	} else if !surveycore.IsSupportedURL(parsedURL) && !isLocalProviderURL(parsedURL, config.Survey.Provider, config.Survey.Definition.Provider) {
		*problems = append(*problems, TaskCheckProblem{"survey_url_unsupported", "问卷链接不是受支持的平台地址", taskCheckStepSurvey, "error"})
	}
	provider := strings.ToLower(strings.TrimSpace(config.Survey.Provider))
	if provider == "" {
		provider = strings.ToLower(strings.TrimSpace(config.Survey.Definition.Provider))
	}
	if provider != "" && provider != model.ProviderWJX && provider != model.ProviderQQ && provider != model.ProviderCredamo {
		*problems = append(*problems, TaskCheckProblem{"survey_provider_unsupported", "问卷平台暂不支持", taskCheckStepSurvey, "error"})
	}
	if provider != "" && surveycore.IsSupportedURL(parsedURL) {
		expected := providerForURL(parsedURL)
		if expected != "" && expected != provider {
			*problems = append(*problems, TaskCheckProblem{"survey_provider_mismatch", "问卷平台与链接不匹配", taskCheckStepSurvey, "error"})
		}
	}
	if !hasAnswerableQuestions(config.Survey.Definition.Questions) {
		*problems = append(*problems, TaskCheckProblem{"survey_questions_missing", "问卷尚未完成解析，至少需要一道真实题目", taskCheckStepSurvey, "error"})
	}
	if strings.TrimSpace(config.Survey.Title) == "" && strings.TrimSpace(config.Survey.Definition.Title) == "" {
		*problems = append(*problems, TaskCheckProblem{"survey_title_missing", "问卷标题尚未解析", taskCheckStepSurvey, "warning"})
	}
}

func isLocalProviderURL(raw string, providers ...string) bool {
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "localhost" {
		return false
	}
	for _, provider := range providers {
		switch strings.ToLower(strings.TrimSpace(provider)) {
		case model.ProviderWJX, model.ProviderQQ, model.ProviderCredamo:
			return true
		}
	}
	return false
}

func checkAnswers(config configio.ConfigDocument, problems *[]TaskCheckProblem) {
	questionNumbers := make(map[int]struct{})
	for _, question := range config.Survey.Definition.Questions {
		if question.Unsupported {
			*problems = append(*problems, TaskCheckProblem{
				Code:     "answer_question_unsupported",
				Message:  fmt.Sprintf("第%d题暂不支持：%s", question.Num, firstNonEmptyTask(question.UnsupportedReason, question.ProviderType, question.TypeCode)),
				Step:     taskCheckStepAnswers,
				Severity: "error",
			})
			continue
		}
		if !question.IsDescription {
			questionNumbers[question.Num] = struct{}{}
		}
	}
	if len(questionNumbers) == 0 {
		return
	}

	covered := make(map[int]struct{}, len(config.Answers.Strategies))
	for _, strategy := range config.Answers.Strategies {
		if strategy.QuestionNum != nil {
			if _, duplicate := covered[*strategy.QuestionNum]; duplicate {
				*problems = append(*problems, TaskCheckProblem{"answer_strategy_duplicate_question", "同一道题不能配置多个答案策略", taskCheckStepAnswers, "error"})
			}
			covered[*strategy.QuestionNum] = struct{}{}
			if _, ok := questionNumbers[*strategy.QuestionNum]; !ok || *strategy.QuestionNum <= 0 {
				*problems = append(*problems, TaskCheckProblem{"answer_strategy_unknown_question", "答案策略包含不存在的题号", taskCheckStepAnswers, "error"})
			}
		} else {
			*problems = append(*problems, TaskCheckProblem{"answer_strategy_question_missing", "答案策略缺少题号", taskCheckStepAnswers, "error"})
		}
	}
	for questionNum := range questionNumbers {
		if _, ok := covered[questionNum]; !ok {
			*problems = append(*problems, TaskCheckProblem{
				Code:     "answer_strategy_missing",
				Message:  "请先为每道可作答题目生成答案策略",
				Step:     taskCheckStepAnswers,
				Severity: "error",
			})
			return
		}
	}
}

func checkExecution(config configio.ConfigDocument, problems *[]TaskCheckProblem) {
	execution := config.Execution
	if execution.Target <= 0 {
		*problems = append(*problems, TaskCheckProblem{"execution_target_invalid", "目标提交数量必须大于 0", taskCheckStepTask, "error"})
	}
	if execution.Threads <= 0 {
		*problems = append(*problems, TaskCheckProblem{"execution_concurrency_invalid", "并发数量必须大于 0", taskCheckStepTask, "error"})
	} else if execution.Target > 0 && execution.Threads > execution.Target {
		*problems = append(*problems, TaskCheckProblem{"execution_concurrency_exceeds_target", "并发数量不能大于目标提交数量", taskCheckStepTask, "error"})
	}
	checkRange(execution.SubmitInterval, "execution_interval_invalid", "提交间隔范围无效，最小值不能大于最大值且不能为负数", problems)
	checkPositiveRange(execution.AnswerDuration, "execution_duration_invalid", "作答时长范围无效，必须为正数且最小值不能大于最大值", problems)
	if execution.AnswerDuration[0] > maxAnswerDurationSeconds || execution.AnswerDuration[1] > maxAnswerDurationSeconds {
		*problems = append(*problems, TaskCheckProblem{"execution_duration_exceeds_maximum", "作答时长不能超过 1800 秒", taskCheckStepTask, "error"})
	}
	checkAnswerDatetimeWindow(config, problems)
}

func providerForURL(raw string) string {
	parsed, err := url.ParseRequestURI(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "wj.qq.com" {
		return model.ProviderQQ
	}
	if host == "credamo.com" || strings.HasSuffix(host, ".credamo.com") || host == "credamo.cn" || strings.HasSuffix(host, ".credamo.cn") {
		return model.ProviderCredamo
	}
	if host == "wjx.cn" || strings.HasSuffix(host, ".wjx.cn") || host == "wjx.com" || strings.HasSuffix(host, ".wjx.com") || host == "wjx.top" || strings.HasSuffix(host, ".wjx.top") {
		return model.ProviderWJX
	}
	return ""
}

func firstNonEmptyTask(values ...string) string {
	for _, value := range values {
		if text := strings.TrimSpace(value); text != "" {
			return text
		}
	}
	return "未知题型"
}

func checkAnswerDatetimeWindow(config configio.ConfigDocument, problems *[]TaskCheckProblem) {
	provider := strings.ToLower(strings.TrimSpace(config.Survey.Provider))
	if provider == "" {
		provider = strings.ToLower(strings.TrimSpace(config.Survey.Definition.Provider))
	}
	if provider != "credamo" {
		return
	}
	startText := strings.TrimSpace(config.Execution.AnswerDatetimeWindow[0])
	endText := strings.TrimSpace(config.Execution.AnswerDatetimeWindow[1])
	if startText == "" && endText == "" {
		return
	}
	if startText == "" || endText == "" {
		*problems = append(*problems, TaskCheckProblem{"execution_datetime_window_incomplete", "时间窗口需要同时设置开始和结束时间", taskCheckStepTask, "error"})
		return
	}
	start, startErr := time.ParseInLocation(answerDatetimeLayout, startText, time.Local)
	end, endErr := time.ParseInLocation(answerDatetimeLayout, endText, time.Local)
	if startErr != nil || endErr != nil {
		*problems = append(*problems, TaskCheckProblem{"execution_datetime_window_invalid", "时间窗口格式无效，请重新选择日期和时间", taskCheckStepTask, "error"})
		return
	}
	if !end.After(start) {
		*problems = append(*problems, TaskCheckProblem{"execution_datetime_window_order", "结束时间必须晚于开始时间", taskCheckStepTask, "error"})
		return
	}
	if int(end.Sub(start).Seconds()) < executionAnswerDurationMax(config.Execution.AnswerDuration) {
		*problems = append(*problems, TaskCheckProblem{"execution_datetime_window_too_narrow", "时间窗口必须覆盖最长作答时长", taskCheckStepTask, "error"})
	}
}

func executionAnswerDurationMax(values [2]int) int {
	if values[1] < 0 {
		return 0
	}
	return values[1]
}

func checkRange(values [2]int, code string, message string, problems *[]TaskCheckProblem) {
	if values[0] < 0 || values[1] < 0 || values[0] > values[1] {
		*problems = append(*problems, TaskCheckProblem{code, message, taskCheckStepTask, "error"})
	}
}

func checkPositiveRange(values [2]int, code string, message string, problems *[]TaskCheckProblem) {
	if values[0] <= 0 || values[1] <= 0 || values[0] > values[1] {
		*problems = append(*problems, TaskCheckProblem{code, message, taskCheckStepTask, "error"})
	}
}

func checkNetwork(config configio.ConfigDocument, problems *[]TaskCheckProblem) {
	if normalizeDesktopNetworkMode(config.Network) == "fixed" {
		fixedAddress := strings.TrimSpace(config.Network.FixedProxyAddress)
		if fixedAddress == "" {
			*problems = append(*problems, TaskCheckProblem{"fixed_proxy_address_missing", "固定代理地址不能为空", taskCheckStepNetwork, "error"})
			return
		}
		checkHTTPProxyURL(fixedAddress, "fixed_proxy_address_invalid", "固定代理地址必须是有效的 HTTP 或 HTTPS 地址", problems)
		return
	}
	if normalizeDesktopNetworkMode(config.Network) != "random" {
		return
	}
	source := normalizeDesktopProxySource(config.Network.ProxySource)
	switch source {
	case proxycore.DefaultCustomProxySource:
		checkHTTPURL(config.Network.CustomProxyAPI, "proxy_api_url_missing", "代理 API 地址不能为空", "proxy_api_url_invalid", "代理 API 地址必须是有效的 HTTP 或 HTTPS 地址", problems)
	case proxycore.OfficialSourceDefault, proxycore.OfficialSourceBenefit:
	default:
		*problems = append(*problems, TaskCheckProblem{"proxy_source_invalid", "代理来源不受支持", taskCheckStepNetwork, "error"})
	}
}

func checkHTTPProxyURL(raw, invalidCode, invalidMessage string, problems *[]TaskCheckProblem) {
	if _, ok := proxycore.NormalizeHTTPProxyAddress(raw); !ok {
		*problems = append(*problems, TaskCheckProblem{invalidCode, invalidMessage, taskCheckStepNetwork, "error"})
	}
}

func checkHTTPURL(raw, missingCode, missingMessage, invalidCode, invalidMessage string, problems *[]TaskCheckProblem) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		*problems = append(*problems, TaskCheckProblem{missingCode, missingMessage, taskCheckStepNetwork, "error"})
		return
	}
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		*problems = append(*problems, TaskCheckProblem{invalidCode, invalidMessage, taskCheckStepNetwork, "error"})
	}
}

func checkAI(request CheckTaskRequest, problems *[]TaskCheckProblem) {
	if request.AIProfile == nil || !answerPlanUsesAIFromConfig(request.Config) {
		return
	}
	if strings.EqualFold(strings.TrimSpace(request.AIProfile.Mode), "provider") && !request.AIProfile.HasAPIKey {
		*problems = append(*problems, TaskCheckProblem{"ai_credential_missing", "AI 答题已启用，但未配置 API Key", taskCheckStepAnswers, "error"})
	}
}

func answerPlanUsesAIFromConfig(config configio.ConfigDocument) bool {
	return answerPlanUsesAI(config.Answers)
}

func hasAnswerableQuestions(questions []model.QuestionMeta) bool {
	for _, question := range questions {
		if !question.IsDescription && !question.Unsupported {
			return true
		}
	}
	return false
}

func taskCheckState(problems []TaskCheckProblem) TaskCheckState {
	status := TaskCheckReady
	for _, problem := range problems {
		if problem.Severity == "error" {
			return TaskCheckState{Status: TaskCheckBlocked, Problems: problems}
		}
		status = TaskCheckWarning
	}
	return TaskCheckState{Status: status, Problems: problems}
}

func taskCheckError(state TaskCheckState) error {
	for _, problem := range state.Problems {
		if problem.Severity == "error" && strings.TrimSpace(problem.Message) != "" {
			return fmt.Errorf("任务检查失败：%s", problem.Message)
		}
	}
	return fmt.Errorf("任务检查失败")
}
