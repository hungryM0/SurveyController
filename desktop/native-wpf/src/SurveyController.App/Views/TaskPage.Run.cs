using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Threading;
using ModernWpf.Controls;
using SurveyController.App.Controls;
using SurveyController.App.Services;

namespace SurveyController.App.Views;

/// <summary>运行态：状态轮询、日志、暂停/继续/停止与导出，对照 C++ TaskPage.Run.cpp。</summary>
public sealed partial class TaskPage
{
    private async void OnPauseRun(object sender, RoutedEventArgs e)
    {
        await RunControlAsync(() => TaskService.PauseRunAsync("用户暂停"), "暂停任务失败。");
    }

    private async void OnResumeRun(object sender, RoutedEventArgs e)
    {
        await RunControlAsync(TaskService.ResumeRunAsync, "恢复任务失败。");
    }

    private async void OnStopRun(object sender, RoutedEventArgs e)
    {
        await RunControlAsync(TaskService.CancelRunAsync, "停止任务失败。");
    }

    private async void OnExportLogs(object sender, RoutedEventArgs e)
    {
        try
        {
            var path = await ChooseSaveFileAsync(json: false);
            if (path.Length == 0)
            {
                return;
            }
            await ExportLinesAsync(path, [.. _logHistory], "日志已导出");
        }
        catch (Exception error)
        {
            SetFooterError(error.Message);
        }
    }

    private async void OnExportResult(object sender, RoutedEventArgs e)
    {
        if (_runResult is null)
        {
            return;
        }
        try
        {
            var path = await ChooseSaveFileAsync(json: true);
            if (path.Length == 0)
            {
                return;
            }
            var payload = new JsonObject
            {
                ["result"] = JsonNode.Parse(_runResult.ToJsonString()),
                ["logs"] = new JsonArray(_logHistory.Select(line => (JsonNode)line).ToArray()),
            };
            await ExportLinesAsync(path, [payload.ToJsonString()], "任务结果已导出");
        }
        catch (Exception error)
        {
            SetFooterError(error.Message);
        }
    }

    private Task<string> ChooseSaveFileAsync(bool json)
    {
        var picker = new Microsoft.Win32.SaveFileDialog
        {
            FileName = json ? "surveycontroller-result" : "surveycontroller-runtime",
            DefaultExt = json ? ".json" : ".log",
            Filter = json ? "JSON 文件 (*.json)|*.json|所有文件 (*.*)|*.*" : "日志文件 (*.log)|*.log|所有文件 (*.*)|*.*",
        };
        var result = picker.ShowDialog() == true ? picker.FileName : string.Empty;
        return Task.FromResult(result);
    }

    private async Task ExportLinesAsync(string path, IReadOnlyList<string> lines, string successMessage)
    {
        string error = string.Empty;
        try
        {
            await TaskService.ExportLogLinesAsync(path, lines);
        }
        catch (Exception value)
        {
            error = value.Message;
        }
        RunExportStatus.Severity = error.Length == 0 ? InfoBarSeverity.Success : InfoBarSeverity.Error;
        RunExportStatus.Title = error.Length == 0 ? successMessage : "导出失败";
        RunExportStatus.Message = error;
        RunExportStatus.IsOpen = true;
    }

