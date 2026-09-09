using System.Collections.ObjectModel;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using ModernWpf.Controls;
using SurveyController.App.Controls;
using SurveyController.App.ViewModels;
using SurveyController.Core.Document;

namespace SurveyController.App.Views;

/// <summary>
/// 逐题答案编辑器：题目树 + 权重表 + 题型专属设置。
/// </summary>
public partial class StrategyEditor : UserControl
{
    internal readonly WizardDocument Document = WizardDocument.Current;

    private bool _isLoaded;

    internal bool SyncingWeights;
    internal bool MultipleWeights;
    internal bool SliderValue;
    private bool _syncingTreeSelection;
    internal bool CurrentQuestionDirty;
    private int _questionIndex = -1;
    private string _currentNormalizedType = string.Empty;
    private readonly List<TreeViewItem> _questionNodes = [];
    private readonly List<(TreeViewItem Node, int TargetIndex)> _treeTargets = [];
    internal readonly ObservableCollection<OptionWeight> WeightOptions = [];
    internal readonly List<string> WeightLabels = [];
    internal int WeightRows = 1;
    internal int WeightColumns;

    public StrategyEditor()
    {
        InitializeComponent();
    }

    protected override void OnPreviewKeyDown(KeyEventArgs e)
    {
        base.OnPreviewKeyDown(e);
        if (e.Handled)
        {
            return;
        }

        if (e.Key == Key.PageUp || (Keyboard.Modifiers == ModifierKeys.Alt && e.Key == Key.Up))
        {
            if (_questionIndex > 0)
            {
                SelectQuestion(_questionIndex - 1);
                e.Handled = true;
            }
        }
        else if (e.Key == Key.PageDown || (Keyboard.Modifiers == ModifierKeys.Alt && e.Key == Key.Down))
        {
            if (_questionIndex >= 0 && _questionIndex + 1 < _questionNodes.Count)
            {
                SelectQuestion(_questionIndex + 1);
                e.Handled = true;
            }
        }
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (_isLoaded)
        {
            return;
        }
        _isLoaded = true;
        try
        {
            OptionWeightRows.ItemsSource = WeightOptions;
            Refresh();
        }
        catch (Exception error)
        {
            QuestionStatus.Severity = InfoBarSeverity.Error;
            QuestionStatus.Title = "答案编辑器加载失败";
            QuestionStatus.Message = error.Message;
            QuestionStatus.IsOpen = true;
        }
    }

    public void Refresh()
    {
        if (!_isLoaded)
        {
            return;
        }
        RebuildQuestionTree(_questionIndex);
    }

    internal void LoadQuestion()
    {
        var index = _questionIndex;
        if (index < 0)
        {
            return;
        }
        var question = Document.QuestionAt(index) ?? new JsonObject();
        var strategy = Document.StrategyAt(index) ?? new JsonObject();
        var number = (int)JsonNumber(question, "num", 0);
        var summary = Document.Questions()[index];
        _currentNormalizedType = summary.NormalizedType;
        QuestionTitle.Text = JsonStr(question, "title", "未命名题目");
        QuestionMeta.Text = $"第 {number} 题 · {summary.Type}" + (JsonBool(question, "required") ? " · 必答" : "");
        QuestionTypeBadge.Text = summary.Type;
        QuestionTypeIcon.Glyph = summary.Icon;
        RequiredBadgeBorder.Visibility = JsonBool(question, "required") ? Visibility.Visible : Visibility.Collapsed;
        var jumpRules = question["jump_rules"] as JsonArray;
        var displayTargets = question["controls_display_targets"] as JsonArray;
        var hasLogic = (jumpRules?.Count ?? 0) > 0 || (displayTargets?.Count ?? 0) > 0;
        LogicBadgeBorder.Visibility = hasLogic ? Visibility.Visible : Visibility.Collapsed;
        UnsupportedBadgeBorder.Visibility = summary.Unsupported ? Visibility.Visible : Visibility.Collapsed;
        ApplyQuestionTypeBrush(summary.NormalizedType);
        SyncingWeights = true;
        SelectTag(Bias, JsonStr(strategy, "psycho_bias", "custom"));
        SyncingWeights = false;
        RebuildWeightEditor(question, strategy, summary.NormalizedType);
        WeightSettingsSection.Visibility = WeightOptions.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        var aiEnabled = JsonBool(strategy, "ai_enabled");
        AIEnabled.IsOn = aiEnabled;
        SelectTag(TextRandomMode, JsonStr(strategy, "text_random_mode", "none"));
        if (aiEnabled)
        {
            TextRandomMode.SelectedIndex = 0;
        }
        var textRange = strategy["text_random_int_range"] as JsonArray;
        TextRangeMin.Value = textRange is { Count: > 0 } ? AsDouble(textRange[0]) : double.NaN;
        TextRangeMax.Value = textRange is { Count: > 1 } ? AsDouble(textRange[1]) : double.NaN;
        LoadAdvancedEditors(question, strategy, summary);
        UpdateTextModeVisibility();
        QuestionStatus.IsOpen = false;
        CurrentQuestionDirty = false;
    }

