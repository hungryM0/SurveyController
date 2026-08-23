using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SurveyController.App.ViewModels;

namespace SurveyController.App.Views;

/// <summary>权重表构建、倾向预设与占比预览，对照 C++ StrategyEditor.Weights.cpp。</summary>
public sealed partial class StrategyEditor
{
    private static JsonObject? ConfiguredWeights(JsonObject strategy)
    {
        var table = strategy["custom_weights"] as JsonObject;
        var options = table?["options"] as JsonArray;
        var rows = table?["rows"] as JsonArray;
        if ((options?.Count ?? 0) > 0 || (rows?.Count ?? 0) > 0)
        {
            return table;
        }
        return strategy["probabilities"] as JsonObject;
    }

    internal static string PercentText(double value)
    {
        if (Math.Abs(value - Math.Round(value)) < 0.05)
        {
            return $"{(int)Math.Round(value)}%";
        }
        return value.ToString("0.0", CultureInfo.InvariantCulture) + "%";
    }

    private static double SliderNumber(string value, double fallback) =>
        double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
            && double.IsFinite(parsed) ? parsed : fallback;

    internal static string NumberText(double value) =>
        Math.Abs(value - Math.Round(value)) < 0.0001
            ? ((long)Math.Round(value)).ToString(CultureInfo.InvariantCulture)
            : value.ToString("0.00", CultureInfo.InvariantCulture);

    protected void RebuildWeightEditor(JsonObject question, JsonObject strategy, string normalizedType)
    {
        SyncingWeights = true;
        WeightOptions.Clear();
        WeightLabels.Clear();

        var isTextQuestion = normalizedType is "text" or "multi_text" or "location";
        var optionTexts = question["option_texts"] as JsonArray ?? [];
        var weightTable = ConfiguredWeights(strategy);
        var optionWeights = weightTable?["options"] as JsonArray ?? [];
        var rowWeights = weightTable?["rows"] as JsonArray ?? [];
        var optionCount = Math.Max(0, (int)JsonNumber(strategy, "option_count", JsonNumber(question, "options", 0)));
        optionCount = Math.Max(optionCount, optionTexts.Count);
        optionCount = Math.Max(optionCount, optionWeights.Count);
        foreach (var row in rowWeights)
        {
            if (row is JsonArray rowArray)
            {
                optionCount = Math.Max(optionCount, rowArray.Count);
            }
        }
        if (isTextQuestion || normalizedType == "unsupported")
        {
            optionCount = 0;
        }
        if (normalizedType == "slider")
        {
            optionCount = 1;
        }

        var rowTexts = question["row_texts"] as JsonArray ?? [];
        var rowCount = Math.Max(0, (int)JsonNumber(strategy, "rows", JsonNumber(question, "rows", 0)));
        rowCount = Math.Max(rowCount, rowTexts.Count);
        rowCount = Math.Max(rowCount, rowWeights.Count);
        var matrix = normalizedType == "matrix";
        WeightRows = matrix && rowCount > 0 ? rowCount : 1;
        WeightColumns = optionCount;

        MultipleWeights = normalizedType == "multiple";
        SliderValue = normalizedType == "slider";
        Bias.Visibility = SliderValue ? Visibility.Collapsed : Visibility.Visible;
        OptionWeightsSection.Visibility = optionCount > 0 ? Visibility.Visible : Visibility.Collapsed;
        OptionWeightEmpty.Visibility = optionCount == 0 ? Visibility.Visible : Visibility.Collapsed;

        var minimum = SliderValue
            ? SliderNumber(JsonStr(question, "slider_min", "0"), 0)
            : 0.0;
        var maximum = SliderValue
            ? SliderNumber(JsonStr(question, "slider_max", "100"), 100)
            : MultipleWeights ? 100.0 : 50.0;
        if (maximum < minimum)
        {
            (minimum, maximum) = (maximum, minimum);
        }
        var step = SliderValue ? SliderNumber(JsonStr(question, "slider_step", "1"), 1) : 1.0;
        if (step <= 0)
        {
            step = 1;
        }
        var defaultValue = SliderValue ? (minimum + maximum) / 2.0 : MultipleWeights ? 50.0 : 1.0;
        for (var rowIndex = 0; rowIndex < WeightRows; rowIndex++)
        {
            var configuredRow = rowIndex < rowWeights.Count && rowWeights[rowIndex] is JsonArray array
                ? array
                : null;
            var rowLabel = rowIndex < rowTexts.Count
                ? AsString(rowTexts[rowIndex])
                : $"矩阵行 {rowIndex + 1}";
            for (var optionIndex = 0; optionIndex < optionCount; optionIndex++)
            {
                var optionLabel = SliderValue
                    ? "滑块值"
                    : optionIndex < optionTexts.Count
                        ? AsString(optionTexts[optionIndex])
                        : $"选项 {optionIndex + 1}";
                if (optionLabel.Length == 0)
                {
                    optionLabel = $"选项 {optionIndex + 1}";
                }
                var label = WeightRows > 1 ? $"{rowLabel} · {optionLabel}" : optionLabel;
                WeightLabels.Add(label);
                var values = WeightRows > 1 ? configuredRow : optionWeights;
                var value = values is not null && optionIndex < values.Count && values[optionIndex] is System.Text.Json.Nodes.JsonValue
                    ? AsDouble(values[optionIndex])
                    : defaultValue;
                value = Math.Max(minimum, Math.Min(maximum, value));
                value = minimum + Math.Round((value - minimum) / step) * step;
                value = Math.Max(minimum, Math.Min(maximum, value));
                var option = new OptionWeight(label, value, minimum, maximum, step);
                option.PropertyChanged += (_, _) =>
                {
                    if (!SyncingWeights)
                    {
                        CurrentQuestionDirty = true;
                        SelectTag(Bias, "custom");
                        UpdateRatioPreview();
                    }
                };
                WeightOptions.Add(option);
            }
        }
        SyncingWeights = false;
        UpdateRatioPreview();
    }

