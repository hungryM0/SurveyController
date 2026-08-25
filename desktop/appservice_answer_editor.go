package main

import (
	"fmt"
	"sort"
	"strings"

	configio "github.com/SurveyController/SurveyCore/pkg/surveycore/config"
	"github.com/SurveyController/SurveyCore/pkg/surveycore/model"
)

func (s *AppService) BuildAnswerEditorView(request BuildAnswerEditorViewRequest) (AnswerEditorView, error) {
	if request.Config.SchemaVersion != configio.ConfigSchemaVersion {
		return AnswerEditorView{}, fmt.Errorf("不支持的配置版本：%d", request.Config.SchemaVersion)
	}
	strategies := make(map[int]model.QuestionStrategy, len(request.Config.Answers.Strategies))
	for _, strategy := range request.Config.Answers.Strategies {
		if strategy.QuestionNum != nil {
			strategies[*strategy.QuestionNum] = strategy
		}
	}

	questions := make([]model.QuestionMeta, 0, len(request.Config.Survey.Definition.Questions))
	pageCounts := map[int]int{}
	for _, question := range request.Config.Survey.Definition.Questions {
		if question.IsDescription {
			continue
		}
		question.Page = maxInt(1, question.Page)
		questions = append(questions, question)
		pageCounts[question.Page]++
	}

	relations := buildAnswerEditorRelations(questions)
	view := AnswerEditorView{Questions: make([]AnswerEditorQuestionView, 0, len(questions))}
	pageQuestions := map[int][]int{}
	for _, question := range questions {
		strategy, hasStrategy := strategies[question.Num]
		questionType := model.QuestionKind("unsupported")
		if hasStrategy && strings.TrimSpace(string(strategy.QuestionType)) != "" {
			questionType = strategy.QuestionType
		}
		unsupported := question.Unsupported || !hasStrategy || questionType == "unsupported"
		unsupportedReason := strings.TrimSpace(question.UnsupportedReason)
		if !hasStrategy {
			unsupportedReason = "该题没有可编辑的答案策略"
		}
		var strategyCopy *model.QuestionStrategy
		if hasStrategy {
			cloned := model.CloneQuestionStrategies([]model.QuestionStrategy{strategy})[0]
			strategyCopy = &cloned
		}
		inbound, outbound := relationsForQuestion(relations, question.Num)
		logicSummary := answerEditorLogicSummary(question, inbound, outbound)
		item := AnswerEditorQuestionView{
			Number:            question.Num,
			Page:              question.Page,
			PageQuestionCount: pageCounts[question.Page],
			Title:             question.Title,
			Description:       question.Description,
			QuestionType:      questionType,
			QuestionTypeLabel: answerEditorQuestionTypeLabel(questionType),
			Required:          question.Required,
			Unsupported:       unsupported,
			UnsupportedReason: unsupportedReason,
			OptionTexts:       append([]string(nil), question.OptionTexts...),
			RowTexts:          append([]string(nil), question.RowTexts...),
			Strategy:          strategyCopy,
			LogicSummary:      logicSummary,
			InboundRelations:  inbound,
			OutboundRelations: outbound,
		}
		item.SearchSegments = answerEditorSearchSegments(item)
		view.Questions = append(view.Questions, item)
		pageQuestions[question.Page] = append(pageQuestions[question.Page], question.Num)
	}

	pages := make([]int, 0, len(pageQuestions))
	for page := range pageQuestions {
		pages = append(pages, page)
	}
	sort.Ints(pages)
	view.Pages = make([]AnswerEditorPageView, 0, len(pages))
	for _, page := range pages {
		view.Pages = append(view.Pages, AnswerEditorPageView{
			Page:          page,
			QuestionCount: len(pageQuestions[page]),
			QuestionNums:  append([]int(nil), pageQuestions[page]...),
		})
	}
	return view, nil
}

