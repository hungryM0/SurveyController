package wjx

import (
	"context"
	"fmt"
	"math/rand"
	"net/url"
	"regexp"
	"strings"
	"time"

	"surveycontroller/surveycore/internal/model"
	"surveycontroller/surveycore/internal/runerror"
)

func (r Runner) Run(ctx context.Context, cfg *model.RuntimeConfig, handler EventHandler) (Result, error) {
	prepared, err := r.Prepare(ctx, cfg)
	if err != nil {
		return pendingResult(cfg), err
	}
	return r.RunPrepared(ctx, cfg, prepared, handler)
}

func (r Runner) Prepare(ctx context.Context, cfg *model.RuntimeConfig) (*PreparedSurvey, error) {
	if cfg == nil {
		return nil, runerror.Wrap(runerror.KindConfig, fmt.Errorf("配置为空"))
	}
	if strings.TrimSpace(cfg.URL) == "" {
		return nil, runerror.Wrap(runerror.KindConfig, fmt.Errorf("配置为空"))
	}
	parser := Parser{Client: r.Client, UserAgent: r.UserAgent}
	definition, err := parser.Parse(ctx, cfg.URL)
	if err != nil {
		return nil, runerror.Wrap(runerror.KindParse, fmt.Errorf("解析问卷失败: %w", err))
	}
	return &PreparedSurvey{Definition: definition}, nil
}

func (r Runner) RunPrepared(ctx context.Context, cfg *model.RuntimeConfig, prepared *PreparedSurvey, handler EventHandler) (Result, error) {
	result := pendingResult(cfg)
	if cfg == nil {
		return result, runerror.Wrap(runerror.KindConfig, fmt.Errorf("配置为空"))
	}
	if prepared == nil || len(prepared.Definition.Questions) == 0 {
		return result, runerror.Wrap(runerror.KindParse, fmt.Errorf("解析问卷失败: 缺少已准备的问卷数据"))
	}
	target := result.Target
	definition := prepared.Definition
	if cfg.SurveyProvider == "" {
		cfg.SurveyProvider = model.ProviderWJX
	}
	if cfg.SurveyTitle == "" {
		cfg.SurveyTitle = definition.Title
	}
	if len(cfg.QuestionsInfo) == 0 {
		cfg.QuestionsInfo = definition.Questions
	}
	for i := 0; i < target; i++ {
		if err := ctx.Err(); err != nil {
			result.Status = "stopped"
			return result, err
		}
		submitData, err := buildSubmitData(definition.Questions, cfg)
		if err != nil {
			result.Fail++
			emit(handler, "生成答案失败", false, true, result.Success+result.Fail, target)
			if runerror.HasKind(err, runerror.KindUnsupported) {
				return result, err
			}
			return result, runerror.Wrap(runerror.KindConfig, fmt.Errorf("生成答案失败: %w", err))
		}
		if err := r.submit(ctx, cfg, submitData); err != nil {
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

func pendingResult(cfg *model.RuntimeConfig) Result {
	target := 1
	if cfg != nil && cfg.Target > 0 {
		target = cfg.Target
	}
	return Result{Target: target, Status: "pending"}
}

func (r Runner) submit(ctx context.Context, cfg *model.RuntimeConfig, submitData string) error {
	shortID, err := shortIDFromURL(cfg.URL)
	if err != nil {
		return err
	}
	nowMS := time.Now().UnixMilli()
	ktimes := sampleKTimes(cfg)
	startSeconds := nowMS/1000 - int64(ktimes)
	jqnonce := fmt.Sprintf("%d-%d", nowMS, rand.Int63())
	query := url.Values{}
	query.Set("shortid", shortID)
	query.Set("starttime", formatStartTime(startSeconds))
	query.Set("cst", fmt.Sprintf("%d", startSeconds*1000))
	query.Set("source", "directphone")
	query.Set("submittype", "1")
	query.Set("ktimes", fmt.Sprintf("%d", ktimes))
	query.Set("rn", fmt.Sprintf("%.8f", 2000000000+rand.Float64()*100000000))
	query.Set("jcn", shortID)
	query.Set("nw", "1")
	query.Set("jwt", "4")
	query.Set("jpm", "62")
	query.Set("capt", "2")
	query.Set("t", fmt.Sprintf("%d", nowMS))
	query.Set("wxfs", "100")
	query.Set("jqnonce", jqnonce)
	query.Set("jqsign", buildJQSign(jqnonce, ktimes))
	query.Set("access_token", "1")
	query.Set("openid", fmt.Sprintf("%d", 100000000+rand.Intn(900000000)))
	query.Set("unionId", fmt.Sprintf("%d", 100000000+rand.Intn(900000000)))
	query.Set("wxappid", "wx8fe84c5d52db247a")
	query.Set("iwx", "1")

	form := url.Values{}
	form.Set("submitdata", submitData)
	form.Set("sceneId", "q0hcfsca")
	responseText, err := r.postForm(ctx, submitEndpoint(cfg.URL), cfg.URL, query, form, cfg.ActiveProxyAddress)
	if err != nil {
		return err
	}
	return ensureSubmitOK(cfg, responseText)
}

func sampleKTimes(cfg *model.RuntimeConfig) int {
	if cfg != nil {
		if seconds := model.SampleAnswerDurationSeconds(cfg.AnswerDuration, 0); seconds > 0 {
			return maxInt(1, seconds)
		}
	}
	return 10 + rand.Intn(11)
}

func formatStartTime(seconds int64) string {
	dt := time.Unix(seconds, 0)
	return fmt.Sprintf("%d/%d/%d %d:%d:%d", dt.Year(), dt.Month(), dt.Day(), dt.Hour(), dt.Minute(), dt.Second())
}

func buildJQSign(jqnonce string, ktimes int) string {
	tValue := ktimes % 10
	if tValue == 0 {
		tValue = 1
	}
	out := make([]rune, 0, len([]rune(jqnonce)))
	for _, ch := range jqnonce {
		out = append(out, rune(int(ch)^tValue))
	}
	return string(out)
}

func ensureSubmitOK(cfg *model.RuntimeConfig, responseText string) error {
	text := strings.TrimSpace(responseText)
	lowered := strings.ToLower(text)
	success := strings.Contains(lowered, "complete.aspx") || strings.Contains(lowered, "success") || strings.HasPrefix(lowered, "10") || lowered == "1" || lowered == "ok"
	failure := strings.Contains(text, "抱歉") || strings.Contains(text, "不符合") || strings.Contains(text, "错误") || strings.Contains(text, "重新提交") || strings.Contains(text, "验证码")
	if success && !failure {
		return nil
	}
	return submitRejectedError(cfg, text)
}

func submitRejectedError(_ *model.RuntimeConfig, responseText string) error {
	match := regexp.MustCompile(`^\s*(\d+)〒(\d+)〒(.+)$`).FindStringSubmatch(responseText)
	if len(match) >= 4 {
		return fmt.Errorf("问卷星提交被拒绝：第%s题，%s", match[2], strings.TrimSpace(match[3]))
	}
	if responseText == "" {
		responseText = "空响应"
	}
	if len(responseText) > 200 {
		responseText = responseText[:200]
	}
	return fmt.Errorf("问卷星提交被拒绝：%s", responseText)
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
