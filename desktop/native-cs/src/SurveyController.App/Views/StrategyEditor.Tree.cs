using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Text;
using Microsoft.Windows.BadgeNotifications;

namespace SurveyController.App.Views;

/// <summary>题目树构建、搜索与选择，对照 C++ StrategyEditor.Tree.cpp。</summary>
public sealed partial class StrategyEditor
{
    private void RebuildQuestionTree(int selectedIndex)
    {
        QuestionTree.RootNodes.Clear();
        _questionNodes.Clear();
        _treeTargets.Clear();

        var questions = Document.Questions();
        if (questions.Count == 0)
        {
            _questionIndex = -1;
            UpdateTaskbarBadge(0);
            return;
        }

        var hasUnknownLogic = false;
        var unsupportedCount = 0;
        var maxQuestionNumber = 0;
        var questionIndices = new Dictionary<int, int>();
        for (var index = 0; index < questions.Count; index++)
        {
            var question = Document.QuestionAt(index) ?? new JsonObject();
            var status = JsonStr(question, "logic_parse_status", string.Empty);
            hasUnknownLogic |= status.ToLowerInvariant() == "unknown";
            unsupportedCount += questions[index].Unsupported ? 1 : 0;
            maxQuestionNumber = Math.Max(maxQuestionNumber, questions[index].Number);
            questionIndices.TryAdd(questions[index].Number, index);
        }

        var pages = new Dictionary<int, TreeViewNode>();
        TreeViewNode PageNode(int page)
        {
            if (pages.TryGetValue(page, out var existing))
            {
                return existing;
            }
            var node = new TreeViewNode
            {
                Content = $"第 {page} 页",
                IsExpanded = true,
            };
            QuestionTree.RootNodes.Add(node);
            pages[page] = node;
            return node;
        }

        void AppendRelation(TreeViewNode parent, string label, int targetIndex)
        {
            var node = new TreeViewNode { Content = label };
            parent.Children.Add(node);
            _treeTargets.Add((node, targetIndex));
        }

        for (var index = 0; index < questions.Count; index++)
        {
            var summary = questions[index];
            var question = Document.QuestionAt(index) ?? new JsonObject();
            var parent = PageNode(Math.Max(1, (int)JsonNumber(question, "page", 1)));

            var node = new TreeViewNode { Content = BuildQuestionNodeContent(summary) };
            parent.Children.Add(node);
            _questionNodes.Add(node);
            _treeTargets.Add((node, index));

            if (!hasUnknownLogic)
            {
                foreach (var value in JsonArrayField(question, "controls_display_targets"))
                {
                    if (value is not JsonObject target)
                    {
                        continue;
                    }
                    var targetNumber = (int)JsonNumber(target, "target_question_num", 0);
                    if (targetNumber <= 0)
                    {
                        continue;
                    }
                    var targetIndex = questionIndices.GetValueOrDefault(targetNumber, index);
                    var optionIndices = target["condition_option_indices"] as JsonArray ?? [];
                    AppendRelation(node,
                        $"条件 · 选中{OptionLabel(question, optionIndices)} → 显示第 {targetNumber} 题",
                        targetIndex);
                }

                foreach (var value in JsonArrayField(question, "jump_rules"))
                {
                    if (value is not JsonObject rule)
                    {
                        continue;
                    }
                    var targetNumber = (int)JsonNumber(rule, "jumpto", 0);
                    if (targetNumber <= 0)
                    {
                        continue;
                    }
                    var optionIndex = new JsonArray { JsonNumber(rule, "option_index", -1) };
                    var endsSurvey = JsonBool(rule, "terminates_survey") || targetNumber > maxQuestionNumber;
                    var targetIndex = !endsSurvey && questionIndices.TryGetValue(targetNumber, out var found)
                        ? found
                        : index;
                    var targetLabel = endsSurvey ? "结束" : $"第 {targetNumber} 题";
                    AppendRelation(node,
                        $"跳题 · 选中{OptionLabel(question, optionIndex)} → {targetLabel}",
                        targetIndex);
                }
            }
            node.IsExpanded = node.Children.Count > 0;
        }

        if (QuestionTree.RootNodes.Count == 0)
        {
            _questionIndex = -1;
            UpdateTaskbarBadge((uint)unsupportedCount);
            QuestionTitle.Text = "没有匹配的题目";
            QuestionMeta.Text = "清空搜索框后显示全部题目";
            QuestionCountSummary.Text = $"0 / {questions.Count} 题";
            return;
        }
        UpdateTaskbarBadge((uint)unsupportedCount);
        var validIndex = selectedIndex >= 0 && selectedIndex < questions.Count ? selectedIndex : -1;
        if (validIndex < 0)
        {
            validIndex = 0;
        }
        SelectQuestion(validIndex);
    }

