package surveycore

import (
	"fmt"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

func aiQuestionPrompt(persona *model.Persona, request AITextRequest) string {
	parts := make([]string, 0, 3)
	if persona != nil {
		parts = append(parts, "你扮演的角色是："+persona.Description()+"。")
	}
	title := strings.TrimSpace(request.Title)
	if title == "" && request.QuestionNum > 0 {
		title = fmt.Sprintf("第%d题", request.QuestionNum)
	}
	if desc := strings.TrimSpace(request.Description); desc != "" && !strings.Contains(title, desc) {
		title = strings.TrimSpace(title + "\n补充说明：" + desc)
	}
	parts = append(parts, title)
	if request.BlankCount > 1 {
		parts = append(parts, fmt.Sprintf("请按顺序给出 %d 个空位答案，用 || 分隔。", request.BlankCount))
		return strings.Join(parts, "\n")
	}
	parts = append(parts, "请只输出最终答案。")
	return strings.Join(parts, "\n")
}

func aiQuestionType(blankCount int) string {
	if blankCount > 1 {
		return "multi_fill_blank"
	}
	return "fill_blank"
}

func normalizeProviderAnswer(raw string, blankCount int) ([]string, error) {
	if blankCount <= 1 {
		text := strings.TrimSpace(raw)
		if text == "" {
			return nil, fmt.Errorf("AI 未返回答案")
		}
		return []string{text}, nil
	}
	parts := strings.Split(raw, "||")
	answers := make([]string, 0, len(parts))
	for _, part := range parts {
		if text := strings.TrimSpace(part); text != "" {
			answers = append(answers, text)
		}
	}
	return normalizeAIAnswers(answers, blankCount)
}

func normalizeAIAnswers(raw []string, blankCount int) ([]string, error) {
	if blankCount <= 0 {
		blankCount = 1
	}
	answers := make([]string, 0, len(raw))
	for _, item := range raw {
		if text := strings.TrimSpace(item); text != "" {
			answers = append(answers, text)
		}
	}
	if len(answers) == 0 {
		return nil, fmt.Errorf("AI 未返回答案")
	}
	if blankCount > 1 && len(answers) != blankCount {
		return nil, fmt.Errorf("AI 返回答案数量不匹配：期望 %d，实际 %d", blankCount, len(answers))
	}
	if blankCount == 1 && len(answers) > 1 {
		return answers[:1], nil
	}
	return answers, nil
}

func defaultAISystemPromptForMode(mode string) string {
	if strings.ToLower(strings.TrimSpace(mode)) == aiModeProvider {
		return defaultAISystemPromptProvider
	}
	return defaultAISystemPromptBase
}

func truncateRunes(value string, limit int) string {
	if limit <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if text := strings.TrimSpace(value); text != "" {
			return text
		}
	}
	return ""
}