func (s *AppService) ApplyAnswerEditorChanges(request ApplyAnswerEditorChangesRequest) (ApplyAnswerEditorChangesResult, error) {
	updated := request.Config
	updated.Survey.Definition = model.CloneSurveyDefinition(request.Config.Survey.Definition)
	updated.Answers = model.CloneAnswerPlan(request.Config.Answers)

	questionByNum := make(map[int]model.QuestionMeta, len(updated.Survey.Definition.Questions))
	for _, question := range updated.Survey.Definition.Questions {
		if !question.IsDescription {
			questionByNum[question.Num] = question
		}
	}
	strategyIndex := make(map[int]int, len(updated.Answers.Strategies))
	for index, strategy := range updated.Answers.Strategies {
		if strategy.QuestionNum != nil {
			strategyIndex[*strategy.QuestionNum] = index
		}
	}

	seen := map[int]struct{}{}
	errors := make([]AnswerEditorFieldError, 0)
	for _, draft := range request.Changes {
		if _, duplicate := seen[draft.QuestionNum]; duplicate {
			errors = append(errors, answerEditorFieldError(draft.QuestionNum, "questionNum", "同一题不能重复提交"))
			continue
		}
		seen[draft.QuestionNum] = struct{}{}
		question, exists := questionByNum[draft.QuestionNum]
		if !exists {
			errors = append(errors, answerEditorFieldError(draft.QuestionNum, "questionNum", "题号不存在"))
			continue
		}
		index, exists := strategyIndex[draft.QuestionNum]
		if !exists || question.Unsupported {
			errors = append(errors, answerEditorFieldError(draft.QuestionNum, "question", "该题暂不支持答案编辑"))
			continue
		}
		strategy := updated.Answers.Strategies[index]
		if validationErrors := validateAnswerEditorDraft(question, strategy, draft); len(validationErrors) > 0 {
			errors = append(errors, validationErrors...)
			continue
		}
		mergeAnswerEditorDraft(&strategy, draft)
		updated.Answers.Strategies[index] = strategy
	}
	if len(errors) > 0 {
		return ApplyAnswerEditorChangesResult{Errors: errors}, nil
	}
	if _, err := configio.RunRequestFromConfigDocument(updated); err != nil {
		return ApplyAnswerEditorChangesResult{Errors: []AnswerEditorFieldError{{Field: "config", Message: err.Error()}}}, nil
	}
	return ApplyAnswerEditorChangesResult{Config: &updated}, nil
}

func buildAnswerEditorRelations(questions []model.QuestionMeta) []AnswerEditorRelation {
	result := make([]AnswerEditorRelation, 0)
	seen := map[string]struct{}{}
	appendRelation := func(relation AnswerEditorRelation) {
		key := fmt.Sprintf("%s:%d:%d:%s", relation.Kind, relation.SourceQuestionNum, relation.TargetQuestionNum, relation.Summary)
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		relation.ID = fmt.Sprintf("answer-relation-%s-%d-%d-%d", relation.Kind, relation.SourceQuestionNum, relation.TargetQuestionNum, len(result)+1)
		result = append(result, relation)
	}
	for _, question := range questions {
		for _, rule := range question.JumpRules {
			target := rule.TargetQuestion
			terminates := rule.TerminatesSurvey || target <= 0
			option := answerEditorOptionText(rule.OptionIndex, rule.OptionText)
			summary := fmt.Sprintf("第 %d 题选择%s后跳到第 %d 题", question.Num, option, target)
			if terminates {
				summary = fmt.Sprintf("第 %d 题选择%s后结束问卷", question.Num, option)
				target = 0
			}
			appendRelation(AnswerEditorRelation{Kind: "jump", Label: "跳题", Summary: summary, SourceQuestionNum: question.Num, TargetQuestionNum: target, TerminatesSurvey: terminates})
		}
		for _, condition := range question.DisplayConditions {
			summary := fmt.Sprintf("第 %d 题的答案控制第 %d 题显示", condition.QuestionNum, question.Num)
			appendRelation(AnswerEditorRelation{Kind: "display", Label: "显示条件", Summary: summary, SourceQuestionNum: condition.QuestionNum, TargetQuestionNum: question.Num})
		}
		for _, control := range question.ControlsDisplayTargets {
			summary := fmt.Sprintf("第 %d 题的答案控制第 %d 题显示", question.Num, control.TargetQuestionNum)
			appendRelation(AnswerEditorRelation{Kind: "display", Label: "显示条件", Summary: summary, SourceQuestionNum: question.Num, TargetQuestionNum: control.TargetQuestionNum})
		}
	}
	return result
}

