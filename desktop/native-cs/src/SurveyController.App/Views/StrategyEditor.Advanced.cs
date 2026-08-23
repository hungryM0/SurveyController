using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using SurveyController.App.ViewModels;
using SurveyController.Core.Document;

namespace SurveyController.App.Views;

/// <summary>题型专属高级编辑器：可填写选项/多项填空/嵌入式下拉，对照 C++ StrategyEditor.Advanced.cpp。</summary>
public sealed partial class StrategyEditor
{
    private const string OptionFillAI = "__AI_FILL__";
    private const string RandomName = "__RANDOM_NAME__";
    private const string RandomMobile = "__RANDOM_MOBILE__";
    private const string RandomIDCard = "__RANDOM_ID_CARD__";
    private const string RandomIntegerPrefix = "__RANDOM_INT__:";

    private sealed record OptionFillControls(int OptionIndex, TextBox Text, RadioButtons Mode, NumberBox Minimum, NumberBox Maximum, ToggleSwitch AI);

    private sealed record MultiTextControls(RadioButtons Mode, NumberBox Minimum, NumberBox Maximum, ToggleSwitch AI);

    private sealed class AttachedSelectControls
    {
        public int OptionIndex;
        public string OptionText = string.Empty;
        public JsonObject Source = new();
        public List<string> SelectTexts = [];
        public List<NumberBox> Weights = [];
    }

    private readonly List<OptionFillControls> _optionFillControls = [];
    private readonly List<MultiTextControls> _multiTextControls = [];
    private readonly List<AttachedSelectControls> _attachedSelectControls = [];

    protected void ApplyQuestionTypeBrush(string type)
    {
        var (foregroundKey, badgeForegroundKey, backgroundKey) = QuestionBrushKeys(type);
        var resources = Application.Current.Resources;
        QuestionTypeIcon.Foreground = resources[foregroundKey] as Brush;
        QuestionBadgeIcon.Glyph = QuestionTypeIcon.Glyph;
        QuestionBadgeIcon.Foreground = resources[badgeForegroundKey] as Brush;
        QuestionTypeBadge.Foreground = resources[badgeForegroundKey] as Brush;
        QuestionTypeInfoBadge.Background = resources[backgroundKey] as Brush;
    }

