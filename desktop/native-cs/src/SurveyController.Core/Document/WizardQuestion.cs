namespace SurveyController.Core.Document;

/// <summary>
/// 题目展示 DTO：字段全部来自 Go 后端已规范化的问卷定义，
/// 壳层不做题型推导或业务归一化。
/// </summary>
public sealed class WizardQuestion
{
    public int Number { get; set; }

    public int Page { get; set; } = 1;

    public int Rows { get; set; }

    public string Title { get; set; } = string.Empty;

    public string Type { get; set; } = string.Empty;

    public string NormalizedType { get; set; } = string.Empty;

    public string Icon { get; set; } = string.Empty;

    public bool Required { get; set; }

    public int Options { get; set; }

    public IReadOnlyList<string> OptionTexts { get; set; } = Array.Empty<string>();

    public IReadOnlyList<string> RowTexts { get; set; } = Array.Empty<string>();

    public string Dimension { get; set; } = string.Empty;

    public string Bias { get; set; } = "custom";

    public string Weights { get; set; } = string.Empty;

    public bool Configured { get; set; }

    public bool AiEnabled { get; set; }

    public bool Unsupported { get; set; }

    public string UnsupportedReason { get; set; } = string.Empty;

    public bool HasJump { get; set; }

    public bool HasDisplayLogic { get; set; }

    public string LogicSummary { get; set; } = string.Empty;
}
