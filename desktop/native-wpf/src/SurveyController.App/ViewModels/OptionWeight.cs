using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace SurveyController.App.ViewModels;

/// <summary>权重行：Label/Minimum/Maximum/Step 不可变，Value 变更通知驱动比例预览刷新。</summary>
public sealed class OptionWeight : INotifyPropertyChanged
{
    private double _value;

    public OptionWeight(string label, double value, double minimum, double maximum, double step)
    {
        Label = label;
        _value = value;
        Minimum = minimum;
        Maximum = maximum;
        Step = step;
    }

    public string Label { get; }

    public double Minimum { get; }

    public double Maximum { get; }

    public double Step { get; }

    public double Value
    {
        get => _value;
        set
        {
            if (_value == value)
            {
                return;
            }
            _value = value;
            OnPropertyChanged();
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
}
