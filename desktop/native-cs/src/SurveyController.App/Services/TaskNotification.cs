using System.Text;
using Microsoft.Windows.AppNotifications;

namespace SurveyController.App.Services;

/// <summary>任务完成/失败的系统 Toast 通知，语义与 C++ Services/TaskNotification 一致。</summary>
internal static class TaskNotification
{
    private static bool _registered;

    public static bool Show(string title, string body)
    {
        try
        {
            EnsureRegistered();
            var payload = new StringBuilder("<toast><visual><binding template=\"ToastGeneric\"><text>")
                .Append(EscapeXml(title))
                .Append("</text><text>")
                .Append(EscapeXml(body))
                .Append("</text></binding></visual></toast>")
                .ToString();
            AppNotificationManager.Default().Show(new AppNotification(payload));
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    private static void EnsureRegistered()
    {
        if (_registered)
        {
            return;
        }
        var manager = AppNotificationManager.Default();
        manager.NotificationInvoked += (_, _) =>
        {
            // 激活行为暂不处理；注册事件以维持与 C++ 相同的生命周期。
        };
        manager.Register();
        _registered = true;
    }

    private static string EscapeXml(string value)
    {
        var builder = new StringBuilder(value.Length);
        foreach (var character in value)
        {
            switch (character)
            {
                case '&': builder.Append("&amp;"); break;
                case '<': builder.Append("&lt;"); break;
                case '>': builder.Append("&gt;"); break;
                case '"': builder.Append("&quot;"); break;
                case '\'': builder.Append("&apos;"); break;
                default: builder.Append(character); break;
            }
        }
        return builder.ToString();
    }
}
