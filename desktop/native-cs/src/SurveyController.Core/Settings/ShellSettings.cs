namespace SurveyController.Core.Settings;

/// <summary>
/// 最近一次应用设置 JSON 的进程内快照；语义与 C++ Services/ShellSettings 一致：
/// 更新时通知当前处理器，新处理器注册时回放当前值。
/// </summary>
public sealed class ShellSettings
{
    public static ShellSettings Current { get; } = new();

    private Action<string>? _changed;

    public string Json { get; private set; } = string.Empty;

    public void Update(string json)
    {
        Json = json;
        _changed?.Invoke(Json);
    }

    public void SetChangedHandler(Action<string>? handler)
    {
        _changed = handler;
        if (handler is not null && Json.Length > 0)
        {
            handler(Json);
        }
    }
}
