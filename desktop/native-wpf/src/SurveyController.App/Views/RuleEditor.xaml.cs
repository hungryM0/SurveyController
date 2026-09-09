using System.Globalization;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using ModernWpf.Controls;
using SurveyController.App.Controls;
using SurveyController.Core.Document;
using ListView = System.Windows.Controls.ListView;

namespace SurveyController.App.Views;

/// <summary>
/// 条件规则编辑器：列表 + 表单。规则校验由 Go 拥有，壳层只提交编辑草稿。
/// </summary>
public partial class RuleEditor : UserControl
{
    private readonly WizardDocument _document = WizardDocument.Current;
    private bool _isLoaded;
    private bool _updating;
    private bool _refreshPending;
    private int _ruleIndex = -1;
    private int _conditionNumber;
    private int _targetNumber;

    public RuleEditor()
    {
        InitializeComponent();
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        _isLoaded = true;
        try
        {
            if (_refreshPending || RuleList.Items.Count == 0)
            {
                Refresh();
            }
        }
        catch (Exception error)
        {
            RuleStatus.Severity = InfoBarSeverity.Error;
            RuleStatus.Title = "条件规则加载失败";
            RuleStatus.Message = error.Message;
            RuleStatus.IsOpen = true;
        }
    }

    public void Refresh()
    {
        if (!_isLoaded || _updating)
        {
            _refreshPending = true;
            return;
        }

        _updating = true;
        _refreshPending = false;
        try
        {
            RuleList.Items.Clear();
            var rules = _document.Rules() ?? [];
            for (var index = 0; index < rules.Count; index++)
            {
                if (rules[index] is JsonObject rule)
                {
                    RuleList.Items.Add(RuleLabel(rule, index));
                }
            }
            if (rules.Count == 0)
            {
                ClearRuleForm();
            }
            else
            {
                var candidate = _ruleIndex < 0 ? 0 : _ruleIndex;
                _ruleIndex = Math.Max(0, Math.Min(candidate, rules.Count - 1));
                RuleList.SelectedIndex = _ruleIndex;
                LoadRule();
            }
            UpdateCommandState();
        }
        finally
        {
            _updating = false;
        }
    }

    private void OnRuleSelected(object sender, SelectionChangedEventArgs e)
    {
        if (_updating)
        {
            return;
        }
        _ruleIndex = RuleList.SelectedIndex;
        LoadRule();
        UpdateCommandState();
    }

    private void OnNewRule(object sender, RoutedEventArgs e)
    {
        if (_updating)
        {
            return;
        }
        _updating = true;
        try
        {
            ClearRuleForm();
        }
        finally
        {
            _updating = false;
        }
    }

    private void ClearRuleForm()
    {
        _ruleIndex = -1;
        RuleList.SelectedIndex = -1;
        _conditionNumber = 0;
        _targetNumber = 0;
        ConditionQuestion.Text = "";
        TargetQuestion.Text = "";
        ConditionOptions.Items.Clear();
        TargetOptions.Items.Clear();
        ConditionRow.Visibility = Visibility.Collapsed;
        TargetRow.Visibility = Visibility.Collapsed;
        ConditionMode.SelectedIndex = 0;
        ActionMode.SelectedIndex = 0;
        RuleStatus.IsOpen = false;
        UpdateCommandState();
    }

    private void OnDeleteRule(object sender, RoutedEventArgs e)
    {
        if (!_isLoaded || _updating || _ruleIndex < 0)
        {
            return;
        }
        _document.DeleteRule(_ruleIndex);
        _ruleIndex = Math.Max(0, _ruleIndex - 1);
        Refresh();
    }

    private void OnMoveRuleUp(object sender, RoutedEventArgs e)
    {
        if (!_isLoaded || _updating)
        {
            return;
        }
        if (_ruleIndex > 0 && _document.MoveRuleUp(_ruleIndex))
        {
            _ruleIndex--;
        }
        Refresh();
    }

