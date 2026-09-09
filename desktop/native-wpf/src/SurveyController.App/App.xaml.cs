using System.IO;
using System.Windows;
using SurveyController.Core.Rpc;

namespace SurveyController.App;

/// <summary>应用入口：处理异常捕获与主窗口生命周期。</summary>
public partial class App : Application
{
    private MainWindow? _window;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        DispatcherUnhandledException += (s, args) =>
        {
            try
            {
                var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "crash.log");
                File.AppendAllText(logPath, $"[{DateTime.Now}] DispatcherUnhandledException: {args.Exception}\n");
            }
            catch
            {
            }
            // 标记已处理，防止程序无征兆闪退
            args.Handled = true;
        };

        AppDomain.CurrentDomain.UnhandledException += (s, args) =>
        {
            try
            {
                var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "crash.log");
                File.AppendAllText(logPath, $"[{DateTime.Now}] AppDomain.UnhandledException: {args.ExceptionObject}\n");
            }
            catch
            {
            }
        };

        _window = new MainWindow();
        _window.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        try
        {
            BackendClient.Current.ShutdownImmediate();
        }
        catch
        {
        }
        base.OnExit(e);
    }
}
