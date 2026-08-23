using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace SurveyController.App.Services;

/// <summary>
/// 代码创建的 ContentDialog 需要显式套用 WinUI 样式并跟随宿主主题，
/// 行为与 C++ Services/DialogStyling.h 一致。
/// </summary>
internal static class DialogStyling
{
    public static void PrepareContentDialog(ContentDialog dialog, XamlRoot root)
    {
        dialog.XamlRoot = root;

        if (root.Content is not FrameworkElement host)
        {
            return;
        }

        // 跟随应用与系统主题切换，保证模板和过渡动画一致。
        dialog.RequestedTheme = host.RequestedTheme;
        host.ActualThemeChanged += (_, _) => dialog.RequestedTheme = host.RequestedTheme;

        if (Application.Current.Resources.TryGetValue("DefaultContentDialogStyle", out object? value)
            && value is Style style)
        {
            dialog.Style = style;
        }
    }
}