    private void ApplyRunState(string json)
    {
        if (JsonNode.Parse(json) is not JsonObject state)
        {
            SetFooterError("后端响应格式无效");
            return;
        }
        var nextRunId = JsonFieldStr(state, "runId", _runId);
        if (nextRunId.Length > 0 && nextRunId != _runId)
        {
            LogLines.Clear();
            _logHistory.Clear();
            _runResult = null;
            RunResultCard.Visibility = Visibility.Collapsed;
            ExportResultButton.Visibility = Visibility.Collapsed;
            ExportLogsButton.Visibility = Visibility.Collapsed;
            RunExportStatus.IsOpen = false;
        }
        _runId = nextRunId;
        _afterSequence = (ulong)JsonFieldNumber(state, "nextSequence", _afterSequence);
        var status = JsonFieldStr(state, "status", "idle");
        var runTitle = status switch
        {
            "running" => "运行中",
            "paused" => "已暂停",
            "succeeded" => "已完成",
            "failed" => "运行失败",
            "canceling" => "正在停止",
            "stopped" => "已停止",
            _ => "尚未启动",
        };
        RunStatus.Title = runTitle;
        RunStatus.Severity = RunSeverity(status);
        if (state["events"] is JsonArray events)
        {
            foreach (var value in events)
            {
                if (value is not JsonObject wrapper)
                {
                    continue;
                }
                var eventNode = wrapper["event"] as JsonObject ?? [];
                var message = JsonFieldStr(eventNode, "message", string.Empty);
                if (message.Length > 0)
                {
                    var worker = JsonFieldStr(eventNode, "worker", "core");
                    var line = $"[{worker}] {message}";
                    _logHistory.Add(line);
                    if (_logHistory.Count > 200)
                    {
                        _logHistory.RemoveAt(0);
                    }
                    LogLines.Add(line);
                    if (LogLines.Count > 200)
                    {
                        LogLines.RemoveAt(0);
                    }
                }
                var total = JsonFieldNumber(eventNode, "total", 0);
                var current = JsonFieldNumber(eventNode, "current", 0);
                if (total > 0)
                {
                    RunProgress.Maximum = total;
                    RunProgress.Value = Math.Min(current, total);
                    RunProgressText.Text = $"{(int)current} / {(int)total}";
                }
                if (message.Length > 0)
                {
                    RunStatus.Message = message;
                }
            }
        }
        _runResult = state["result"] as JsonObject;
        if (_runResult is { } result && result.Count > 0)
        {
            var success = (int)JsonFieldNumber(result, "success", 0);
            var fail = (int)JsonFieldNumber(result, "fail", 0);
            RunResultSuccess.Text = success.ToString();
            RunResultFail.Text = fail.ToString();
            RunResultTotal.Text = (success + fail).ToString();
            RunResultCard.Visibility = Visibility.Visible;
            ExportResultButton.Visibility = Visibility.Visible;
        }
        ExportLogsButton.Visibility = _logHistory.Count == 0 ? Visibility.Collapsed : Visibility.Visible;
        var stateError = JsonFieldStr(state, "error", string.Empty);
        if (stateError.Length > 0)
        {
            RunStatus.Message = stateError;
        }
        var active = status is "running" or "paused" or "canceling";
        var notifyEnabled = _settings is null || JsonFieldBool(_settings, "taskResultNotification", true);
        if (!active && _runId.Length > 0 && _notifiedRunId != _runId &&
            notifyEnabled && (_runResult is { Count: > 0 } || stateError.Length > 0))
        {
            var title = stateError.Length == 0 ? "任务执行完成" : "任务执行失败";
            var body = stateError;
            if (body.Length == 0 && _runResult is { } runResult)
            {
                var success = (int)JsonFieldNumber(runResult, "success", 0);
                var fail = (int)JsonFieldNumber(runResult, "fail", 0);
                body = $"成功 {success} 份，失败 {fail} 份";
            }
            TaskNotification.Show(title, body);
            _notifiedRunId = _runId;
        }
        PauseButton.IsEnabled = status == "running";
        ResumeButton.IsEnabled = status == "paused";
        StopButton.IsEnabled = active && status != "canceling";
        PrimaryButton.IsEnabled = !active && !_busy;
        if (!active && _pollTimer is not null)
        {
            _pollTimer.Stop();
        }
    }

    private void StartPolling()
    {
        if (!_isLoaded || _runId.Length == 0)
        {
            return;
        }
        if (_pollTimer is null)
        {
            _pollTimer = new DispatcherTimer();
            _pollTimer.Interval = TimeSpan.FromMilliseconds(700);
            _pollTimer.Tick += (_, _) => _ = PollRunAsync();
        }
        _pollFailures = 0;
        _pollTimer.Interval = TimeSpan.FromMilliseconds(700);
        _pollTimer.Start();
    }

    private void StopPolling()
    {
        _pollTimer?.Stop();
        _polling = false;
    }

    private async Task PollRunAsync()
    {
        if (_polling || _runId.Length == 0 || !_isLoaded)
        {
            return;
        }
        _polling = true;
        var generation = _pageGeneration;
        var runId = _runId;
        string result;
        string error = string.Empty;
        try
        {
            result = await TaskService.GetRunTaskStateAsync(runId, _afterSequence);
        }
        catch (Exception value)
        {
            result = string.Empty;
            error = value.Message;
        }
        if (!_isLoaded || generation != _pageGeneration || runId != _runId)
        {
            // 过期请求必须释放守卫，否则后续轮询会被永久阻塞。
            _polling = false;
            return;
        }
        _polling = false;
        if (_pollTimer is null)
        {
            return;
        }
        if (error.Length > 0)
        {
            _pollFailures++;
            if (_pollFailures >= 3)
            {
                StopPolling();
                SetFooterError("后端连接已中断，请重新进入任务页后重试：" + error);
                return;
            }
            _pollTimer.Interval = TimeSpan.FromMilliseconds(700 * (1 << Math.Min(_pollFailures, 6)));
            return;
        }
        _pollFailures = 0;
        _pollTimer.Interval = TimeSpan.FromMilliseconds(700);
        ApplyRunState(result);
    }

    private async Task RunControlAsync(Func<Task<string>> action, string fallbackError)
    {
        if (_busy)
        {
            return;
        }
        SetBusy(true, "正在更新任务状态");
        string result;
        string error = string.Empty;
        try
        {
            result = await action();
        }
        catch (Exception value)
        {
            result = string.Empty;
            error = value.Message.Length > 0 ? value.Message : fallbackError;
        }
        SetBusy(false);
        if (error.Length > 0)
        {
            SetFooterError(error);
            return;
        }
        ApplyRunState(result);
    }

    private static InfoBarSeverity RunSeverity(string status) => status switch
    {
        "succeeded" => InfoBarSeverity.Success,
        "paused" => InfoBarSeverity.Warning,
        "failed" => InfoBarSeverity.Error,
        _ => InfoBarSeverity.Informational,
    };
}
