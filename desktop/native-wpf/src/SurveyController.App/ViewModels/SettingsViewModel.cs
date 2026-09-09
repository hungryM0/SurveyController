using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using SurveyController.App.Services;
using SurveyController.Core.Settings;

namespace SurveyController.App.ViewModels;

/// <summary>
/// 设置页状态：加载→控件双向绑定→30ms 防抖保存→回写 ShellSettings。
/// </summary>
public partial class SettingsViewModel : ObservableObject
{
    private static readonly int[] LogCountValues = [3, 5, 10, 20, 30, 50];

    private DispatcherTimer? _saveTimer;
    private JsonObject _settings = new();
    private bool _loading;
    private bool _saving;
    private bool _savePending;
    private int _saveGeneration;

    public SettingsViewModel()
    {
    }

    [ObservableProperty]
    private string _statusText = string.Empty;

    [ObservableProperty]
    private int _themeModeIndex;

    [ObservableProperty]
    private bool _showNavigationText = true;

    [ObservableProperty]
    private bool _topmost;

    [ObservableProperty]
    private bool _askSaveOnClose = true;

    [ObservableProperty]
    private bool _preventSleep = true;

    [ObservableProperty]
    private bool _taskResultNotification = true;

    [ObservableProperty]
    private bool _submissionReportTelemetry = true;

    [ObservableProperty]
    private bool _autoCheckUpdate = true;

    [ObservableProperty]
    private int _logCountIndex = 2;

    [ObservableProperty]
    private string _configDirectory = string.Empty;

    /// <summary>用设置 JSON 刷新控件；失败时抛出异常由页面呈现。</summary>
    public void LoadFrom(string json)
    {
        _loading = true;
        try
        {
            if (JsonNode.Parse(json) is not JsonObject parsed)
            {
                throw new InvalidOperationException("后端响应格式无效");
            }
            _settings = parsed;
            ThemeModeIndex = Str(_settings, "themeMode", "system") switch
            {
                "light" => 1,
                "dark" => 2,
                _ => 0,
            };
            ShowNavigationText = Bool(_settings, "showNavigationText", true);
            Topmost = Bool(_settings, "topmost");
            AskSaveOnClose = Bool(_settings, "askSaveOnClose", true);
            PreventSleep = Bool(_settings, "preventSleepDuringRun", true);
            TaskResultNotification = Bool(_settings, "taskResultNotification", true);
            SubmissionReportTelemetry = Bool(_settings, "submissionReportTelemetry", true);
            AutoCheckUpdate = Bool(_settings, "autoCheckUpdate", true);
            ConfigDirectory = Str(_settings, "configDirectory", string.Empty);

            var count = Int(_settings, "autosaveLogCount", 10);
            LogCountIndex = IndexOfLogCount(count);
        }
        finally
        {
            _loading = false;
        }
    }

    public string BuildSaveRequest()
    {
        _settings["themeMode"] = ThemeModeIndex switch { 1 => "light", 2 => "dark", _ => "system" };
        _settings["showNavigationText"] = ShowNavigationText;
        _settings["topmost"] = Topmost;
        _settings["askSaveOnClose"] = AskSaveOnClose;
        _settings["preventSleepDuringRun"] = PreventSleep;
        _settings["taskResultNotification"] = TaskResultNotification;
        _settings["submissionReportTelemetry"] = SubmissionReportTelemetry;
        _settings["autoSaveLogs"] = true;
        _settings["autoCheckUpdate"] = AutoCheckUpdate;
        _settings["configDirectory"] = ConfigDirectory;
        _settings["autosaveLogCount"] = LogCountIndex >= 0 && LogCountIndex < LogCountValues.Length
            ? LogCountValues[LogCountIndex]
            : 10;

        var request = new JsonObject
        {
            ["settings"] = JsonNode.Parse(_settings.ToJsonString()),
            ["aiCredential"] = new JsonObject { ["operation"] = "keep" },
        };
        return request.ToJsonString();
    }

    public void ScheduleSave()
    {
        if (_loading)
        {
            return;
        }
        _saveGeneration++;
        _savePending = true;
        if (_saveTimer is null)
        {
            _saveTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(30)
            };
            _saveTimer.Tick += (_, _) =>
            {
                _saveTimer.Stop();
                _ = SaveAsync();
            };
        }
        _saveTimer.Stop();
        _saveTimer.Start();
    }

    public void CancelPendingSave()
    {
        _saveGeneration++;
        _savePending = false;
        _saveTimer?.Stop();
    }

    public async Task SaveAsync()
    {
        if (_saving)
        {
            return;
        }
        _saving = true;
        try
        {
            while (_savePending)
            {
                _savePending = false;
                var generation = _saveGeneration;
                var request = BuildSaveRequest();
                try
                {
                    var saved = await SettingsService.SaveAsync(request);
                    if (generation == _saveGeneration)
                    {
                        LoadFrom(saved);
                        ShellSettings.Current.Update(saved);
                    }
                }
                catch (Exception error)
                {
                    StatusText = error.Message;
                }
            }
        }
        finally
        {
            _saving = false;
        }
    }

    public async Task ResetToDefaultsAsync()
    {
        CancelPendingSave();
        try
        {
            var saved = await SettingsService.ResetAsync();
            LoadFrom(saved);
            ShellSettings.Current.Update(saved);
            StatusText = "已恢复默认设置";
        }
        catch (Exception error)
        {
            StatusText = error.Message;
        }
    }

    public async Task ChooseConfigDirectoryAsync(string folderPath)
    {
        ConfigDirectory = folderPath;
        ScheduleSave();
        await Task.CompletedTask;
    }

    private static int IndexOfLogCount(int count)
    {
        var index = Array.IndexOf(LogCountValues, count);
        return index >= 0 ? index : IndexOfLogCount(10);
    }

    private static string Str(JsonObject parent, string name, string fallback) =>
        parent[name] is JsonValue value && value.TryGetValue<string>(out var text) ? text : fallback;

    private static bool Bool(JsonObject parent, string name, bool fallback = false)
    {
        if (parent[name] is not JsonValue value)
        {
            return fallback;
        }
        if (value.TryGetValue<bool>(out var flag))
        {
            return flag;
        }
        return fallback;
    }

    private static int Int(JsonObject parent, string name, int fallback)
    {
        if (parent[name] is JsonValue value && value.TryGetValue<int>(out var number))
        {
            return number;
        }
        return fallback;
    }
}
