using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using ModernWpf.Controls;

namespace SurveyController.App.Controls;

/// <summary>
/// 紧凑型胶囊步骤条：展示向导进度并支持回跳已访问步骤。
/// </summary>
public partial class StepCapsuleBar : UserControl
{
    private static readonly string[] StepTitles = ["导入", "策略", "规则", "网络", "时间", "启动"];

    public static readonly DependencyProperty CurrentStepProperty = DependencyProperty.Register(
        nameof(CurrentStep),
        typeof(int),
        typeof(StepCapsuleBar),
        new PropertyMetadata(0, OnStepPropertiesChanged));

    public static readonly DependencyProperty HighestStepProperty = DependencyProperty.Register(
        nameof(HighestStep),
        typeof(int),
        typeof(StepCapsuleBar),
        new PropertyMetadata(0, OnStepPropertiesChanged));

    public int CurrentStep
    {
        get => (int)GetValue(CurrentStepProperty);
        set => SetValue(CurrentStepProperty, value);
    }

    public int HighestStep
    {
        get => (int)GetValue(HighestStepProperty);
        set => SetValue(HighestStepProperty, value);
    }

    public event EventHandler<int>? StepSelected;

    public StepCapsuleBar()
    {
        InitializeComponent();
        RebuildCapsules();
    }

    private static void OnStepPropertiesChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is StepCapsuleBar bar)
        {
            bar.RebuildCapsules();
        }
    }

    public void RebuildCapsules()
    {
        if (CapsuleContainer == null)
        {
            return;
        }

        CapsuleContainer.Children.Clear();

        for (var i = 0; i < StepTitles.Length; i++)
        {
            var stepIndex = i;
            var isCurrent = stepIndex == CurrentStep;
            var isCompleted = stepIndex < CurrentStep;
            var isReachable = stepIndex <= HighestStep;

            var capsule = new Border
            {
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(8, 3, 8, 3),
                Margin = new Thickness(1, 0, 1, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };

            var contentPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
            };

            if (isCompleted)
            {
                // 已完成步骤：显示对勾图标 + 步骤名，支持点击回退
                capsule.Background = Brushes.Transparent;
                capsule.Cursor = Cursors.Hand;
                capsule.ToolTip = $"点击跳转至第 {stepIndex + 1} 步：{StepTitles[stepIndex]}";

                var checkIcon = new SymbolIcon
                {
                    Symbol = Symbol.Accept,
                    Width = 12,
                    Height = 12,
                    Margin = new Thickness(0, 0, 4, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                    Foreground = (Brush)Application.Current.FindResource("SystemControlHighlightAccentBrush"),
                };
                contentPanel.Children.Add(checkIcon);

                var titleBlock = new TextBlock
                {
                    Text = StepTitles[stepIndex],
                    FontSize = 12,
                    FontWeight = FontWeights.Normal,
                    VerticalAlignment = VerticalAlignment.Center,
                    Foreground = (Brush)Application.Current.FindResource("SystemControlHighlightAccentBrush"),
                };
                contentPanel.Children.Add(titleBlock);

                capsule.MouseLeftButtonUp += (s, e) => StepSelected?.Invoke(this, stepIndex);
            }
            else if (isCurrent)
            {
                // 当前步骤：高亮强调背景 + 白色文字
                capsule.Background = (Brush)Application.Current.FindResource("SystemControlHighlightAccentBrush");
                capsule.Padding = new Thickness(10, 4, 10, 4);

                var dot = new Border
                {
                    Width = 6,
                    Height = 6,
                    CornerRadius = new CornerRadius(3),
                    Background = Brushes.White,
                    Margin = new Thickness(0, 0, 6, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                };
                contentPanel.Children.Add(dot);

                var titleBlock = new TextBlock
                {
                    Text = StepTitles[stepIndex],
                    FontSize = 12,
                    FontWeight = FontWeights.SemiBold,
                    VerticalAlignment = VerticalAlignment.Center,
                    Foreground = Brushes.White,
                };
                contentPanel.Children.Add(titleBlock);
            }
            else if (isReachable)
            {
                // 已解锁但非当前步骤
                capsule.Background = Brushes.Transparent;
                capsule.Cursor = Cursors.Hand;
                capsule.ToolTip = $"点击跳转至第 {stepIndex + 1} 步：{StepTitles[stepIndex]}";

                var numBlock = new TextBlock
                {
                    Text = $"{stepIndex + 1}.",
                    FontSize = 11,
                    Margin = new Thickness(0, 0, 3, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                    Foreground = (Brush)Application.Current.FindResource("SystemControlForegroundBaseMediumBrush"),
                };
                contentPanel.Children.Add(numBlock);

                var titleBlock = new TextBlock
                {
                    Text = StepTitles[stepIndex],
                    FontSize = 12,
                    VerticalAlignment = VerticalAlignment.Center,
                    Foreground = (Brush)Application.Current.FindResource("SystemControlForegroundBaseMediumBrush"),
                };
                contentPanel.Children.Add(titleBlock);

                capsule.MouseLeftButtonUp += (s, e) => StepSelected?.Invoke(this, stepIndex);
            }
            else
            {
                // 未解锁步骤：置灰不可点
                capsule.Background = Brushes.Transparent;
                capsule.Opacity = 0.5;

                var numBlock = new TextBlock
                {
                    Text = $"{stepIndex + 1}.",
                    FontSize = 11,
                    Margin = new Thickness(0, 0, 3, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                    Foreground = (Brush)Application.Current.FindResource("SystemControlForegroundBaseLowBrush"),
                };
                contentPanel.Children.Add(numBlock);

                var titleBlock = new TextBlock
                {
                    Text = StepTitles[stepIndex],
                    FontSize = 12,
                    VerticalAlignment = VerticalAlignment.Center,
                    Foreground = (Brush)Application.Current.FindResource("SystemControlForegroundBaseLowBrush"),
                };
                contentPanel.Children.Add(titleBlock);
            }

            capsule.Child = contentPanel;
            CapsuleContainer.Children.Add(capsule);

            // 如果不是最后一项，加入分隔符
            if (i < StepTitles.Length - 1)
            {
                var separator = new TextBlock
                {
                    Text = "›",
                    FontSize = 13,
                    FontWeight = FontWeights.Bold,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(1, 0, 1, 1),
                    Foreground = (Brush)Application.Current.FindResource("SystemControlForegroundBaseLowBrush"),
                };
                CapsuleContainer.Children.Add(separator);
            }
        }
    }
}
