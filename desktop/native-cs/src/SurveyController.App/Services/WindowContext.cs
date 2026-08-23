using Microsoft.UI;
using Microsoft.UI.Xaml;
using WinRT.Interop;

namespace SurveyController.App.Services;

/// <summary>主窗口 HWND / WindowId 的进程内快照，供选择器和弹层定位宿主。</summary>
internal static class WindowContext
{
    public static nint MainWindowHwnd { get; private set; }

    public static WindowId MainWindowId { get; private set; }

    public static void SetMainWindow(Window window)
    {
        MainWindowHwnd = WindowNative.GetWindowHandle(window);
        MainWindowId = Win32Interop.GetWindowIdFromWindow(MainWindowHwnd);
    }
}
