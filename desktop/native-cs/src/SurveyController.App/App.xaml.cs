using Microsoft.UI.Xaml;

namespace SurveyController.App;

/// <summary>应用入口：P0 阶段仅激活主窗口；壳层初始化在 P1 接入。</summary>
public partial class App : Application
{
    private Window? _window;

    public App()
    {
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
        _window.Activate();
    }
}
