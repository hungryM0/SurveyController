using System.Collections.ObjectModel;
using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SurveyController.App.ViewModels;
using SurveyController.Core.Document;

namespace SurveyController.App.Views;

/// <summary>
/// 逐题答案编辑器：题目树 + 权重表 + 题型专属设置。
/// 主逻辑在此文件；树构建/权重表/高级编辑器分别在 Tree/Weights/Advanced partial。
/// 策略保存为草稿（UpdateQuestionStrategy），规范化由 Go 完成。
/// </summary>
public sealed partial class StrategyEditor : UserControl
{
    protected readonly WizardDocument Document = WizardDocument.Current;

    private bool _isLoaded;

    protected bool SyncingWeights;
    protected bool MultipleWeights;
    protected bool SliderValue;
    private bool _syncingTreeSelection;
    protected bool CurrentQuestionDirty;
    private int _questionIndex = -1;
    private string _currentNormalizedType = string.Empty;
    private readonly List<TreeViewNode> _questionNodes = [];
    private readonly List<(TreeViewNode Node, int TargetIndex)> _treeTargets = [];
    protected readonly ObservableCollection<OptionWeight> WeightOptions = [];
    protected readonly List<string> WeightLabels = [];
    protected int WeightRows = 1;
    protected int WeightColumns;

    public StrategyEditor()
    {
        InitializeComponent();
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
            // ItemsRepeater 在模板加载完成前拒绝部分集合变更，故首次 Loaded 时再绑定。
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

    protected void LoadQuestion()
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

    private void OnSaveQuestion(object sender, RoutedEventArgs e)
    {
        SaveCurrentQuestion();
    }

    protected bool SaveCurrentQuestion()
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

    private void OnQuestionTextChanged(object sender,TextChangedEventArgs e)
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

    protected static string SelectedTag(RadioButtons buttons, string fallback) =>
        buttons.SelectedItem is RadioButton item && item.Tag is string tag ? tag : fallback;

    protected static void SelectTag(RadioButtons buttons, string value)
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

    // —— 共享 JSON 读取辅助 ——

    protected internal static string JsonStr(JsonObject parent, string name, string fallback) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<string>(out var text) ? text : fallback;

    protected internal static bool JsonBool(JsonObject parent, string name, bool fallback = false) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<bool>(out var flag) ? flag : fallback;

    protected internal static double JsonNumber(JsonObject parent, string name, double fallback) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<double>(out var number) ? number : fallback;

    protected internal static JsonArray JsonArrayField(JsonObject parent, string name) =>
        parent[name] as JsonArray ?? [];

    protected internal static double AsDouble(JsonNode? node) =>
        node is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<double>(out var number) ? number : 0;

    protected internal static string AsString(JsonNode? node) =>
        node is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<string>(out var text) ? text : string.Empty;
}
