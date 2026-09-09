namespace SurveyController.Core.Rpc;

/// <summary>
/// 与 desktop/internal/rpc 的方法名契约一一对应（见 rpc_handler.go）。
/// 壳层不得自行拼写 RPC 方法名字符串。
/// </summary>
public static class RpcMethods
{
    public const string GetAppSettings = "GetAppSettings";
    public const string SaveAppSettings = "SaveAppSettings";
    public const string ResetAppSettings = "ResetAppSettings";
    public const string LoadConfig = "LoadConfig";
    public const string SaveConfig = "SaveConfig";
    public const string CreateSurveyDocument = "CreateSurveyDocument";
    public const string DecodeQRCode = "DecodeQRCode";
    public const string DecodeQRCodeSurvey = "DecodeQRCodeSurvey";
    public const string CheckTask = "CheckTask";
    public const string StartRun = "StartRun";
    public const string CheckAndStart = "CheckAndStart";
    public const string GetRunTaskState = "GetRunTaskState";
    public const string CancelRun = "CancelRun";
    public const string PauseRun = "PauseRun";
    public const string ResumeRun = "ResumeRun";
    public const string GetProxyStatus = "GetProxyStatus";
    public const string GetProxyAreaOptions = "GetProxyAreaOptions";
    public const string SyncProxyStatus = "SyncProxyStatus";
    public const string RedeemProxyCard = "RedeemProxyCard";
    public const string TestCustomProxyAPI = "TestCustomProxyAPI";
    public const string TestFixedProxy = "TestFixedProxy";
    public const string TestAIConnection = "TestAIConnection";
    public const string PreviewReverseFill = "PreviewReverseFill";
    public const string ExportLogLines = "ExportLogLines";
    public const string CheckUpdate = "CheckUpdate";
    public const string GetIPUsageSummary = "GetIPUsageSummary";
}