    private void OnMoveRuleDown(object sender, RoutedEventArgs e)
    {
        if (!_isLoaded || _updating)
        {
            return;
        }
        if (_ruleIndex >= 0 && _document.MoveRuleDown(_ruleIndex))
        {
            _ruleIndex++;
        }
        Refresh();
    }

    private void UpdateCommandState()
    {
        var count = (_document.Rules() ?? []).Count;
        var selected = _ruleIndex >= 0 && _ruleIndex < count;
        DeleteRuleButton.IsEnabled = selected;
        MoveRuleUpButton.IsEnabled = selected && _ruleIndex > 0;
        MoveRuleDownButton.IsEnabled = selected && _ruleIndex + 1 < count;
    }

    private void LoadQuestionPicker(AutoSuggestBox box, bool target)
    {
        var suggestions = new List<string>();
        var needle = box.Text.ToLowerInvariant();
        foreach (var question in _document.Questions())
        {
            if (question.Unsupported || question.Options <= 0)
            {
                continue;
            }
            if (target && _conditionNumber > 0 && question.Number <= _conditionNumber)
            {
                continue;
            }
            var label = QuestionLabel(question);
            if (needle.Length == 0 || label.ToLowerInvariant().Contains(needle))
            {
                suggestions.Add(label);
            }
            if (suggestions.Count >= 20)
            {
                break;
            }
        }
        box.ItemsSource = suggestions;
    }

