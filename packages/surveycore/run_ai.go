package surveycore

import (
	"context"
	"fmt"
	"strings"

	"surveycontroller/surveycore/internal/model"
)

func (c *Client) prepareAIExecution(ctx context.Context, cfg *RunRequest, options ExecutionOptions) (*RunRequest, ExecutionOptions, error) {
	if cfg == nil {
		return nil, options, fmt.Errorf("%w: 配置为空", ErrInvalidConfig)
	}
	runCfg := *cfg
	if runCfg.ReverseFillPlan.Enabled || !hasAIEntries(runCfg.AnswerPlan.Strategies) {
		return &runCfg, options, nil
	}
	if len(runCfg.SurveyDefinition.Questions) == 0 {
		definition, err := c.Parse(ctx, runCfg.SurveySource.URL)
		if err != nil {
			return nil, options, fmt.Errorf("%w: AI 作答需要先解析问卷: %v", ErrParseFailed, err)
		}
		populateConfigSurveyDefinition(&runCfg, definition)
	}
	configure := options.ConfigureJob
	options.ConfigureJob = func(ctx context.Context, jobIndex int, attempt int, job *JobRequest) error {
		if configure != nil {
			if err := configure(ctx, jobIndex, attempt, job); err != nil {
				return err
			}
		}
		entries, err := c.applyAITextAnswers(ctx, job.Answers, job.Submission)
		if err != nil {
			return err
		}
		job.Answers.Strategies = entries
		return nil
	}
	return &runCfg, options, nil
}

func (c *Client) applyAITextAnswers(ctx context.Context, plan model.AnswerPlan, submission model.SubmissionRequest) ([]QuestionStrategy, error) {
	entries := cloneQuestionStrategies(plan.Strategies)
	questions := map[int]QuestionMeta{}
	for _, question := range submission.Definition.Questions {
		questions[question.Num] = question
	}
	for index := range entries {
		entry := &entries[index]
		if !entryAIEnabled(*entry) {
			if err := c.applyAIOptionFillTexts(ctx, submission, entry, questions, index); err != nil {
				return nil, err
			}
			continue
		}
		questionNum, question := resolveAIQuestion(*entry, questions, index)
		blankCount := textBlankCount(question, *entry)
		answers, err := c.resolveAIText(ctx, submission.Context, AITextRequest{
			QuestionNum: questionNum,
			Title:       firstText(question.Title, derefString(entry.QuestionTitle)),
			Description: question.Description,
			BlankCount:  blankCount,
		})
		if err != nil {
			return nil, fmt.Errorf("%w: 第%d题 AI 作答失败: %v", ErrPrepareConfigFailed, questionNum, err)
		}
		entry.QuestionType = "text"
		entry.Texts = answers
		entry.Probabilities = model.OptionWeights(1)
		if err := c.applyAIOptionFillTexts(ctx, submission, entry, questions, index); err != nil {
			return nil, err
		}
	}
	return entries, nil
}

func hasAIEntries(entries []QuestionStrategy) bool {
	for _, entry := range entries {
		if entryAIEnabled(entry) || entryHasAIOptionFill(entry) {
			return true
		}
	}
	return false
}

func entryAIEnabled(entry QuestionStrategy) bool {
	kind := strings.TrimSpace(string(entry.QuestionType))
	if kind != "text" && kind != "multi_text" {
		return false
	}
	if entry.AIEnabled {
		return true
	}
	if len(entry.MultiTextBlankAIFlags) == 0 {
		return false
	}
	for _, flag := range entry.MultiTextBlankAIFlags {
		if !flag {
			return false
		}
	}
	return true
}

func entryHasAIOptionFill(entry QuestionStrategy) bool {
	for _, value := range entry.OptionFillTexts {
		if value != nil && strings.TrimSpace(*value) == optionFillAIToken {
			return true
		}
	}
	return false
}

func (c *Client) applyAIOptionFillTexts(ctx context.Context, submission model.SubmissionRequest, entry *QuestionStrategy, questions map[int]QuestionMeta, entryIndex int) error {
	if entry == nil || !entryHasAIOptionFill(*entry) {
		return nil
	}
	questionNum, question := resolveAIQuestion(*entry, questions, entryIndex)
	for optionIndex, value := range entry.OptionFillTexts {
		if value == nil || strings.TrimSpace(*value) != optionFillAIToken {
			continue
		}
		title := firstText(question.Title, derefString(entry.QuestionTitle), fmt.Sprintf("第%d题", questionNum))
		if optionIndex >= 0 && optionIndex < len(question.OptionTexts) {
			if optionText := strings.TrimSpace(question.OptionTexts[optionIndex]); optionText != "" {
				title += "\n选项：" + optionText
			}
		}
		answers, err := c.resolveAIText(ctx, submission.Context, AITextRequest{
			QuestionNum: questionNum,
			Title:       title,
			Description: question.Description,
			BlankCount:  1,
		})
		if err != nil {
			return fmt.Errorf("%w: 第%d题第%d个选项 AI 填空失败: %v", ErrPrepareConfigFailed, questionNum, optionIndex+1, err)
		}
		text := answers[0]
		entry.OptionFillTexts[optionIndex] = &text
	}
	return nil
}

func resolveAIQuestion(entry QuestionStrategy, questions map[int]QuestionMeta, entryIndex int) (int, QuestionMeta) {
	questionNum := entryIndex + 1
	if entry.QuestionNum != nil && *entry.QuestionNum > 0 {
		questionNum = *entry.QuestionNum
	}
	question := questions[questionNum]
	if question.Num == 0 {
		question.Num = questionNum
		if entry.QuestionTitle != nil {
			question.Title = *entry.QuestionTitle
		}
		question.TextInputs = maxInt(1, len(entry.Texts))
	}
	return questionNum, question
}

func textBlankCount(question QuestionMeta, entry QuestionStrategy) int {
	if question.TextInputs > 0 {
		return question.TextInputs
	}
	if len(entry.MultiTextBlankAIFlags) > 0 {
		return len(entry.MultiTextBlankAIFlags)
	}
	if len(entry.Texts) > 1 {
		return len(entry.Texts)
	}
	return 1
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func firstText(values ...string) string {
	for _, value := range values {
		if text := strings.TrimSpace(value); text != "" {
			return text
		}
	}
	return ""
}