func relationsForQuestion(relations []AnswerEditorRelation, questionNum int) ([]AnswerEditorRelation, []AnswerEditorRelation) {
	var inbound []AnswerEditorRelation
	var outbound []AnswerEditorRelation
	for _, relation := range relations {
		if relation.TargetQuestionNum == questionNum {
			inbound = append(inbound, relation)
		}
		if relation.SourceQuestionNum == questionNum {
			outbound = append(outbound, relation)
		}
	}
	return inbound, outbound
}

func answerEditorLogicSummary(question model.QuestionMeta, inbound []AnswerEditorRelation, outbound []AnswerEditorRelation) string {
	parts := make([]string, 0, 3)
	if len(inbound) > 0 {
		parts = append(parts, fmt.Sprintf("%d 条入站关系", len(inbound)))
	}
	if len(outbound) > 0 {
		parts = append(parts, fmt.Sprintf("%d 条出站关系", len(outbound)))
	}
	if question.LogicStatus == model.LogicParseStatusUnknown {
		parts = append(parts, "部分逻辑未识别")
	}
	return strings.Join(parts, " · ")
}

func answerEditorSearchSegments(question AnswerEditorQuestionView) []AnswerEditorSearchSegment {
	segments := []AnswerEditorSearchSegment{{Kind: "title", Label: "题干", Text: question.Title}}
	for index, option := range question.OptionTexts {
		segments = append(segments, AnswerEditorSearchSegment{Kind: "option", Label: fmt.Sprintf("选项 %d", index+1), Text: option})
	}
	for index, row := range question.RowTexts {
		segments = append(segments, AnswerEditorSearchSegment{Kind: "row", Label: fmt.Sprintf("矩阵行 %d", index+1), Text: row})
	}
	for _, relation := range append(append([]AnswerEditorRelation(nil), question.InboundRelations...), question.OutboundRelations...) {
		segments = append(segments, AnswerEditorSearchSegment{Kind: "logic", Label: relation.Label, Text: relation.Summary})
	}
	if question.LogicSummary != "" {
		segments = append(segments, AnswerEditorSearchSegment{Kind: "logic", Label: "逻辑摘要", Text: question.LogicSummary})
	}
	return segments
}

func answerEditorQuestionTypeLabel(kind model.QuestionKind) string {
	switch kind {
	case model.QuestionKindSingle:
		return "单选题"
	case model.QuestionKindMultiple:
		return "多选题"
	case model.QuestionKindDropdown:
		return "下拉题"
	case model.QuestionKindScale:
		return "量表题"
	case model.QuestionKindScore:
		return "评分题"
	case model.QuestionKindMatrix:
		return "矩阵题"
	case model.QuestionKindOrder:
		return "排序题"
	case model.QuestionKindSlider:
		return "滑块题"
	case model.QuestionKindText:
		return "文本题"
	case model.QuestionKindMultiText:
		return "多项填空"
	default:
		return "暂不支持"
	}
}

func answerEditorOptionText(index int, text *string) string {
	if text != nil && strings.TrimSpace(*text) != "" {
		return fmt.Sprintf("“%s”", strings.TrimSpace(*text))
	}
	return fmt.Sprintf("选项 %d", index+1)
}

func validateAnswerEditorDraft(question model.QuestionMeta, strategy model.QuestionStrategy, draft AnswerEditorStrategyDraft) []AnswerEditorFieldError {
	var errors []AnswerEditorFieldError
	mode := strings.ToLower(strings.TrimSpace(draft.DistributionMode))
	if mode != "" && mode != "random" && mode != "custom" && mode != "reverse_fill" {
		errors = append(errors, answerEditorFieldError(draft.QuestionNum, "distributionMode", "分布模式无效"))
	}
	if err := draft.CustomWeights.Validate(); err != nil {
		errors = append(errors, answerEditorFieldError(draft.QuestionNum, "customWeights", err.Error()))
	}
	if mode == "custom" {
		errors = append(errors, validateAnswerEditorWeights(question, strategy, draft)...)
	}
	if strings.EqualFold(strings.TrimSpace(draft.TextRandomMode), "integer") {
		if len(draft.TextRandomIntRange) != 2 || draft.TextRandomIntRange[0] > draft.TextRandomIntRange[1] {
			errors = append(errors, answerEditorFieldError(draft.QuestionNum, "textRandomIntRange", "随机整数范围必须包含有效的最小值和最大值"))
		}
	}
	if strategy.QuestionType == model.QuestionKindMultiText {
		blankCount := maxInt(1, question.TextInputs)
		if len(draft.MultiTextBlankModes) > blankCount || len(draft.MultiTextBlankAIFlags) > blankCount || len(draft.MultiTextBlankIntRanges) > blankCount {
			errors = append(errors, answerEditorFieldError(draft.QuestionNum, "multiText", "多项填空设置超过题目空格数"))
		}
	}
	return errors
}

