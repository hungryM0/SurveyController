using System.Windows;
using System.Windows.Controls;

namespace SurveyController.App.Controls;

public enum InfoBarSeverity
{
    Informational,
    Success,
    Warning,
    Error
}

public class InfoBar : Control
{
    public static readonly DependencyProperty TitleProperty =
        DependencyProperty.Register(nameof(Title), typeof(string), typeof(InfoBar),
            new PropertyMetadata(string.Empty));

    public static readonly DependencyProperty MessageProperty =
        DependencyProperty.Register(nameof(Message), typeof(string), typeof(InfoBar),
            new PropertyMetadata(string.Empty));

    public static readonly DependencyProperty SeverityProperty =
        DependencyProperty.Register(nameof(Severity), typeof(InfoBarSeverity), typeof(InfoBar),
            new PropertyMetadata(InfoBarSeverity.Informational));

    public static readonly DependencyProperty IsOpenProperty =
        DependencyProperty.Register(nameof(IsOpen), typeof(bool), typeof(InfoBar),
            new PropertyMetadata(false, OnIsOpenChanged));

    public static readonly DependencyProperty IsClosableProperty =
        DependencyProperty.Register(nameof(IsClosable), typeof(bool), typeof(InfoBar),
            new PropertyMetadata(false));

    public string Title
    {
        get => (string)GetValue(TitleProperty);
        set => SetValue(TitleProperty, value);
    }

    public string Message
    {
        get => (string)GetValue(MessageProperty);
        set => SetValue(MessageProperty, value);
    }

    public InfoBarSeverity Severity
    {
        get => (InfoBarSeverity)GetValue(SeverityProperty);
        set => SetValue(SeverityProperty, value);
    }

    public bool IsOpen
    {
        get => (bool)GetValue(IsOpenProperty);
        set => SetValue(IsOpenProperty, value);
    }

    public bool IsClosable
    {
        get => (bool)GetValue(IsClosableProperty);
        set => SetValue(IsClosableProperty, value);
    }

    public event RoutedEventHandler? Closed;

    static InfoBar()
    {
        DefaultStyleKeyProperty.OverrideMetadata(typeof(InfoBar),
            new FrameworkPropertyMetadata(typeof(InfoBar)));
    }

    public InfoBar()
    {
        Visibility = IsOpen ? Visibility.Visible : Visibility.Collapsed;
    }

    private static void OnIsOpenChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is InfoBar bar)
        {
            var open = (bool)e.NewValue;
            bar.Visibility = open ? Visibility.Visible : Visibility.Collapsed;
            if (!open)
            {
                bar.Closed?.Invoke(bar, new RoutedEventArgs());
            }
        }
    }
}
