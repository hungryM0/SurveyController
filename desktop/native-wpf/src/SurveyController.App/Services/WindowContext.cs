using System.Windows;
using System.Windows.Interop;

namespace SurveyController.App.Services;

/// <summary>主窗口 HWND 的进程内快照，供选择器和弹层定位宿主。</summary>
internal static class WindowContext
{
    public static IntPtr MainWindowHwnd { get; private set; }
    public static Window? MainWindow { get; private set; }

    public static void SetMainWindow(Window window)
    {
        MainWindow = window;
        MainWindowHwnd = new WindowInteropHelper(window).EnsureHandle();
    }
}
