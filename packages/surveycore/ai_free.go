package surveycore

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

func (c *Client) callFreeAI(ctx context.Context, profile model.AIProfile, persona *model.Persona, request AITextRequest) ([]string, error) {
	if c == nil || c.freeAIIdentityProvider == nil {
		return nil, fmt.Errorf("免费 AI 需要桌面端官方会话")
	}
	userID, deviceID, err := c.freeAIIdentityProvider.FreeAIIdentity(ctx)
	if err != nil {
		return nil, err
	}
	if userID <= 0 || strings.TrimSpace(deviceID) == "" {
		return nil, fmt.Errorf("免费 AI 身份无效")
	}
	endpoint := strings.TrimSpace(profile.BaseURL)
	if endpoint == "" {
		endpoint = defaultFreeAIURL
	}
	payload := map[string]any{
		"user_id":          userID,
		"question_type":    aiQuestionType(request.BlankCount),
		"question_content": aiQuestionPrompt(persona, request),
	}
	if request.BlankCount > 1 {
		payload["blank_count"] = request.BlankCount
	}
	payload["system_prompt"] = firstNonEmpty(profile.SystemPrompt, defaultAISystemPromptForMode(aiModeFree))
	var response struct {
		Answers []string `json:"answers"`
		Detail  any      `json:"detail"`
		Error   any      `json:"error"`
		Message any      `json:"message"`
	}
	headers := map[string]string{
		"Content-Type": "application/json",
		"Accept":       "application/json",
		"User-Agent":   "SurveyController/Go",
		"X-Device-ID":  strings.TrimSpace(deviceID),
	}
	if err := c.doAIJSON(ctx, http.MethodPost, endpoint, headers, payload, &response); err != nil {
		return nil, err
	}
	return normalizeAIAnswers(response.Answers, request.BlankCount)
}