    protected void LoadAdvancedEditors(JsonObject question, JsonObject strategy, WizardQuestion summary)
    {
        var textQuestion = summary.NormalizedType == "text";
        TextQuestionSection.Visibility = textQuestion ? Visibility.Visible : Visibility.Collapsed;
        LocationSection.Visibility = summary.NormalizedType == "location" ? Visibility.Visible : Visibility.Collapsed;
        MultiTextSection.Visibility = summary.NormalizedType == "multi_text" ? Visibility.Visible : Visibility.Collapsed;

        var textCandidates = strategy["texts"] as JsonArray;
        if (textCandidates is not { Count: > 0 })
        {
            textCandidates = question["forced_texts"] as JsonArray;
        }
        TextAnswers.Text = FormatTextCandidates(textCandidates);
        MultiTextAnswers.Text = FormatTextCandidates(textCandidates);

        var locations = strategy["location_parts"] as JsonArray ?? [];
        LocationProvince.Text = locations.Count > 0 ? AsString(locations[0]) : string.Empty;
        LocationCity.Text = locations.Count > 1 ? AsString(locations[1]) : string.Empty;
        LocationDistrict.Text = locations.Count > 2 ? AsString(locations[2]) : string.Empty;

        _optionFillControls.Clear();
        FillableOptionList.Children.Clear();
        var fillable = question["fillable_options"] as JsonArray;
        if (fillable is not { Count: > 0 })
        {
            fillable = strategy["fillable_option_indices"] as JsonArray ?? [];
        }
        var optionTexts = question["option_texts"] as JsonArray ?? [];
        var savedTexts = strategy["option_fill_texts"] as JsonArray ?? [];
        foreach (var value in fillable)
        {
            if (value is not System.Text.Json.Nodes.JsonValue || !value.TryGetValue<double>(out var rawIndex))
            {
                continue;
            }
            var optionIndex = (int)rawIndex;
            if (optionIndex < 0 || optionIndex >= optionTexts.Count)
            {
                continue;
            }

            var saved = optionIndex < savedTexts.Count ? AsString(savedTexts[optionIndex]) : string.Empty;
            var decoded = DecodeFillValue(saved);
            var ai = new ToggleSwitch { Header = "启用 AI", OffContent = "关", OnContent = "开", IsOn = saved == OptionFillAI };
            AutomationProperties.SetName(ai, $"第 {optionIndex + 1} 个可填写选项启用 AI");
            var mode = CreateModeButtons($"第 {optionIndex + 1} 个可填写选项填写模式");
            SelectMode(mode, decoded.Mode);
            var text = new TextBox { Header = "填写文本" };
            if (decoded.Mode == "none" && saved != OptionFillAI)
            {
                text.Text = saved;
            }
            var minimum = new NumberBox { Value = decoded.RangeMin };
            var maximum = new NumberBox { Value = decoded.RangeMax };
            var range = CreateRangePanel(minimum, maximum);
            void Sync()
            {
                var aiEnabled = ai.IsOn;
                var selected = SelectedMode(mode);
                mode.IsEnabled = !aiEnabled;
                text.IsEnabled = !aiEnabled && selected == "none";
                range.Visibility = !aiEnabled && selected == "integer" ? Visibility.Visible : Visibility.Collapsed;
            }
            mode.SelectionChanged += (_, _) =>
            {
                CurrentQuestionDirty = true;
                if (SelectedMode(mode) != "none" && ai.IsOn)
                {
                    ai.IsOn = false;
                }
                Sync();
            };
            ai.Toggled += (_, _) =>
            {
                CurrentQuestionDirty = true;
                if (ai.IsOn && SelectedMode(mode) != "none")
                {
                    mode.SelectedIndex = 0;
                }
                Sync();
            };
            text.TextChanged += (_, _) => CurrentQuestionDirty = true;
            minimum.ValueChanged += (_, _) => CurrentQuestionDirty = true;
            maximum.ValueChanged += (_, _) => CurrentQuestionDirty = true;
            if (ai.IsOn && SelectedMode(mode) != "none")
            {
                mode.SelectedIndex = 0;
            }
            Sync();

            var panel = new StackPanel { Spacing = 8 };
            panel.Children.Add(new TextBlock
            {
                FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                Text = $"{optionIndex + 1}. {AsString(optionTexts[optionIndex])}",
            });
            panel.Children.Add(text);
            panel.Children.Add(mode);
            panel.Children.Add(range);
            panel.Children.Add(ai);
            FillableOptionList.Children.Add(CreateRowSurface(panel));
            _optionFillControls.Add(new OptionFillControls(optionIndex, text, mode, minimum, maximum, ai));
        }
        FillableOptionsSection.Visibility = _optionFillControls.Count == 0 ? Visibility.Collapsed : Visibility.Visible;

        _multiTextControls.Clear();
        MultiTextRows.Children.Clear();
        var labels = question["text_input_labels"] as JsonArray ?? [];
        var count = Math.Max(0, (int)JsonNumber(question, "text_inputs", 0));
        count = Math.Max(count, labels.Count);
        var modes = strategy["multi_text_blank_modes"] as JsonArray ?? [];
        var aiFlags = strategy["multi_text_blank_ai_flags"] as JsonArray ?? [];
        var ranges = strategy["multi_text_blank_int_ranges"] as JsonArray ?? [];
        count = Math.Max(count, Math.Max(modes.Count, aiFlags.Count));
        if (summary.NormalizedType == "multi_text" && count == 0)
        {
            count = 1;
        }
        for (var index = 0; index < count; index++)
        {
            var mode = CreateModeButtons($"第 {index + 1} 个填空的填写模式");
            SelectMode(mode, index < modes.Count ? AsString(modes[index]) : "none");
            var ai = new ToggleSwitch { Header = "启用 AI", OffContent = "关", OnContent = "开" };
            if (index < aiFlags.Count && aiFlags[index] is System.Text.Json.Nodes.JsonValue flagValue && flagValue.TryGetValue<bool>(out var flag))
            {
                ai.IsOn = flag;
            }
            var minimum = new NumberBox();
            var maximum = new NumberBox();
            if (index < ranges.Count && ranges[index] is JsonArray savedRange)
            {
                minimum.Value = savedRange.Count > 0 ? AsDouble(savedRange[0]) : double.NaN;
                maximum.Value = savedRange.Count > 1 ? AsDouble(savedRange[1]) : double.NaN;
            }
            else
            {
                minimum.Value = double.NaN;
                maximum.Value = double.NaN;
            }
            var range = CreateRangePanel(minimum, maximum);
            void Sync()
            {
                mode.IsEnabled = !ai.IsOn;
                range.Visibility = !ai.IsOn && SelectedMode(mode) == "integer" ? Visibility.Visible : Visibility.Collapsed;
            }
            mode.SelectionChanged += (_, _) =>
            {
                CurrentQuestionDirty = true;
                if (SelectedMode(mode) != "none" && ai.IsOn)
                {
                    ai.IsOn = false;
                }
                Sync();
            };
            ai.Toggled += (_, _) =>
            {
                CurrentQuestionDirty = true;
                if (ai.IsOn && SelectedMode(mode) != "none")
                {
                    mode.SelectedIndex = 0;
                }
                Sync();
            };
            minimum.ValueChanged += (_, _) => CurrentQuestionDirty = true;
            maximum.ValueChanged += (_, _) => CurrentQuestionDirty = true;
            if (ai.IsOn && SelectedMode(mode) != "none")
            {
                mode.SelectedIndex = 0;
            }
            Sync();

            var label = index < labels.Count && AsString(labels[index]).Length > 0
                ? AsString(labels[index])
                : $"第 {index + 1} 个填空";
            var panel = new StackPanel { Spacing = 8 };
            panel.Children.Add(new TextBlock { FontWeight = Microsoft.UI.Text.FontWeights.SemiBold, Text = label });
            panel.Children.Add(mode);
            panel.Children.Add(range);
            panel.Children.Add(ai);
            MultiTextRows.Children.Add(CreateRowSurface(panel));
            _multiTextControls.Add(new MultiTextControls(mode, minimum, maximum, ai));
        }

        _attachedSelectControls.Clear();
        AttachedOptionSelectList.Children.Clear();
        var attached = strategy["attached_option_selects"] as JsonArray;
        if (attached is not { Count: > 0 })
        {
            attached = question["attached_option_selects"] as JsonArray ?? [];
        }
        foreach (var value in attached)
        {
            if (value is not JsonObject sourceNode)
            {
                continue;
            }
            // 克隆一份，避免保存时改写文档中的原始节点。
            var source = JsonNode.Parse(sourceNode.ToJsonString())!.AsObject();
            var selectTexts = ArrayFieldWithFallback(source, "select_texts", "select_options");
            if (selectTexts.Count == 0)
            {
                continue;
            }
            var controls = new AttachedSelectControls
            {
                OptionIndex = (int)JsonNumber(source, "option_index", 0),
                OptionText = JsonStr(source, "option_text", "嵌入式选项"),
                Source = source,
            };
            var configured = source["weights"] as JsonArray ?? [];
            var panel = new StackPanel { Spacing = 8 };
            panel.Children.Add(new TextBlock
            {
                FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                Text = $"选项 {controls.OptionIndex + 1} · {controls.OptionText}",
            });
            for (var index = 0; index < selectTexts.Count; index++)
            {
                var label = AsString(selectTexts[index]);
                if (label.Length == 0)
                {
                    continue;
                }
                controls.SelectTexts.Add(label);
                var weight = index < configured.Count ? AsDouble(configured[index]) : 1.0;
                var text = new TextBlock { Text = label, Width = 150, TextTrimming = TextTrimming.CharacterEllipsis };
                var slider = new Slider { Minimum = 0, Maximum = 100, StepFrequency = 1, Value = weight };
                var number = new NumberBox
                {
                    Minimum = 0,
                    Maximum = 100,
                    SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Compact,
                    Value = weight,
                };
                slider.ValueChanged += (_, args) =>
                {
                    CurrentQuestionDirty = true;
                    if (number.Value != args.NewValue)
                    {
                        number.Value = args.NewValue;
                    }
                };
                number.ValueChanged += (_, args) =>
                {
                    CurrentQuestionDirty = true;
                    if (!double.IsNaN(args.NewValue) && slider.Value != args.NewValue)
                    {
                        slider.Value = args.NewValue;
                    }
                };
                var row = new Grid { ColumnSpacing = 8 };
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(150) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(84) });
                Grid.SetColumn(slider, 1);
                Grid.SetColumn(number, 2);
                row.Children.Add(text);
                row.Children.Add(slider);
                row.Children.Add(number);
                panel.Children.Add(row);
                controls.Weights.Add(number);
            }
            AttachedOptionSelectList.Children.Add(CreateRowSurface(panel));
            _attachedSelectControls.Add(controls);
        }
        AttachedOptionSection.Visibility = _attachedSelectControls.Count == 0 ? Visibility.Collapsed : Visibility.Visible;
        UpdateTextModeVisibility();
    }

    protected void SaveAdvancedEditors(JsonObject question, string normalizedType, JsonObject changes)
    {
        if (normalizedType == "text")
        {
            changes["texts"] = ParseTextCandidates(TextAnswers.Text);
        }
        if (normalizedType == "multi_text")
        {
            changes["texts"] = ParseTextCandidates(MultiTextAnswers.Text);
        }

        var optionCount = Math.Max(0, (int)JsonNumber(question, "options", 0));
        optionCount = Math.Max(optionCount, (question["option_texts"] as JsonArray)?.Count ?? 0);
        var fillable = new JsonArray();
        var fillTexts = new JsonArray();
        for (var index = 0; index < optionCount; index++)
        {
            fillTexts.Add((JsonNode?)null);
        }
        foreach (var controls in _optionFillControls)
        {
            if (controls.OptionIndex < 0 || controls.OptionIndex >= optionCount)
            {
                continue;
            }
            fillable.Add(controls.OptionIndex);
            var value = controls.AI.IsOn
                ? OptionFillAI
                : EncodeFillValue(SelectedMode(controls.Mode), controls.Text.Text, controls.Minimum, controls.Maximum);
            fillTexts[controls.OptionIndex] = value.Length == 0 ? null : value;
        }
        changes["fillable_option_indices"] = fillable;
        changes["option_fill_texts"] = fillTexts;

        changes["location_parts"] = new JsonArray(
            LocationProvince.Text,
            LocationCity.Text,
            LocationDistrict.Text);

        var modeValues = new JsonArray();
        var aiFlagValues = new JsonArray();
        var rangeValues = new JsonArray();
        foreach (var controls in _multiTextControls)
        {
            var mode = controls.AI.IsOn ? "none" : SelectedMode(controls.Mode);
            modeValues.Add(mode);
            aiFlagValues.Add(controls.AI.IsOn);
            rangeValues.Add(IntegerRange(controls.Minimum, controls.Maximum, !controls.AI.IsOn && mode == "integer"));
        }
        changes["multi_text_blank_modes"] = modeValues;
        changes["multi_text_blank_ai_flags"] = aiFlagValues;
        changes["multi_text_blank_int_ranges"] = rangeValues;

        var attachedOut = new JsonArray();
        foreach (var controls in _attachedSelectControls)
        {
            var item = JsonNode.Parse(controls.Source.ToJsonString())!.AsObject();
            var weights = new JsonArray();
            double total = 0;
            foreach (var number in controls.Weights)
            {
                var value = double.IsNaN(number.Value) ? 0 : Math.Max(0.0, number.Value);
                total += value;
                weights.Add(value);
            }
            if (weights.Count > 0 && total <= 0)
            {
                throw new ArgumentException("嵌入式下拉配比不能全为 0。");
            }
            item["weights"] = weights;
            attachedOut.Add(item);
        }
        changes["attached_option_selects"] = attachedOut;
    }

    // —— 高级编辑器辅助 ——

    private static RadioButtons CreateModeButtons(string automationName)
    {
        var buttons = new RadioButtons { MaxColumns = 3 };
        AutomationProperties.SetName(buttons, automationName);
        (string Label, string Tag)[] items =
        [
            ("答案文本", "none"), ("随机姓名", "name"), ("随机手机号", "mobile"),
            ("随机身份证", "id_card"), ("随机整数", "integer"),
        ];
        foreach (var (label, tag) in items)
        {
            buttons.Items.Add(new RadioButton { Content = label, Tag = tag });
        }
        buttons.SelectedIndex = 0;
        return buttons;
    }

    private static string SelectedMode(RadioButtons buttons) =>
        buttons.SelectedItem is RadioButton item && item.Tag is string tag ? tag : "none";

    private static void SelectMode(RadioButtons buttons, string value)
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

    private readonly record struct DecodedFill(string Mode, double RangeMin, double RangeMax);

    private static DecodedFill DecodeFillValue(string value)
    {
        var nan = double.NaN;
        switch (value)
        {
            case RandomName: return new DecodedFill("name", nan, nan);
            case RandomMobile: return new DecodedFill("mobile", nan, nan);
            case RandomIDCard: return new DecodedFill("id_card", nan, nan);
        }
        if (value.StartsWith(RandomIntegerPrefix, StringComparison.Ordinal))
        {
            var payload = value[RandomIntegerPrefix.Length..];
            var separator = payload.IndexOf(':');
            if (separator > 0
                && double.TryParse(payload[..separator], NumberStyles.Float, CultureInfo.InvariantCulture, out var minParsed)
                && double.TryParse(payload[(separator + 1)..], NumberStyles.Float, CultureInfo.InvariantCulture, out var maxParsed))
            {
                return new DecodedFill("integer", Math.Min(minParsed, maxParsed), Math.Max(minParsed, maxParsed));
            }
        }
        return new DecodedFill("none", nan, nan);
    }

    private static string EncodeFillValue(string mode, string text, NumberBox minimum, NumberBox maximum)
    {
        switch (mode)
        {
            case "name": return RandomName;
            case "mobile": return RandomMobile;
            case "id_card": return RandomIDCard;
            case "integer":
                if (double.IsNaN(minimum.Value) || double.IsNaN(maximum.Value))
                {
                    throw new ArgumentException("随机整数模式必须填写最小值和最大值。");
                }
                var low = (long)Math.Round(Math.Min(minimum.Value, maximum.Value));
                var high = (long)Math.Round(Math.Max(minimum.Value, maximum.Value));
                return $"{RandomIntegerPrefix}{low}:{high}";
            default:
                return text;
        }
    }

    private static Border CreateRowSurface(UIElement child)
    {
        var resources = Application.Current.Resources;
        return new Border
        {
            Padding = new Thickness(12, 10, 12, 10),
            CornerRadius = new CornerRadius(10),
            BorderThickness = new Thickness(1),
            Background = resources["CardBackgroundFillColorDefaultBrush"] as Brush,
            BorderBrush = resources["CardStrokeColorDefaultBrush"] as Brush,
            Child = child,
        };
    }

    private static StackPanel CreateRangePanel(NumberBox minimum, NumberBox maximum)
    {
        minimum.Header = "整数最小值";
        maximum.Header = "整数最大值";
        minimum.SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Compact;
        maximum.SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Compact;
        minimum.Width = 150;
        maximum.Width = 150;
        return new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, Children = { minimum, maximum } };
    }

    private static JsonArray IntegerRange(NumberBox minimum, NumberBox maximum, bool enabled)
    {
        var range = new JsonArray();
        if (!enabled)
        {
            return range;
        }
        if (double.IsNaN(minimum.Value) || double.IsNaN(maximum.Value))
        {
            throw new ArgumentException("随机整数模式必须填写最小值和最大值。");
        }
        range.Add(Math.Round(Math.Min(minimum.Value, maximum.Value)));
        range.Add(Math.Round(Math.Max(minimum.Value, maximum.Value)));
        return range;
    }

    private static JsonArray ArrayFieldWithFallback(JsonObject source, string primary, string fallback)
    {
        var values = source[primary] as JsonArray;
        return values is { Count: > 0 } ? values : source[fallback] as JsonArray ?? [];
    }

    private static JsonArray ParseTextCandidates(string value)
    {
        var result = new JsonArray();
        foreach (var rawLine in value.Split('\n'))
        {
            var line = rawLine.TrimEnd('\r').Trim(' ', '\t');
            if (line.Length == 0)
            {
                continue;
            }
            result.Add(line);
        }
        return result;
    }

    private static string FormatTextCandidates(JsonArray? values)
    {
        var result = string.Empty;
        if (values is null)
        {
            return result;
        }
        foreach (var value in values)
        {
            var text = AsString(value);
            if (text.Length == 0)
            {
                continue;
            }
            if (result.Length > 0)
            {
                result += "\r\n";
            }
            result += text;
        }
        return result;
    }
}