    private void OnConditionQuestionTextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        if (args.Reason == AutoSuggestionBoxTextChangeReason.UserInput)
        {
            LoadQuestionPicker(ConditionQuestion, target: false);
        }
    }

    private void OnTargetQuestionTextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        if (args.Reason == AutoSuggestionBoxTextChangeReason.UserInput)
        {
            LoadQuestionPicker(TargetQuestion, target: true);
        }
    }

    private void OnConditionQuestionChosen(AutoSuggestBox sender, AutoSuggestBoxSuggestionChosenEventArgs args)
    {
        var label = args.SelectedItem?.ToString() ?? string.Empty;
        if (SelectQuestion(ParseQuestionNumber(label), target: false))
        {
            ConditionQuestion.Text = label;
        }
    }

    private void OnTargetQuestionChosen(AutoSuggestBox sender, AutoSuggestBoxSuggestionChosenEventArgs args)
    {
        var label = args.SelectedItem?.ToString() ?? string.Empty;
        if (SelectQuestion(ParseQuestionNumber(label), target: true))
        {
            TargetQuestion.Text = label;
        }
    }

    private void OnConditionQuestionSubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args) =>
        SubmitQuestionQuery(ConditionQuestion, args, target: false);

    private void OnTargetQuestionSubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args) =>
        SubmitQuestionQuery(TargetQuestion, args, target: true);

    private void SubmitQuestionQuery(AutoSuggestBox box, AutoSuggestBoxQuerySubmittedEventArgs args, bool target)
    {
        var text = args.ChosenSuggestion?.ToString() ?? args.QueryText;
        var number = ParseQuestionNumber(text);
        if (number > 0 && SelectQuestion(number, target))
        {
            foreach (var question in _document.Questions())
            {
                if (question.Number == number)
                {
                    box.Text = QuestionLabel(question);
                    return;
                }
            }
        }

        var needle = text.ToLowerInvariant();
        if (needle.Length == 0)
        {
            return;
        }
        foreach (var question in _document.Questions())
        {
            if (question.Unsupported || question.Options <= 0
                || (target && _conditionNumber > 0 && question.Number <= _conditionNumber))
            {
                continue;
            }
            var label = QuestionLabel(question);
            if (label.ToLowerInvariant().Contains(needle)
                && SelectQuestion(question.Number, target))
            {
                box.Text = label;
                return;
            }
        }
    }

    private bool SelectQuestion(int number, bool target)
    {
        if (!_isLoaded)
        {
            return false;
        }
        var options = target ? TargetOptions : ConditionOptions;
        var rows = target ? TargetRow : ConditionRow;
        options.SelectedItems.Clear();
        options.Items.Clear();
        rows.SelectedIndex = -1;
        rows.Items.Clear();
        foreach (var question in _document.Questions())
        {
            if (question.Number != number)
            {
                continue;
            }
            if (question.Unsupported || question.Options <= 0
                || (target && _conditionNumber > 0 && question.Number <= _conditionNumber))
            {
                return false;
            }
            if (target)
            {
                _targetNumber = number;
            }
            else
            {
                _conditionNumber = number;
            }
            for (var index = 0; index < question.Options; index++)
            {
                var label = index < question.OptionTexts.Count && question.OptionTexts[index].Length > 0
                    ? question.OptionTexts[index]
                    : $"选项 {index + 1}";
                options.Items.Add($"{index + 1}. {label}");
            }
            for (var index = 0; index < question.Rows; index++)
            {
                var label = index < question.RowTexts.Count && question.RowTexts[index].Length > 0
                    ? question.RowTexts[index]
                    : $"矩阵行 {index + 1}";
                rows.Items.Add(new ComboBoxItem { Content = $"{index + 1}. {label}", Tag = index });
            }
            rows.Visibility = question.Rows > 0 ? Visibility.Visible : Visibility.Collapsed;
            if (rows.Items.Count > 0)
            {
                rows.SelectedIndex = 0;
            }
            return true;
        }
        return false;
    }

    private JsonArray SelectedIndices(ListView list)
    {
        var result = new JsonArray();
        foreach (var selected in list.SelectedItems)
        {
            var index = list.Items.IndexOf(selected);
            if (index >= 0)
            {
                result.Add(index);
            }
        }
        return result;
    }

    private static string SelectedTag(RadioButtons buttons, string fallback) =>
        buttons.SelectedItem is RadioButton item && item.Tag is string tag ? tag : fallback;

    private static void SelectTag(RadioButtons buttons, string value)
    {
        for (var index = 0; index < buttons.Items.Count; index++)
        {
            if (buttons.Items[index] is RadioButton item && item.Tag as string == value)
            {
                buttons.SelectedIndex = index;
                return;
            }
        }
        buttons.SelectedIndex = 0;
    }

    private void LoadRule()
    {
        var rules = _document.Rules() ?? [];
        if (_ruleIndex < 0 || _ruleIndex >= rules.Count)
        {
            return;
        }
        if (rules[_ruleIndex] is not JsonObject rule)
        {
            return;
        }
        var conditionNumber = AsInt(rule["condition_question_num"]);
        var targetNumber = AsInt(rule["target_question_num"]);
        _conditionNumber = 0;
        _targetNumber = 0;
        SelectQuestion(conditionNumber, target: false);
        SelectQuestion(targetNumber, target: true);
        ConditionQuestion.Text = $"第 {_conditionNumber} 题";
        TargetQuestion.Text = $"第 {_targetNumber} 题";
        SelectTag(ConditionMode, JsonStr(rule, "condition_mode", "selected"));
        SelectTag(ActionMode, JsonStr(rule, "action_mode", "must_select"));
        foreach (var value in rule["condition_option_indices"] as JsonArray ?? [])
        {
            var index = (int)AsDouble(value);
            if (index >= 0 && index < ConditionOptions.Items.Count)
            {
                ConditionOptions.SelectedItems.Add(ConditionOptions.Items[index]);
            }
        }
        foreach (var value in rule["target_option_indices"] as JsonArray ?? [])
        {
            var index = (int)AsDouble(value);
            if (index >= 0 && index < TargetOptions.Items.Count)
            {
                TargetOptions.SelectedItems.Add(TargetOptions.Items[index]);
            }
        }
        if (rule["condition_row_index"] is System.Text.Json.Nodes.JsonValue conditionRow
            && conditionRow.TryGetValue<double>(out var conditionRowIndex))
        {
            ConditionRow.SelectedIndex = (int)conditionRowIndex;
        }
        if (rule["target_row_index"] is System.Text.Json.Nodes.JsonValue targetRow
            && targetRow.TryGetValue<double>(out var targetRowIndex))
        {
            TargetRow.SelectedIndex = (int)targetRowIndex;
        }
        RuleStatus.IsOpen = false;
        UpdateCommandState();
    }

    private void OnSaveRule(object sender, RoutedEventArgs e)
    {
        var rules = _document.Rules() ?? [];
        var existing = _ruleIndex >= 0 && _ruleIndex < rules.Count && rules[_ruleIndex] is JsonObject node
            ? node
            : new JsonObject();
        var rule = new JsonObject();
        if (existing.ContainsKey("id"))
        {
            rule["id"] = JsonNode.Parse(existing["id"]!.ToJsonString());
        }
        rule["condition_question_num"] = _conditionNumber;
        rule["condition_mode"] = SelectedTag(ConditionMode, "selected");
        rule["condition_option_indices"] = SelectedIndices(ConditionOptions);
        if (ConditionRow.Visibility == Visibility.Visible && ConditionRow.SelectedIndex >= 0)
        {
            rule["condition_row_index"] = ConditionRow.SelectedIndex;
        }
        rule["target_question_num"] = _targetNumber;
        rule["action_mode"] = SelectedTag(ActionMode, "must_select");
        rule["target_option_indices"] = SelectedIndices(TargetOptions);
        if (TargetRow.Visibility == Visibility.Visible && TargetRow.SelectedIndex >= 0)
        {
            rule["target_row_index"] = TargetRow.SelectedIndex;
        }
        try
        {
            _document.SetRule(_ruleIndex, rule);
        }
        catch (Exception error)
        {
            RuleStatus.Severity = InfoBarSeverity.Error;
            RuleStatus.Title = "规则无法保存";
            RuleStatus.Message = error.Message;
            RuleStatus.IsOpen = true;
            return;
        }
        if (_ruleIndex < 0)
        {
            _ruleIndex = (_document.Rules() ?? []).Count - 1;
        }
        Refresh();
        RuleStatus.Severity = InfoBarSeverity.Success;
        RuleStatus.Title = "规则已保存";
        RuleStatus.Message = "";
        RuleStatus.IsOpen = true;
    }

    private static int ParseQuestionNumber(string label)
    {
        var start = -1;
        for (var i = 0; i < label.Length; i++)
        {
            if (char.IsDigit(label[i]))
            {
                start = i;
                break;
            }
        }
        if (start < 0)
        {
            return 0;
        }
        var end = start;
        while (end < label.Length && char.IsDigit(label[end]))
        {
            end++;
        }
        return int.TryParse(label.Substring(start, end - start), NumberStyles.Integer, CultureInfo.InvariantCulture, out var number)
            ? number
            : 0;
    }

    internal static string RuleLabel(JsonObject rule, int index)
    {
        var condition = (int)AsDouble(rule["condition_question_num"]);
        var target = (int)AsDouble(rule["target_question_num"]);
        var mode = JsonStr(rule, "condition_mode", "selected") == "not_selected" ? "未选中" : "已选中";
        var action = JsonStr(rule, "action_mode", "must_select") == "must_not_select" ? "不得选择" : "必须选择";
        return $"{index + 1}. 第 {condition} 题{mode} → 第 {target} 题{action}";
    }

    private static string QuestionLabel(WizardQuestion question) =>
        $"第 {question.Number} 题 · {question.Type} · {question.Title}";

    private static double AsDouble(JsonNode? node) =>
        node is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<double>(out var number) ? number : 0;

    private static int AsInt(JsonNode? node) => (int)AsDouble(node);

    private static string JsonStr(JsonObject parent, string name, string fallback) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<string>(out var text) ? text : fallback;
}
