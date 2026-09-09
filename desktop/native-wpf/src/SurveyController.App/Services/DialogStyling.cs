using ModernWpf.Controls;

namespace SurveyController.App.Services;

/// <summary>
/// ContentDialog 辅助类：ModernWpf 下自动管理主题与所有者。
/// </summary>
internal static class DialogStyling
{
    public static void PrepareContentDialog(ContentDialog dialog)
    {
        if (WindowContext.MainWindow is not null)
        {
            dialog.Owner = WindowContext.MainWindow;
        }
    }
}