func validateAnswerEditorWeights(question model.QuestionMeta, strategy model.QuestionStrategy, draft AnswerEditorStrategyDraft) []AnswerEditorFieldError {
	var errors []AnswerEditorFieldError
	validateRow := func(field string, values []float64, expected int) {
		if expected > 0 && len(values) != expected {
			errors = append(errors, answerEditorFieldError(draft.QuestionNum, field, fmt.Sprintf("配比数量应为 %d", expected)))
			return
		}
		positive := false
		for _, value := range values {
			if value < 0 {
				errors = append(errors, answerEditorFieldError(draft.QuestionNum, field, "配比不能小于 0"))
				return
			}
			positive = positive || value > 0
		}
		if len(values) > 0 && !positive {
			errors = append(errors, answerEditorFieldError(draft.QuestionNum, field, "配比不能全部为 0"))
		}
	}
	if strategy.QuestionType == model.QuestionKindMatrix {
		expectedRows := maxInt(question.Rows, strategy.Rows)
		if expectedRows > 0 && len(draft.CustomWeights.Rows) != expectedRows {
			return []AnswerEditorFieldError{answerEditorFieldError(draft.QuestionNum, "customWeights.rows", fmt.Sprintf("矩阵配比行数应为 %d", expectedRows))}
		}
		for index, row := range draft.CustomWeights.Rows {
			validateRow(fmt.Sprintf("customWeights.rows.%d", index+1), row, maxInt(question.Options, strategy.OptionCount))
		}
		return errors
	}
	validateRow("customWeights.options", draft.CustomWeights.Options, maxInt(question.Options, strategy.OptionCount))
	return errors
}

func mergeAnswerEditorDraft(strategy *model.QuestionStrategy, draft AnswerEditorStrategyDraft) {
	strategy.DistributionMode = strings.TrimSpace(draft.DistributionMode)
	strategy.CustomWeights = draft.CustomWeights.Clone()
	strategy.Texts = append([]string(nil), draft.Texts...)
	strategy.AIEnabled = draft.AIEnabled
	strategy.OptionFillTexts = cloneAnswerEditorStringPointers(draft.OptionFillTexts)
	strategy.FillableOptionIndices = append([]int(nil), draft.FillableOptionIndices...)
	strategy.AttachedOptionSelects = model.CloneAttachedOptionSelects(draft.AttachedOptionSelects)
	strategy.LocationParts = append([]string(nil), draft.LocationParts...)
	strategy.MultiTextBlankModes = append([]string(nil), draft.MultiTextBlankModes...)
	strategy.MultiTextBlankAIFlags = append([]bool(nil), draft.MultiTextBlankAIFlags...)
	strategy.MultiTextBlankIntRanges = cloneAnswerEditorIntRows(draft.MultiTextBlankIntRanges)
	strategy.TextRandomMode = strings.TrimSpace(draft.TextRandomMode)
	strategy.TextRandomIntRange = append([]int(nil), draft.TextRandomIntRange...)
	strategy.Dimension = strings.TrimSpace(draft.Dimension)
	strategy.PsychoBias = strings.TrimSpace(draft.PsychoBias)
}

func answerEditorFieldError(questionNum int, field string, message string) AnswerEditorFieldError {
	return AnswerEditorFieldError{QuestionNum: questionNum, Field: field, Message: message}
}

func cloneAnswerEditorStringPointers(values []*string) []*string {
	if values == nil {
		return nil
	}
	result := make([]*string, len(values))
	for index, value := range values {
		if value != nil {
			cloned := *value
			result[index] = &cloned
		}
	}
	return result
}

func cloneAnswerEditorIntRows(values [][]int) [][]int {
	if values == nil {
		return nil
	}
	result := make([][]int, len(values))
	for index := range values {
		result[index] = append([]int(nil), values[index]...)
	}
	return result
}
