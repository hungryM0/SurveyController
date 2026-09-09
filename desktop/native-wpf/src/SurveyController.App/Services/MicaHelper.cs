using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using ModernWpf;

namespace SurveyController.App.Services;

/// <summary>
/// Windows 11 原生 Mica (云母) 与 DWM 沉浸式暗色模式集成。
/// 在 Windows 11 上自动开启硬件加速 Mica 材质；在 Windows 10 及更早系统上优雅安全回退。
/// </summary>
public static class MicaHelper
{
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
    private const int DWMWA_SYSTEMBACKDROP_TYPE = 38;
    private const int DWMWA_MICA_EFFECT = 1029;

    public const int DWMSBT_AUTO = 0;
    public const int DWMSBT_NONE = 1;
    public const int DWMSBT_MAINWINDOW = 2;       // 经典 Mica
    public const int DWMSBT_TRANSIENTWINDOW = 3;  // Acrylic 亚克力
    public const int DWMSBT_TABBEDWINDOW = 4;     // Mica Alt (更深层次材质)

    /// <summary>当前 Windows 系统是否满足 Mica 最低版本要求 (Windows 11 Build 22000+)。</summary>
    public static bool IsSupported => Environment.OSVersion.Version.Build >= 22000;

    /// <summary>
    /// 为指定的 WPF 窗口启用原生 Mica 背景材质。
    /// </summary>
    public static bool TryEnableMica(Window window, int backdropType = DWMSBT_MAINWINDOW)
    {
        if (!IsSupported)
        {
            return false;
        }

        var hwnd = new WindowInteropHelper(window).Handle;
        if (hwnd == IntPtr.Zero)
        {
            return false;
        }

        try
        {
            // 同步沉浸式暗色模式状态（使原生边框/标题栏样式与应用主题协调）
            UpdateDarkMode(hwnd, window);

            // 设置 DWM 背景属性
            var build = Environment.OSVersion.Version.Build;
            int hr;
            if (build >= 22621)
            {
                // Windows 11 22H2+ 标准公开 API
                hr = DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, ref backdropType, sizeof(int));
            }
            else
            {
                // Windows 11 21H2 早期 API
                var trueVal = 1;
                hr = DwmSetWindowAttribute(hwnd, DWMWA_MICA_EFFECT, ref trueVal, sizeof(int));
            }

            return hr == 0;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// 同步窗口的沉浸式暗色模式（影响标题栏、控制按钮及 Mica 采样色调）。
    /// </summary>
    public static void UpdateDarkMode(IntPtr hwnd, FrameworkElement element)
    {
        if (hwnd == IntPtr.Zero)
        {
            return;
        }

        try
        {
            var isDark = ThemeManager.GetActualTheme(element) == ElementTheme.Dark;
            var darkMode = isDark ? 1 : 0;
            DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int));
        }
        catch
        {
        }
    }
}
