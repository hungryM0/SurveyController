package surveycore

import (
	"context"
	"fmt"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

const (
	aiModeFree            = "free"
	aiModeProvider        = "provider"
	aiProviderCustom      = "custom"
	aiProtocolAuto        = "auto"
	aiProtocolChat        = "chat_completions"
	aiProtocolResponses   = "responses"
	chatCompletionsSuffix = "/chat/completions"
	responsesSuffix       = "/responses"
	legacyCompletions     = "/completions"
	defaultFreeAIURL      = "https://api-wjx.hungrym0.com/api/ai/free"
	defaultDeepSeekURL    = "https://api.deepseek.com/v1"
	defaultDeepSeekModel  = "deepseek-v4-flash"
	optionFillAIToken     = "__AI_FILL__"
)

const defaultAISystemPromptBase = `你现在不是AI助手，而是一名有实际使用经验但不专业的普通用户。
请按照“填写问卷/填空题”的方式作答，而不是进行解释或对话。

回答规则：
1. 只给出答案本身，不要解释原因，不要分析，不要教学
2. 以个人体验和模糊印象为主，可以不确定、可以用模糊一些的表达
3. 回答尽量简短，避免长句
4. 不要使用专业术语或严谨表述

请注意：
- 不要像AI助手一样分点说明
- 不要补充背景知识
- 不要解释题目
- 不要自称“作为AI”

如果你的回答开始变得专业、详细或像在解释，请立即改回普通用户的随意回答风格。`

const defaultAISystemPromptProvider = defaultAISystemPromptBase + `

多项填空补充规则：
6. 当题目有多个空位时，按空位顺序输出一个字符串，并使用 || 分隔每个答案（示例：答案1||答案2||答案3）`

type AITextRequest struct {
	QuestionNum int
	Title       string
	Description string
	BlankCount  int
}

type AITextResolver interface {
	ResolveText(ctx context.Context, profile model.AIProfile, persona *model.Persona, request AITextRequest) ([]string, error)
}

type AITextResolverFunc func(ctx context.Context, profile model.AIProfile, persona *model.Persona, request AITextRequest) ([]string, error)

func (fn AITextResolverFunc) ResolveText(ctx context.Context, profile model.AIProfile, persona *model.Persona, request AITextRequest) ([]string, error) {
	return fn(ctx, profile, persona, request)
}

type FreeAIIdentityProvider interface {
	FreeAIIdentity(ctx context.Context) (userID int, deviceID string, err error)
}

type FreeAIIdentityProviderFunc func(ctx context.Context) (userID int, deviceID string, err error)

func (fn FreeAIIdentityProviderFunc) FreeAIIdentity(ctx context.Context) (int, string, error) {
	return fn(ctx)
}

func (c *Client) resolveAIText(ctx context.Context, submission model.SubmissionContext, request AITextRequest) ([]string, error) {
	profile := submission.AIProfile
	if c != nil && c.aiTextResolver != nil {
		return c.aiTextResolver.ResolveText(ctx, profile, submission.Persona, request)
	}
	return c.defaultAITextResolver(ctx, profile, submission.Persona, request)
}

func (c *Client) resolveAIProfile(profile model.AIProfile) model.AIProfile {
	if c == nil {
		return profile
	}
	if strings.TrimSpace(profile.APIKey) == "" {
		profile.APIKey = c.aiAPIKey
	}
	if strings.TrimSpace(profile.BaseURL) == "" {
		profile.BaseURL = c.aiBaseURL
	}
	if strings.TrimSpace(profile.Model) == "" {
		profile.Model = c.aiModel
	}
	return profile
}

func (c *Client) defaultAITextResolver(ctx context.Context, profile model.AIProfile, persona *model.Persona, request AITextRequest) ([]string, error) {
	profile = c.resolveAIProfile(profile)
	mode := strings.ToLower(strings.TrimSpace(profile.Mode))
	if mode == "" {
		mode = aiModeFree
	}
	if mode == aiModeFree {
		return c.callFreeAI(ctx, profile, persona, request)
	}
	return c.callProviderAI(ctx, profile, persona, request)
}

func (c *Client) TestAIConnection(ctx context.Context, profile model.AIProfile) (string, error) {
	answers, err := c.resolveAIText(ctx, model.SubmissionContext{AIProfile: profile}, AITextRequest{
		Title:      "这是一个测试问题，请回复'连接成功'",
		BlankCount: 1,
	})
	if err != nil {
		return "", err
	}
	preview := ""
	if len(answers) > 0 {
		preview = strings.TrimSpace(answers[0])
	}
	if preview == "" {
		return "", fmt.Errorf("AI 未返回答案")
	}
	return fmt.Sprintf("连接成功！AI 回复: %s...", truncateRunes(preview, 50)), nil
}