    private void SelectQuestion(int index)
    {
        if (index < 0 || index >= _questionNodes.Count)
        {
            return;
        }
        if (_questionIndex >= 0 && _questionIndex != index && !SaveCurrentQuestion())
        {
            SetTreeSelection(_questionIndex);
            return;
        }
        _questionIndex = index;
        QuestionCountSummary.Text = $"第 {index + 1} / {_questionNodes.Count} 题";
        PreviousQuestionButton.IsEnabled = index > 0;
        NextQuestionButton.IsEnabled = index + 1 < _questionNodes.Count;
        SetTreeSelection(index);
        LoadQuestion();
    }

    private void SetTreeSelection(int index)
    {
        if (index < 0 || index >= _questionNodes.Count)
        {
            return;
        }
        var node = _questionNodes[index];
        if (!ReferenceEquals(QuestionTree.SelectedNode, node))
        {
            _syncingTreeSelection = true;
            QuestionTree.SelectedNode = node;
            _syncingTreeSelection = false;
        }
    }

    private void OnQuestionSearchChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        if (args.Reason != AutoSuggestionBoxTextChangeReason.UserInput)
        {
            return;
        }
        var suggestions = new List<string>();
        var questions = Document.Questions();
        for (var index = 0; index < questions.Count; index++)
        {
            var question = questions[index];
            var raw = Document.QuestionAt(index) ?? new JsonObject();
            if (!ContainsText(raw, sender.Text, question.Number))
            {
                continue;
            }
            suggestions.Add($"第 {question.Number} · {question.Type} · {ShortTitle(question.Title)}"
                + (question.LogicSummary.Length == 0 ? "" : $" · {question.LogicSummary}"));
            if (suggestions.Count >= 12)
            {
                break;
            }
        }
        sender.ItemsSource = suggestions;
    }

    private void OnQuestionSuggestionChosen(AutoSuggestBox sender, AutoSuggestBoxSuggestionChosenEventArgs args)
    {
        SelectBySuggestionText(args.SelectedItem?.ToString() ?? string.Empty);
    }

    private void OnQuestionQuerySubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
    {
        var text = args.ChosenSuggestion?.ToString() ?? args.QueryText;
        if (text.Length == 0)
        {
            return;
        }
        // 候选项形如“第 N · …”；纯文本则按内容模糊匹配第一题。
        if (text.StartsWith('第') && TrySelectByNumber(text)) 
        {
            return;
        }
        var questions = Document.Questions();
        for (var index = 0; index < questions.Count; index++)
        {
            if (ContainsText(Document.QuestionAt(index) ?? new JsonObject(), text, questions[index].Number))
            {
                SelectQuestion(index);
                return;
            }
        }
    }

    private bool TrySelectByNumber(string text)
    {
        var separator = text.IndexOf(' ');
        if (separator < 2)
        {
            return false;
        }
        if (!int.TryParse(text.Substring(1, separator - 1), out var number))
        {
            return false;
        }
        var questions = Document.Questions();
        for (var index = 0; index < questions.Count; index++)
        {
            if (questions[index].Number == number)
            {
                SelectQuestion(index);
                return true;
            }
        }
        return false;
    }

    private void SelectBySuggestionText(string selectedText)
    {
        if (selectedText.Length == 0)
        {
            return;
        }
        TrySelectByNumber(selectedText);
    }

    private void OnQuestionSelected(object sender, TreeViewSelectionChangedEventArgs e)
    {
        if (_syncingTreeSelection)
        {
            return;
        }
        var node = QuestionTree.SelectedNode;
        if (node is null)
        {
            return;
        }
        foreach (var (candidate, targetIndex) in _treeTargets)
        {
            if (ReferenceEquals(candidate, node))
            {
                _ = DispatcherQueue.TryEnqueue(() =>
                {
                    if (targetIndex >= 0 && targetIndex < _questionNodes.Count)
                    {
                        try
                        {
                            SelectQuestion(targetIndex);
                        }
                        catch (Exception error)
                        {
                            ShowSwitchError(error.Message.Length > 0 ? error.Message : "题目状态已更新，请重新选择。");
                        }
                    }
                });
                return;
            }
        }
    }

    private void OnQuestionInvoked(TreeView sender, TreeViewItemInvokedEventArgs args)
    {
        if (args.InvokedItem is not TreeViewNode node)
        {
            return;
        }
        foreach (var (candidate, targetIndex) in _treeTargets)
        {
            if (ReferenceEquals(candidate, node))
            {
                _ = DispatcherQueue.TryEnqueue(() =>
                {
                    if (targetIndex >= 0 && targetIndex < _questionNodes.Count)
                    {
                        try
                        {
                            SelectQuestion(targetIndex);
                        }
                        catch (Exception)
                        {
                            ShowSwitchError("题目状态已更新，请重新选择。");
                        }
                    }
                });
                return;
            }
        }
    }

    private void ShowSwitchError(string message)
    {
        QuestionStatus.Severity = InfoBarSeverity.Error;
        QuestionStatus.Title = "切换题目失败";
        QuestionStatus.Message = message;
        QuestionStatus.IsOpen = true;
    }

    private void OnPreviousQuestion(object sender, RoutedEventArgs e)
    {
        if (_questionIndex > 0)
        {
            SelectQuestion(_questionIndex - 1);
        }
    }

    private void OnNextQuestion(object sender, RoutedEventArgs e)
    {
        if (_questionIndex >= 0 && _questionIndex + 1 < _questionNodes.Count)
        {
            SelectQuestion(_questionIndex + 1);
        }
    }

    // —— 节点视觉 ——

    internal static string ShortTitle(string value)
    {
        var title = value.Length == 0 ? "未命名题目" : value;
        const int limit = 24;
        return title.Length > limit ? title[..(limit - 1)] + "…" : title;
    }

    private static string OptionLabel(JsonObject question, JsonArray indices)
    {
        var optionTexts = question["option_texts"] as JsonArray ?? [];
        var result = string.Empty;
        var count = 0;
        foreach (var value in indices)
        {
            if (value is not System.Text.Json.Nodes.JsonValue || !value.TryGetValue<double>(out var raw))
            {
                continue;
            }
            var index = (int)raw;
            if (index < 0)
            {
                continue;
            }
            if (count++ > 0)
            {
                result += "、";
            }
            result += index < optionTexts.Count
                ? $"“{ShortTitle(AsString(optionTexts[index]))}”"
                : $"第 {index + 1} 项";
            if (count == 3 && indices.Count > 3)
            {
                result += $"等{indices.Count}项";
                break;
            }
        }
        return result.Length == 0 ? "指定选项" : result;
    }

    private static bool ContainsText(JsonObject question, string query, int number)
    {
        var needle = query.ToLowerInvariant();
        if (needle.Length == 0)
        {
            return true;
        }
        var haystack = $"{number} {JsonStr(question, "title", string.Empty)}";
        foreach (var value in question["option_texts"] as JsonArray ?? [])
        {
            if (value is System.Text.Json.Nodes.JsonValue text)
            {
                haystack += " " + AsString(text);
            }
        }
        return haystack.ToLowerInvariant().Contains(needle, StringComparison.Ordinal);
    }

    private static (string ForegroundKey, string BadgeForegroundKey, string BackgroundKey) QuestionBrushKeys(string type) =>
        type switch
        {
            "single" or "multiple" or "dropdown" => ("QuestionChoiceBrush", "QuestionChoiceBadgeForegroundBrush", "QuestionChoiceBadgeBackgroundBrush"),
            "text" or "multi_text" or "location" => ("QuestionTextBrush", "QuestionTextBadgeForegroundBrush", "QuestionTextBadgeBackgroundBrush"),
            "scale" or "slider" => ("QuestionScaleBrush", "QuestionScaleBadgeForegroundBrush", "QuestionScaleBadgeBackgroundBrush"),
            "matrix" => ("QuestionMatrixBrush", "QuestionMatrixBadgeForegroundBrush", "QuestionMatrixBadgeBackgroundBrush"),
            "sort" => ("QuestionSortBrush", "QuestionSortBadgeForegroundBrush", "QuestionSortBadgeBackgroundBrush"),
            _ => ("QuestionUnknownBrush", "QuestionUnknownBadgeForegroundBrush", "QuestionUnknownBadgeBackgroundBrush"),
        };

    private static StackPanel BuildQuestionNodeContent(WizardQuestion question)
    {
        var (foregroundKey, badgeForegroundKey, backgroundKey) = QuestionBrushKeys(question.NormalizedType);
        var resources = Application.Current.Resources;
        var foreground = resources[foregroundKey] as Brush;
        var badgeForeground = resources[badgeForegroundKey] as Brush;
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 7 };

        row.Children.Add(new FontIcon
        {
            Glyph = question.Icon,
            FontSize = 14,
            Foreground = foreground,
        });
        row.Children.Add(new InfoBadge
        {
            Width = 8,
            Height = 8,
            VerticalAlignment = VerticalAlignment.Center,
            Background = resources[backgroundKey] as Brush,
        });
        row.Children.Add(new TextBlock
        {
            Text = question.Type,
            FontSize = 12,
            FontWeight = FontWeights.SemiBold,
            Foreground = badgeForeground,
        });
        row.Children.Add(new TextBlock
        {
            Text = $"{question.Number}. {ShortTitle(question.Title)}",
            TextTrimming = TextTrimming.CharacterEllipsis,
        });

        void AppendStatus(string label, string brushKey)
        {
            // 官方元素组合的轻量状态徽标：文本 + 主题画刷背景（替代自绘模板）。
            row.Children.Add(new TextBlock
            {
                Text = label,
                Style = Application.Current.Resources["WizardBadgeTextStyle"] as Style,
                Background = resources[brushKey] as Brush,
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(5, 1, 5, 2),
                Margin = new Thickness(2, 0, 0, 0),
            });
        }
        if (question.Required)
        {
            AppendStatus("必答", "RequiredBadgeForegroundBrush");
        }
        if (question.HasJump || question.HasDisplayLogic)
        {
            AppendStatus("逻辑", "LogicBadgeForegroundBrush");
        }
        if (question.Unsupported)
        {
            AppendStatus("不支持", "UnsupportedBadgeForegroundBrush");
        }
        AutomationProperties.SetName(row, $"第 {question.Number} 题，{question.Type}，{question.Title}");
        return row;
    }

    private static void UpdateTaskbarBadge(uint unsupportedCount)
    {
        try
        {
            var manager = BadgeNotificationManager.Current();
            if (unsupportedCount == 0)
            {
                manager.ClearBadge();
            }
            else
            {
                manager.SetBadgeAsCount(unsupportedCount);
            }
        }
        catch (Exception)
        {
        }
    }
}
