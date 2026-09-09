namespace SurveyController.App.ViewModels;

/// <summary>IP 用量列表行：展示 DTO，创建后不可变。</summary>
public sealed class IpUsageRow
{
    public IpUsageRow(string label, double total, double maximum)
    {
        Label = label;
        Total = total;
        Maximum = maximum < 1 ? 1 : maximum;
    }

    public string Label { get; }

    public double Total { get; }

    public double Maximum { get; }

    public string CountText => $"{(int)Total} 个";
}