    public bool SaveCurrentQuestion()
    {
        var index = _questionIndex;
        if (index < 0 || !CurrentQuestionDirty)
        {
            return true;
        }
        try
        {
            var changes = new JsonObject
            {
                ["psycho_bias"] = SelectedTag(Bias, "custom"),
                ["ai_enabled"] = AIEnabled.IsOn,
            };
            var table = BuildWeightTable();
            var options = table["options"] as JsonArray;
            var rows = table["rows"] as JsonArray;
            if ((options?.Count ?? 0) > 0 || (rows?.Count ?? 0) > 0)
            {
                static void Validate(JsonArray values)
                {
                    double total = 0;
                    foreach (var value in values)
                    {
                        total += AsDouble(value);
                    }
                    if (total <= 0)
                    {
                        throw new ArgumentException("选项配比不能全为 0。");
                    }
                }
                if ((options?.Count ?? 0) > 0 && !SliderValue && options is not null)
                {
                    Validate(options);
                }
                if (rows is not null)
                {
                    foreach (var row in rows)
                    {
                        if (row is JsonArray rowArray)
                        {
                            Validate(rowArray);
                        }
                    }
                }
                changes["custom_weights"] = table;
                changes["probabilities"] = table;
                changes["distribution_mode"] = "custom";
            }
            else
            {
                changes["custom_weights"] = null;
            }

            var textMode = SelectedTag(TextRandomMode, "none");
            changes["text_random_mode"] = textMode;
            if (textMode == "integer")
            {
                if (double.IsNaN(TextRangeMin.Value) || double.IsNaN(TextRangeMax.Value))
                {
                    throw new ArgumentException("随机整数模式必须填写最小值和最大值。");
                }
                changes["text_random_int_range"] = new JsonArray(
                    Math.Min(TextRangeMin.Value, TextRangeMax.Value),
                    Math.Max(TextRangeMin.Value, TextRangeMax.Value));
            }
            else
            {
                changes["text_random_int_range"] = null;
            }

            SaveAdvancedEditors(Document.QuestionAt(index) ?? new JsonObject(), _currentNormalizedType, changes);
            Document.UpdateQuestionStrategy(index, changes);
            CurrentQuestionDirty = false;

            QuestionStatus.Severity = InfoBarSeverity.Success;
            QuestionStatus.Title = "题目设置已保存";
            QuestionStatus.Message = "";
            QuestionStatus.IsOpen = true;
            return true;
        }
        catch (Exception error)
        {
            QuestionStatus.Severity = InfoBarSeverity.Error;
            QuestionStatus.Title = "题目设置格式错误";
            QuestionStatus.Message = error.Message;
            QuestionStatus.IsOpen = true;
            return false;
        }
    }

    private void OnTextModeChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_isLoaded)
        {
            return;
        }
        CurrentQuestionDirty = true;
        if (SelectedTag(TextRandomMode, "none") != "none" && AIEnabled.IsOn)
        {
            AIEnabled.IsOn = false;
        }
        UpdateTextModeVisibility();
    }

    private void OnAIEnabledToggled(object sender, RoutedEventArgs e)
    {
        if (!_isLoaded)
        {
            return;
        }
        CurrentQuestionDirty = true;
        if (AIEnabled.IsOn && SelectedTag(TextRandomMode, "none") != "none")
        {
            TextRandomMode.SelectedIndex = 0;
        }
        UpdateTextModeVisibility();
    }

    private void OnQuestionTextChanged(object sender, TextChangedEventArgs e)
    {
        if (_isLoaded)
        {
            CurrentQuestionDirty = true;
        }
    }

    private void OnQuestionNumberChanged(NumberBox sender, NumberBoxValueChangedEventArgs args)
    {
        if (_isLoaded)
        {
            CurrentQuestionDirty = true;
        }
    }

    private void UpdateTextModeVisibility()
    {
        var mode = SelectedTag(TextRandomMode, "none");
        TextAnswers.Visibility = mode == "none" ? Visibility.Visible : Visibility.Collapsed;
        TextRangeRow.Visibility = mode == "integer" ? Visibility.Visible : Visibility.Collapsed;
    }

    internal static string SelectedTag(RadioButtons buttons, string fallback) =>
        buttons.SelectedItem is RadioButton item && item.Tag is string tag ? tag : fallback;

    internal static void SelectTag(RadioButtons buttons, string value)
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

    internal static string JsonStr(JsonObject parent, string name, string fallback) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<string>(out var text) ? text : fallback;

    internal static bool JsonBool(JsonObject parent, string name, bool fallback = false) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<bool>(out var flag) ? flag : fallback;

    internal static double JsonNumber(JsonObject parent, string name, double fallback) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<double>(out var number) ? number : fallback;

    internal static JsonArray JsonArrayField(JsonObject parent, string name) =>
        parent[name] as JsonArray ?? [];

    internal static double AsDouble(JsonNode? node) =>
        node is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<double>(out var number) ? number : 0;

    internal static string AsString(JsonNode? node) =>
        node is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<string>(out var text) ? text : string.Empty;
}
