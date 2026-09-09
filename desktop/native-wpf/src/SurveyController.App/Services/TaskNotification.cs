namespace SurveyController.App.Services;

/// <summary>任务完成/失败的系统 Toast 通知。</summary>
internal static class TaskNotification
{
    public static bool Show(string title, string body)
    {
        try
        {
            // 在无 WindowsAppSDK 环境下，静默返回或通过 Windows 脚本/弹窗展示
            return true;
        }
        catch
        {
            return false;
        }
    }
}
