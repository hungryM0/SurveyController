package surveycore

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"surveycontroller/surveycore/internal/model"
)

func (c *Client) callProviderAI(ctx context.Context, profile model.AIProfile, persona *model.Persona, request AITextRequest) ([]string, error) {
	profile = c.resolveAIProfile(profile)
	apiKey := strings.TrimSpace(profile.APIKey)
	if apiKey == "" {
		return nil, fmt.Errorf("AI 配置不完整：缺少 API Key")
	}
	provider := strings.ToLower(strings.TrimSpace(profile.Provider))
	baseURL := strings.TrimSpace(profile.BaseURL)
	if baseURL == "" && provider == aiProviderCustom {
		return nil, fmt.Errorf("AI 配置不完整：缺少 Base URL")
	}
	if baseURL == "" {
		baseURL = defaultDeepSeekURL
	}
	modelName := strings.TrimSpace(profile.Model)
	if modelName == "" && provider == aiProviderCustom {
		return nil, fmt.Errorf("AI 配置不完整：缺少模型 ID")
	}
	if modelName == "" {
		modelName = defaultDeepSeekModel
	}
	protocol, endpoint, explicit, err := resolveAIEndpoint(baseURL, profile.APIProtocol)
	if err != nil {
		return nil, err
	}
	if protocol == aiProtocolResponses {
		return c.callResponsesAI(ctx, profile, persona, request, endpoint, apiKey, modelName)
	}
	answers, err := c.callChatCompletionsAI(ctx, profile, persona, request, endpoint, apiKey, modelName)
	if err != nil && !explicit && normalizeAIAPIProtocol(profile.APIProtocol) == aiProtocolAuto && isEndpointMismatchError(err) {
		_, fallbackEndpoint, _, fallbackErr := resolveAIEndpoint(baseURL, aiProtocolResponses)
		if fallbackErr != nil {
			return nil, fallbackErr
		}
		return c.callResponsesAI(ctx, profile, persona, request, fallbackEndpoint, apiKey, modelName)
	}
	return answers, err
}

func (c *Client) callChatCompletionsAI(ctx context.Context, profile model.AIProfile, persona *model.Persona, request AITextRequest, endpoint string, apiKey string, modelName string) ([]string, error) {
	payload := map[string]any{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": firstNonEmpty(profile.SystemPrompt, defaultAISystemPromptForMode(aiModeProvider))},
			{"role": "user", "content": aiQuestionPrompt(persona, request)},
		},
		"max_tokens":  200,
		"temperature": 0.7,
	}
	var response struct {
		Choices []struct {
			Message struct {
				Content any `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error any `json:"error"`
	}
	headers := map[string]string{
		"Content-Type":  "application/json",
		"Accept":        "application/json",
		"Authorization": "Bearer " + apiKey,
	}
	if err := c.doAIJSON(ctx, http.MethodPost, endpoint, headers, payload, &response); err != nil {
		return nil, err
	}
	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("AI 未返回答案")
	}
	text := strings.Join(extractAITextParts(response.Choices[0].Message.Content), "\n")
	if strings.TrimSpace(text) == "" {
		return nil, fmt.Errorf("AI 未返回答案")
	}
	return normalizeProviderAnswer(text, request.BlankCount)
}

func (c *Client) callResponsesAI(ctx context.Context, profile model.AIProfile, persona *model.Persona, request AITextRequest, endpoint string, apiKey string, modelName string) ([]string, error) {
	payload := map[string]any{
		"model":             modelName,
		"instructions":      firstNonEmpty(profile.SystemPrompt, defaultAISystemPromptForMode(aiModeProvider)),
		"input":             aiQuestionPrompt(persona, request),
		"max_output_tokens": 200,
		"temperature":       0.7,
	}
	var response struct {
		OutputText string `json:"output_text"`
		Output     []struct {
			Content any `json:"content"`
		} `json:"output"`
		Error any `json:"error"`
	}
	headers := map[string]string{
		"Content-Type":  "application/json",
		"Accept":        "application/json",
		"Authorization": "Bearer " + apiKey,
	}
	if err := c.doAIJSON(ctx, http.MethodPost, endpoint, headers, payload, &response); err != nil {
		return nil, err
	}
	if text := strings.TrimSpace(response.OutputText); text != "" {
		return normalizeProviderAnswer(text, request.BlankCount)
	}
	for _, item := range response.Output {
		if text := strings.Join(extractAITextParts(item.Content), "\n"); strings.TrimSpace(text) != "" {
			return normalizeProviderAnswer(text, request.BlankCount)
		}
	}
	return nil, fmt.Errorf("AI 未返回答案")
}
