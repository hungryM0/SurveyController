package surveycore

import (
	"context"
	"fmt"
	"strings"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
	"github.com/SurveyController/SurveyController/packages/surveycore/reversefill"
)

func (c *Client) prepareReverseFillExecution(ctx context.Context, cfg *RunRequest, provider string, options ExecutionOptions) (*RunRequest, ExecutionOptions, error) {
	if cfg == nil {
		return nil, options, fmt.Errorf("%w: 配置为空", ErrInvalidConfig)
	}
	runCfg := cloneRunRequest(cfg)
	if !runCfg.ReverseFillPlan.Enabled || strings.TrimSpace(runCfg.ReverseFillPlan.SourcePath) == "" {
		return &runCfg, options, nil
	}
	if provider != model.ProviderWJX {
		return nil, options, fmt.Errorf("%w: 反填 V1 目前只支持问卷星", ErrUnsupportedOperation)
	}
	if len(runCfg.SurveyDefinition.Questions) == 0 {
		definition, err := c.Parse(ctx, runCfg.SurveySource.URL)
		if err != nil {
			return nil, options, fmt.Errorf("%w: 反填需要先解析问卷: %v", ErrParseFailed, err)
		}
		populateConfigSurveyDefinition(&runCfg, definition)
	}
	ensureQuestionStrategies(&runCfg)

	target := options.Target
	if target <= 0 {
		target = runCfg.Target
	}
	if target <= 0 {
		target = 1
	}
	preview, err := reversefill.PreviewExcel(reversefill.PreviewOptions{
		Path:          runCfg.ReverseFillPlan.SourcePath,
		Format:        runCfg.ReverseFillPlan.Format,
		StartRow:      runCfg.ReverseFillPlan.StartRow,
		Questions:     runCfg.SurveyDefinition.Questions,
		MaxSampleRows: target,
	})
	if err != nil {
		return nil, options, fmt.Errorf("%w: 反填样本读取失败: %v", ErrPrepareConfigFailed, err)
	}
	if preview.TotalDataRows <= 0 {
		return nil, options, fmt.Errorf("%w: 反填起始行后没有可用样本", ErrPrepareConfigFailed)
	}
	if target > preview.TotalDataRows {
		return nil, options, fmt.Errorf("%w: 反填目标份数为 %d，但可用样本只有 %d 行", ErrPrepareConfigFailed, target, preview.TotalDataRows)
	}
	if len(preview.UnsupportedFields) > 0 {
		return nil, options, fmt.Errorf("%w: %s", ErrPrepareConfigFailed, preview.UnsupportedFields[0])
	}
	if len(preview.SampleRows) < target {
		return nil, options, fmt.Errorf("%w: 反填样本中可回放行数不足，目标 %d 行，可回放 %d 行", ErrPrepareConfigFailed, target, len(preview.SampleRows))
	}

	samples := append([]reversefill.SampleRow(nil), preview.SampleRows...)
	if runCfg.ReverseFillPlan.Threads > 0 {
		options.Threads = runCfg.ReverseFillPlan.Threads
	}
	options.Target = target
	runCfg.Target = target

	configure := options.ConfigureJob
	options.ConfigureJob = func(ctx context.Context, jobIndex int, attempt int, job *JobRequest) error {
		if configure != nil {
			if err := configure(ctx, jobIndex, attempt, job); err != nil {
				return err
			}
		}
		if jobIndex < 0 || jobIndex >= len(samples) {
			return fmt.Errorf("%w: 反填任务序号超出样本范围", ErrPrepareConfigFailed)
		}
		entries, err := applyReverseFillSample(job.Answers.Strategies, job.Submission.Definition.Questions, samples[jobIndex])
		if err != nil {
			return err
		}
		job.Answers.Strategies = entries
		return nil
	}
	return &runCfg, options, nil
}