    private void OnBiasChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_isLoaded || SyncingWeights)
        {
            return;
        }
        CurrentQuestionDirty = true;
        var bias = SelectedTag(Bias, "custom");
        if (bias != "custom")
        {
            ApplyBiasPreset(bias);
        }
    }

    protected void ApplyBiasPreset(string bias)
    {
        if (SliderValue)
        {
            return;
        }
        var columns = WeightColumns;
        if (columns == 0)
        {
            return;
        }
        var raw = new double[columns];
        Array.Fill(raw, 1.0);
        if (columns > 1)
        {
            var center = (columns - 1) / 2.0;
            for (var index = 0; index < columns; index++)
            {
                var position = index / (double)(columns - 1);
                var baseValue = bias == "left" ? 1.0 - position : position;
                if (bias == "center")
                {
                    baseValue = 1.0 - Math.Abs(index - center) / center;
                }
                raw[index] = Math.Pow(Math.Max(0.0, baseValue), bias == "center" ? 3.0 : 8.0);
            }
        }
        var maximum = raw.Length > 0 ? raw.Max() : 0;
        var scale = MultipleWeights ? 100.0 : 50.0;
        for (var row = 0; row < WeightRows; row++)
        {
            for (var index = 0; index < columns; index++)
            {
                var value = maximum > 0 ? Math.Round(raw[index] / maximum * scale) : Math.Round(scale / columns);
                WeightOptions[row * columns + index].Value = value;
            }
        }
    }

    private JsonArray BuildWeightValues()
    {
        var values = new JsonArray();
        foreach (var option in WeightOptions)
        {
            var value = option.Value;
            values.Add(double.IsNaN(value) ? 0 : value);
        }
        return values;
    }

    private JsonObject BuildWeightTable()
    {
        var table = new JsonObject();
        var values = BuildWeightValues();
        if (WeightRows <= 1)
        {
            table["options"] = values;
            return table;
        }
        var rows = new JsonArray();
        for (var row = 0; row < WeightRows; row++)
        {
            var rowValues = new JsonArray();
            for (var column = 0; column < WeightColumns; column++)
            {
                rowValues.Add((JsonNode?)values[row * WeightColumns + column]);
            }
            rows.Add(rowValues);
        }
        table["rows"] = rows;
        return table;
    }

    protected void UpdateRatioPreview()
    {
        if (WeightOptions.Count == 0)
        {
            RatioPreview.Text = "";
            return;
        }
        if (SliderValue)
        {
            RatioPreview.Text = "预计值：" + NumberText(WeightOptions[0].Value);
            return;
        }
        var values = new List<double>(WeightOptions.Count);
        foreach (var option in WeightOptions)
        {
            values.Add(double.IsNaN(option.Value) ? 0 : Math.Max(0.0, option.Value));
        }

        var preview = string.Empty;
        var columns = Math.Max(1, WeightColumns);
        for (var row = 0; row < WeightRows; row++)
        {
            if (row > 0)
            {
                preview += "\n";
            }
            preview += MultipleWeights ? "命中率：" : "预计占比：";
            var rowTotal = 0.0;
            for (var column = 0; column < columns; column++)
            {
                rowTotal += values[row * columns + column];
            }
            for (var column = 0; column < columns; column++)
            {
                var index = row * columns + column;
                if (column > 0)
                {
                    preview += " | ";
                }
                var label = WeightLabels[index];
                if (label.Length > 14)
                {
                    label = label[..14] + "…";
                }
                var percent = MultipleWeights
                    ? values[index]
                    : rowTotal > 0 ? values[index] / rowTotal * 100.0 : 100.0 / columns;
                preview += $"{label} {PercentText(percent)}";
            }
        }
        RatioPreview.Text = preview;
    }
}
