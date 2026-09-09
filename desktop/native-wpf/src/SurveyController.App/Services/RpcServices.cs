using SurveyController.Core.Rpc;

namespace SurveyController.App.Services;

/// <summary>
/// RPC 门面：页面只调用这里，不拼方法名或 JSON 信封。
/// 参数/返回值沿用 C++ 侧约定——字符串形式的 JSON。
/// </summary>
public static class SettingsService
{
    public static Task<string> LoadAsync() =>
        BackendClient.Current.CallAsync(RpcMethods.GetAppSettings, "null");

    public static Task<string> SaveAsync(string requestJson) =>
        BackendClient.Current.CallAsync(RpcMethods.SaveAppSettings, requestJson);

    public static Task<string> ResetAsync() =>
        BackendClient.Current.CallAsync(RpcMethods.ResetAppSettings, "null");
}

public static class ConfigService
{
    public static Task<string> LoadAsync(string? path = null)
    {
        var request = path is null ? new object() : new { path };
        return BackendClient.Current.CallAsync(RpcMethods.LoadConfig, Serialize(request));
    }

    public static Task<string> SaveAsync(string requestJson) =>
        BackendClient.Current.CallAsync(RpcMethods.SaveConfig, requestJson);

    public static Task<string> CreateSurveyAsync(string url) =>
        BackendClient.Current.CallAsync(RpcMethods.CreateSurveyDocument, Serialize(new { url }));

    public static Task<string> DecodeQRCodeAsync(string path) =>
        BackendClient.Current.CallAsync(RpcMethods.DecodeQRCode, Serialize(new { path }));

    public static Task<string> DecodeQRCodeSurveyAsync(string path) =>
        BackendClient.Current.CallAsync(RpcMethods.DecodeQRCodeSurvey, Serialize(new { path }));

    private static string Serialize(object value) =>
        System.Text.Json.JsonSerializer.Serialize(value);
}

public static class TaskService
{
    /// <summary>GetRunTaskState 轮询使用更短超时，与 C++ 侧 5s 一致。</summary>
    public static readonly TimeSpan RunStateTimeout = TimeSpan.FromSeconds(5);

    public static Task<string> CheckTaskAsync(string requestJson) =>
        BackendClient.Current.CallAsync(RpcMethods.CheckTask, requestJson);

    public static Task<string> StartRunAsync(string requestJson) =>
        BackendClient.Current.CallAsync(RpcMethods.StartRun, requestJson);

    public static Task<string> CheckAndStartAsync(string requestJson) =>
        BackendClient.Current.CallAsync(RpcMethods.CheckAndStart, requestJson);

    public static Task<string> GetRunTaskStateAsync(string runId, ulong afterSequence)
    {
        var payload = new System.Text.Json.Nodes.JsonObject
        {
            ["runId"] = runId ?? string.Empty,
            ["afterSequence"] = afterSequence,
        }.ToJsonString();
        return BackendClient.Current.CallAsync(RpcMethods.GetRunTaskState, payload, RunStateTimeout);
    }

    public static Task<string> PauseRunAsync(string reason) =>
        BackendClient.Current.CallAsync(RpcMethods.PauseRun, SerializeValue(new { value = reason }));

    public static Task<string> ResumeRunAsync() =>
        BackendClient.Current.CallAsync(RpcMethods.ResumeRun, "null");

    public static Task<string> CancelRunAsync() =>
        BackendClient.Current.CallAsync(RpcMethods.CancelRun, "null");

    public static Task<string> ExportLogLinesAsync(string path, IReadOnlyList<string> lines) =>
        BackendClient.Current.CallAsync(RpcMethods.ExportLogLines,
            SerializeValue(new { path, lines }));

    public static Task<string> TestAiConnectionAsync(string aiProfileJson) =>
        BackendClient.Current.CallAsync(RpcMethods.TestAIConnection,
            "{\"aiProfile\":" + aiProfileJson + "}");

    private static string SerializeValue<T>(T value) =>
        System.Text.Json.JsonSerializer.Serialize(value);
}

public static class ProxyService
{
    public static Task<string> GetProxyAreaOptionsAsync(string source) =>
        BackendClient.Current.CallAsync(RpcMethods.GetProxyAreaOptions,
            System.Text.Json.JsonSerializer.Serialize(new { value = source }));

    public static Task<string> TestFixedProxyAsync(string address) =>
        BackendClient.Current.CallAsync(RpcMethods.TestFixedProxy,
            System.Text.Json.JsonSerializer.Serialize(new { address }));

    public static Task<string> TestCustomProxyApiAsync(string url) =>
        BackendClient.Current.CallAsync(RpcMethods.TestCustomProxyAPI,
            System.Text.Json.JsonSerializer.Serialize(new { url }));

    public static Task<string> SyncStatusAsync(string source) =>
        BackendClient.Current.CallAsync(RpcMethods.SyncProxyStatus,
            System.Text.Json.JsonSerializer.Serialize(new { value = source }));
}

public static class CommunityService
{
    public static Task<string> CheckUpdateAsync(string currentVersion) =>
        BackendClient.Current.CallAsync(RpcMethods.CheckUpdate,
            System.Text.Json.JsonSerializer.Serialize(new { currentVersion }));

    public static Task<string> IpUsageAsync() =>
        BackendClient.Current.CallAsync(RpcMethods.GetIPUsageSummary, "null");
}