func applyReverseFillSample(entries []QuestionStrategy, questions []QuestionMeta, sample reversefill.SampleRow) ([]QuestionStrategy, error) {
	cloned := cloneQuestionStrategies(entries)
	questionByNum := map[int]QuestionMeta{}
	for _, question := range questions {
		questionByNum[question.Num] = question
	}
	entryIndex := map[int]int{}
	for index, entry := range cloned {
		if entry.QuestionNum != nil {
			entryIndex[*entry.QuestionNum] = index
		}
	}
	for questionNum, answer := range sample.Answers {
		question, ok := questionByNum[questionNum]
		if !ok {
			continue
		}
		index, ok := entryIndex[questionNum]
		if !ok {
			defaults := buildDefaultQuestionStrategies([]QuestionMeta{question})
			if len(defaults) == 0 {
				continue
			}
			cloned = append(cloned, defaults[0])
			index = len(cloned) - 1
			entryIndex[questionNum] = index
		}
		entry := cloned[index]
		if err := applyReverseFillAnswer(&entry, question, answer); err != nil {
			return nil, err
		}
		cloned[index] = entry
	}
	return cloned, nil
}

func applyReverseFillAnswer(entry *QuestionStrategy, question QuestionMeta, answer reversefill.Answer) error {
	if entry.QuestionNum == nil {
		num := question.Num
		entry.QuestionNum = &num
	}
	if entry.ProviderQuestionID == nil && strings.TrimSpace(question.ProviderID) != "" {
		providerID := question.ProviderID
		entry.ProviderQuestionID = &providerID
	}
	entry.SurveyProvider = question.Provider
	entry.DistributionMode = "reverse_fill"

	switch answer.Kind {
	case reversefill.KindChoice:
		if answer.ChoiceIndex == nil {
			return fmt.Errorf("%w: 第%d题反填选项为空", ErrPrepareConfigFailed, question.Num)
		}
		values, err := oneHotProbabilities(question.Num, optionCountForReverseFill(question, *entry), *answer.ChoiceIndex)
		if err != nil {
			return err
		}
		entry.QuestionType = model.QuestionKind(questionTypeName(question))
		entry.OptionCount = len(values)
		entry.Probabilities = model.OptionWeights(values...)
	case reversefill.KindText:
		entry.QuestionType = "text"
		entry.Texts = []string{strings.TrimSpace(answer.TextValue)}
		entry.Probabilities = model.OptionWeights(1)
	case reversefill.KindMultiText:
		entry.QuestionType = "text"
		entry.Texts = append([]string(nil), answer.TextValues...)
		entry.Probabilities = model.OptionWeights(1)
	case reversefill.KindMatrix:
		values, err := matrixProbabilities(question, *entry, answer.MatrixChoiceIndexes)
		if err != nil {
			return err
		}
		entry.QuestionType = "matrix"
		entry.Rows = len(values)
		if len(values) > 0 {
			entry.OptionCount = len(values[0])
		}
		entry.Probabilities = model.RowWeights(values...)
	default:
		return fmt.Errorf("%w: 第%d题反填类型不支持：%s", ErrPrepareConfigFailed, question.Num, answer.Kind)
	}
	return nil
}

func optionCountForReverseFill(question QuestionMeta, entry QuestionStrategy) int {
	if question.Options > 0 {
		return question.Options
	}
	if entry.OptionCount > 0 {
		return entry.OptionCount
	}
	if values := probabilityValues(entry.Probabilities); len(values) > 0 {
		return len(values)
	}
	return 1
}

func matrixProbabilities(question QuestionMeta, entry QuestionStrategy, indexes []int) ([][]float64, error) {
	rows := question.Rows
	if rows <= 0 {
		rows = entry.Rows
	}
	if rows <= 0 {
		rows = len(indexes)
	}
	if rows <= 0 {
		rows = 1
	}
	if len(indexes) != rows {
		return nil, fmt.Errorf("%w: 第%d题矩阵反填行数为 %d，题目行数为 %d", ErrPrepareConfigFailed, question.Num, len(indexes), rows)
	}
	optionCount := optionCountForReverseFill(question, entry)
	result := make([][]float64, 0, rows)
	for _, index := range indexes {
		values, err := oneHotProbabilities(question.Num, optionCount, index)
		if err != nil {
			return nil, err
		}
		result = append(result, values)
	}
	return result, nil
}

func oneHotProbabilities(questionNum int, count int, index int) ([]float64, error) {
	if count <= 0 {
		count = 1
	}
	if index < 0 || index >= count {
		return nil, fmt.Errorf("%w: 第%d题选项序号 %d 超出范围", ErrPrepareConfigFailed, questionNum, index+1)
	}
	values := make([]float64, count)
	values[index] = 1
	return values, nil
}

func probabilityValues(raw model.WeightTable) []float64 {
	return raw.Values()
}
