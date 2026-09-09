using System.Collections.ObjectModel;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Threading;
using ModernWpf.Controls;
using SurveyController.App.Controls;
using SurveyController.App.Services;
using SurveyController.Core.Document;
using SurveyController.Core.Rpc;
using SurveyController.Core.Settings;

namespace SurveyController.App.Views;

/// <summary>页面在关闭前需要做的收尾。</summary>
internal interface IShutdownAware
{
    void PrepareForShutdown();
}

/// <summary>
/// 任务向导：六步表单 + 运行监控。行为对照 C++ TaskPage.xaml.cpp；
/// 运行轮询与代理编排分别在 TaskPage.Run.cs / TaskPage.Proxy.cs。
/// </summary>
public sealed partial class TaskPage : UserControl, IShutdownAware
{
    private readonly WizardDocument _document = WizardDocument.Current;
    private JsonObject? _settings;
    private JsonObject? _proxyAreaOptions;
    private JsonObject? _runResult;
    private readonly List<string> _logHistory = [];
    private DispatcherTimer? _pollTimer;
    private string _reverseFillPath = string.Empty;
    private string _proxyAreaCode = string.Empty;
    private string _runId = string.Empty;
    private string _notifiedRunId = string.Empty;
    private ulong _afterSequence;
    private int _step;
    private int _highestStep;
    private bool _parsed;
    private bool _busy;
    private bool _polling;
    private bool _updatingProxyAreas;
    private bool _initialized;
    private bool _isLoaded;
    private uint _pageGeneration;
    private int _pollFailures;

    public ObservableCollection<string> LogLines { get; } = [];

    public TaskPage()
    {
        InitializeComponent();
        StepCapsuleIndicator.StepSelected += OnStepCapsuleSelected;
        _initialized = true;
        InitializeState();
    }

    private void OnStepCapsuleSelected(object? sender, int targetStep)
    {
        if (!_busy && targetStep <= _highestStep)
        {
            MoveToStep(targetStep);
        }
    }

    private static int Clamp(int value, int min, int max) => Math.Max(min, Math.Min(max, value));

    private static double Clamp(double value, double min, double max) => Math.Max(min, Math.Min(max, value));

    private static int NumberValue(NumberBox control, int fallback, int minimum, int maximum)
    {
        var value = control.Value;
        if (double.IsNaN(value))
        {
            return fallback;
        }
        return Clamp((int)value, minimum, maximum);
    }

    private static string EscapeJsonString(string value) => JsonSerializer.Serialize(value);

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        _isLoaded = true;
        _pageGeneration++;
        if (_runId.Length > 0)
        {
            StartPolling();
        }
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        _isLoaded = false;
        _pageGeneration++;
        StopPolling();
    }

    public void PrepareForShutdown()
    {
        _isLoaded = false;
        _pageGeneration++;
        StopPolling();
    }

    private void InitializeState()
    {
        try
        {
            if (JsonNode.Parse(ShellSettings.Current.Json) is not JsonObject settings)
            {
                throw new InvalidOperationException("后端响应格式无效");
            }
            _settings = settings;
            _parsed = _document.HasRealSurvey();
            _highestStep = _parsed ? 5 : 0;
            PopulateControls();
            MoveToStep(0, force: true);
        }
        catch (Exception error)
        {
            SetFooterError(error.Message);
        }
        UpdateStepVisuals();
    }

    private void PopulateControls()
    {
        SurveyUrl.Text = _document.URL();
        SelectTag(ProxyMode, _document.ProxyMode());
        FixedProxyAddress.Text = _document.FixedProxyAddress();
        SelectTag(ProxySource, _document.ProxySource());
        CustomProxyApi.Text = _document.CustomProxyAPI();
        _proxyAreaCode = _document.ProxyAreaCode();
        RandomUA.IsOn = _document.RandomUA();
        _reverseFillPath = _document.ReverseFillPath();
        ReverseFillEnabled.IsOn = _document.ReverseFillEnabled();
        ReverseFillButtonLabel.Text = _reverseFillPath.Length == 0 ? "选择 Excel" : "更换 Excel";
        PsychometricsEnabled.IsOn = _document.PsychometricsEnabled();
        TargetAlpha.Value = _document.TargetAlpha();
        UpdatePsychometricsVisibility();
        var duration = _document.AnswerDuration();
        AnswerDurationMin.Value = duration.Min;
        AnswerDurationMax.Value = duration.Max;
        var interval = _document.SubmitInterval();
        SubmitIntervalMin.Value = interval.Min;
        SubmitIntervalMax.Value = interval.Max;
        var window = _document.AnswerWindow();
        if (!ParseWindowValue(window.Start, WindowStartDate, WindowStartTime) ||
            !ParseWindowValue(window.End, WindowEndDate, WindowEndTime))
        {
            SetFooterError("配置中的时间窗口格式无效，应为 YYYY-MM-DD HH:mm:ss。请重新填写。");
        }
        FailStop.IsOn = _document.FailStop();
        PauseCaptcha.IsOn = _document.PauseCaptcha();
        TargetCount.Value = _document.Target();
        ThreadCount.Value = _document.Threads();
        UpdateAnswerStats();
        UpdateNetworkVisibility();
        _ = LoadProxyAreaOptions();
        UpdateReview();
    }

    private void UpdateAnswerStats()
    {
        var questions = _document.Questions();
        var configured = 0;
        var ai = 0;
        var problems = 0;
        foreach (var question in questions)
        {
            if (question.Configured)
            {
                configured++;
            }
            if (question.AiEnabled)
            {
                ai++;
            }
            if (!question.Configured || question.Unsupported)
            {
                problems++;
            }
        }
        AnswerTotalCount.Text = questions.Count.ToString();
        AnswerConfiguredCount.Text = configured.ToString();
        AnswerAICount.Text = ai.ToString();
        AnswerProblemCount.Text = problems.ToString();
    }

    private void ScheduleRuleRefresh()
    {
        Dispatcher.BeginInvoke((Action)(() => RuleEditorView.Refresh()));
    }

    private void UpdatePsychometricsVisibility()
    {
        PsychometricsRow.Visibility = PsychometricsEnabled.IsOn ? Visibility.Visible : Visibility.Collapsed;
    }

    private void OnPsychometricsToggled(object sender, RoutedEventArgs e)
    {
        if (_initialized)
        {
            UpdatePsychometricsVisibility();
        }
    }

    private bool SyncControlsToDocument()
    {
        var durationMin = NumberValue(AnswerDurationMin, 60, 1, 3600);
        var durationMax = Math.Max(durationMin, NumberValue(AnswerDurationMax, 120, 1, 3600));
        var target = NumberValue(TargetCount, 1, 1, 999999);
        var threads = Math.Min(target, NumberValue(ThreadCount, 1, 1, 128));
        var intervalMin = NumberValue(SubmitIntervalMin, 0, 0, 1800);
        var intervalMax = Math.Max(intervalMin, NumberValue(SubmitIntervalMax, 0, 0, 1800));
        if (!ReadWindowValue(WindowStartDate, WindowStartTime, out var windowStart, out var windowError) ||
            !ReadWindowValue(WindowEndDate, WindowEndTime, out var windowEnd, out windowError))
        {
            SetFooterError(windowError);
            return false;
        }
        if (windowStart.Length == 0 != (windowEnd.Length == 0))
        {
            SetFooterError("时间窗口必须同时填写开始和结束时间，或全部清空。");
            return false;
        }
        if (windowStart.Length > 0 && string.Compare(windowStart, windowEnd, StringComparison.Ordinal) >= 0)
        {
            SetFooterError("时间窗口的开始时间必须早于结束时间。");
            return false;
        }
        _document.SetExecution(target, threads, intervalMin, intervalMax, durationMin, durationMax,
            windowStart, windowEnd, FailStop.IsOn, PauseCaptcha.IsOn);
        _document.SetNetwork(SelectedTag(ProxyMode, "direct"), FixedProxyAddress.Text,
            SelectedTag(ProxySource, "default"), CustomProxyApi.Text, _proxyAreaCode, RandomUA.IsOn);
        _document.SetReverseFill(ReverseFillEnabled.IsOn, _reverseFillPath);
        var alphaValue = TargetAlpha.Value;
        if (double.IsNaN(alphaValue))
        {
            alphaValue = 0.85;
        }
        alphaValue = Clamp(alphaValue, 0.5, 0.99);
        _document.SetPsychometrics(PsychometricsEnabled.IsOn, alphaValue);
        return true;
    }

    private async void OnPrimary(object sender, RoutedEventArgs e)
    {
        if (_busy)
        {
            return;
        }
        if (!SyncControlsToDocument())
        {
            return;
        }
        if (_step > 0 && _step < 5)
        {
            MoveToStep(_step + 1);
            return;
        }
        if (_step == 0 && _parsed)
        {
            MoveToStep(1);
            return;
        }

        string? method = null;
        string surveyUrl = string.Empty;
        string requestJson = string.Empty;
        if (_step == 0)
        {
            surveyUrl = SurveyUrl.Text;
            method = RpcMethods.CreateSurveyDocument;
            requestJson = "{\"url\":" + EscapeJsonString(surveyUrl) + "}";
            SetBusy(true, "正在解析问卷");
        }
        else if (_step == 5)
        {
            method = RpcMethods.CheckAndStart;
            // 检查、持久化、启动由 Go 应用服务作为一个事务完成。
            requestJson = _document.SaveRequest();
            SetBusy(true, "正在检查配置并启动任务");
        }

        string result = string.Empty;
        string error = string.Empty;
        try
        {
            result = method == RpcMethods.CheckAndStart
                ? await TaskService.CheckAndStartAsync(requestJson)
                : await ConfigService.CreateSurveyAsync(surveyUrl);
        }
        catch (Exception value)
        {
            error = value.Message;
        }

        SetBusy(false);
        if (error.Length > 0)
        {
            SetFooterError(error);
            return;
        }
        if (method == RpcMethods.CreateSurveyDocument)
        {
            try
            {
                _document.SetParsedConfig(result);
                _parsed = _document.HasRealSurvey();
                if (!_parsed)
                {
                    SetFooterError("解析结果没有真实可作答题目。");
                    return;
                }
                PopulateControls();
                SurveyStatus.Title = "问卷解析完成";
                SurveyStatus.Message = _document.Title();
                SurveyStatus.Severity = InfoBarSeverity.Success;
                SurveyStatus.IsOpen = true;
                MoveToStep(1, force: true);
            }
            catch (Exception value)
            {
                SetFooterError("问卷解析结果无效：" + value.Message);
            }
        }
        else if (method == RpcMethods.CheckAndStart)
        {
            ApplyRunState(result);
            MoveToStep(6, force: true);
            StartPolling();
        }
    }

    private void OnBack(object sender, RoutedEventArgs e)
    {
        if (!_busy && _step > 0)
        {
            MoveToStep(_step - 1, force: true);
        }
    }

    private AnswerEditorWindow? _answerEditor;

    private void OnEditAnswers(object sender, RoutedEventArgs e)
    {
        if (_busy)
        {
            return;
        }
        if (_answerEditor is not null)
        {
            _answerEditor.Activate();
            return;
        }
        try
        {
            var window = new AnswerEditorWindow();
            window.Closed += (_, _) =>
            {
                _answerEditor = null;
                UpdateAnswerStats();
                UpdateStepVisuals();
            };
            _answerEditor = window;
            window.Show();
        }
        catch (Exception error)
        {
            _answerEditor = null;
            SetFooterError("答案编辑器打开失败：" + error.Message);
        }
    }

    private void OnSurveyUrlChanged(object sender, TextChangedEventArgs e)
    {
        if (!_document.HasRealSurvey() || SurveyUrl.Text == _document.URL())
        {
            return;
        }
        _parsed = false;
        _highestStep = 0;
        _document.SetSurveyURL(SurveyUrl.Text);
        SurveyStatus.Title = "链接已修改";
        SurveyStatus.Message = "需要重新解析问卷。";
        SurveyStatus.Severity = InfoBarSeverity.Warning;
        SurveyStatus.IsOpen = true;
        UpdateStepVisuals();
    }

    private async void OnImportConfig(object sender, RoutedEventArgs e)
    {
        string path;
        try
        {
            path = await ChooseFileAsync(image: false);
        }
        catch (Exception exception)
        {
            SetFooterError(exception.Message);
            return;
        }
        if (path.Length == 0)
        {
            return;
        }
        SetBusy(true, "正在导入配置");
        string result;
        string error = string.Empty;
        try
        {
            result = await ConfigService.LoadAsync(path);
        }
        catch (Exception value)
        {
            result = string.Empty;
            error = value.Message;
        }

        SetBusy(false);
        if (error.Length > 0)
        {
            SetFooterError(error);
            return;
        }
        try
        {
            _document.LoadConfigState(result);
            _parsed = _document.HasRealSurvey();
            if (!_parsed)
            {
                SetFooterError("导入配置没有真实可作答题目。");
                return;
            }
            PopulateControls();
            MoveToStep(5, force: true);
        }
        catch (Exception value)
        {
            SetFooterError("导入配置失败：" + value.Message);
        }
    }

    private async void OnChooseQRCode(object sender, RoutedEventArgs e)
    {
        string path;
        try
        {
            path = await ChooseFileAsync(image: true);
        }
        catch (Exception exception)
        {
            SetFooterError(exception.Message);
            return;
        }
        if (path.Length == 0)
        {
            return;
        }
        SetBusy(true, "正在识别二维码");
        string parsed;
        string error = string.Empty;
        try
        {
            parsed = await ConfigService.DecodeQRCodeSurveyAsync(path);
        }
        catch (Exception value)
        {
            parsed = string.Empty;
            error = value.Message;
        }

        SetBusy(false);
        if (error.Length > 0)
        {
            SetFooterError(error);
            return;
        }
        try
        {
            _document.SetParsedConfig(parsed);
            _parsed = _document.HasRealSurvey();
            if (!_parsed)
            {
                SetFooterError("二维码对应问卷没有真实可作答题目。");
                return;
            }
            PopulateControls();
            SurveyStatus.Title = "二维码已识别";
            SurveyStatus.Message = _document.Title();
            SurveyStatus.Severity = InfoBarSeverity.Success;
            SurveyStatus.IsOpen = true;
            MoveToStep(1, force: true);
        }
        catch (Exception value)
        {
            SetFooterError("二维码导入失败：" + value.Message);
        }
    }

    private async void OnChooseReverseFill(object sender, RoutedEventArgs e)
    {
        try
        {
            var path = await ChooseFileAsync(image: false, spreadsheet: true);
            if (path.Length == 0)
            {
                return;
            }
            _reverseFillPath = path;
            ReverseFillEnabled.IsOn = true;
            ReverseFillButtonLabel.Text = "更换 Excel";
        }
        catch (Exception error)
        {
            SetFooterError(error.Message);
        }
    }

    private void UpdateReview()
    {
        ReviewSurvey.Text = _document.Title().Length == 0 ? "未命名问卷" : _document.Title();
        var provider = _document.Provider();
        ReviewProvider.Text = provider switch
        {
            "qq" => "腾讯问卷",
            "credamo" => "见数",
            _ => "问卷星",
        };
        ReviewQuestions.Text = $"{_document.QuestionCount()} 题";
        ReviewTarget.Text = $"{_document.Target()} 份";
        ReviewThreads.Text = $"{_document.Threads()} 路";
        var mode = _document.ProxyMode();
        ReviewNetwork.Text = mode switch
        {
            "fixed" => "固定代理",
            "random" => "随机 IP",
            _ => "直连",
        };
        var duration = _document.AnswerDuration();
        ReviewDuration.Text = $"{duration.Min} ~ {duration.Max} 秒";
        ReviewReliability.Text = _document.PsychometricsEnabled()
            ? $"已启用 (α = {_document.TargetAlpha():0.00})"
            : "未启用";
        ReviewUrl.Text = _document.URL();
    }

    private void MoveToStep(int step, bool force = false)
    {
        if (step < 0 || step > 6 || (!force && step > _highestStep + 1))
        {
            return;
        }
        if (step == 5)
        {
            if (!SyncControlsToDocument())
            {
                return;
            }
            UpdateReview();
        }
        _step = step;
        _highestStep = Math.Max(_highestStep, step);
        UpdateStepVisuals();
        if (_step == 2)
        {
            ScheduleRuleRefresh();
        }
    }

    private void UpdateStepVisuals()
    {
        UIElement[] panels = [SurveyPanel, AnswersPanel, RulesPanel, NetworkPanel, TimingPanel, LaunchPanel, RunPanel];
        for (var index = 0; index < 7; index++)
        {
            panels[index].Visibility = index == _step ? Visibility.Visible : Visibility.Collapsed;
        }
        if (_step < 6)
        {
            StepCapsuleIndicator.Visibility = Visibility.Visible;
            StepCapsuleIndicator.CurrentStep = _step;
            StepCapsuleIndicator.HighestStep = _highestStep;
            string[] labels = ["导入问卷", "答案策略", "条件规则", "网络与信度", "时间与节奏", "规模与启动"];
            StepSummary.Text = $"第 {_step + 1}/6 步：{labels[_step]}";
        }
        else
        {
            StepCapsuleIndicator.Visibility = Visibility.Collapsed;
            StepSummary.Text = "任务运行中";
        }
        var firstStep = _step == 0;
        var isRunStep = _step == 6;
        NetworkStatus.IsOpen = _step == 3;
        CheckStatus.IsOpen = _step == 5;
        RunStatus.IsOpen = _step == 6;
        if (_step != 0)
        {
            SurveyStatus.IsOpen = false;
        }
        if (_step != 6)
        {
            RunExportStatus.IsOpen = false;
        }
        FooterDivider.Visibility = !firstStep && !isRunStep ? Visibility.Visible : Visibility.Collapsed;
        FooterBar.Visibility = !firstStep && !isRunStep ? Visibility.Visible : Visibility.Collapsed;
        SurveyPrimaryLabel.Text = _parsed ? "继续" : "解析并继续";
        SurveyPrimaryIcon.Symbol = _parsed ? Symbol.Forward : Symbol.Refresh;
        SurveyPrimaryButton.IsEnabled = !_busy;
        BackButton.IsEnabled = !_busy && _step > 0;
        PrimaryButtonLabel.Text = _step == 5 ? "检查并启动作答" : "继续";
        PrimaryButtonIcon.Symbol = _step == 5 ? Symbol.Send : Symbol.Forward;
        AutomationProperties.SetName(PrimaryButton, PrimaryButtonLabel.Text);
        PrimaryButton.IsEnabled = !_busy;
    }

    private void SetBusy(bool busy, string message = "")
    {
        _busy = busy;
        FooterStatus.Text = message;
        UpdateStepVisuals();
    }

    private void SetFooterError(string message)
    {
        FooterStatus.Text = message;
        if (_step == 0)
        {
            SurveyStatus.Title = "无法继续";
            SurveyStatus.Message = message;
            SurveyStatus.Severity = InfoBarSeverity.Error;
            SurveyStatus.IsOpen = true;
        }
        else if (_step == 5)
        {
            CheckStatus.Title = "无法启动任务";
            CheckStatus.Message = message;
            CheckStatus.Severity = InfoBarSeverity.Error;
            CheckStatus.IsOpen = true;
        }
    }

    private Task<string> ChooseFileAsync(bool image, bool spreadsheet = false)
    {
        var dlg = new Microsoft.Win32.OpenFileDialog();
        if (image)
        {
            dlg.Filter = "图片文件 (*.png;*.jpg;*.jpeg;*.bmp)|*.png;*.jpg;*.jpeg;*.bmp|所有文件 (*.*)|*.*";
        }
        else if (spreadsheet)
        {
            dlg.Filter = "Excel 文件 (*.xlsx;*.xls)|*.xlsx;*.xls|所有文件 (*.*)|*.*";
        }
        else
        {
            dlg.Filter = "配置文件 (*.json)|*.json|所有文件 (*.*)|*.*";
        }
        var result = dlg.ShowDialog() == true ? dlg.FileName : string.Empty;
        return Task.FromResult(result);
    }

    private static string SelectedTag(ComboBox combo, string fallback) =>
        combo.SelectedItem is ComboBoxItem item && item.Tag is string tag ? tag : fallback;

    private static void SelectTag(ComboBox combo, string value)
    {
        for (var index = 0; index < combo.Items.Count; index++)
        {
            if (combo.Items[index] is ComboBoxItem item && item.Tag as string == value)
            {
                combo.SelectedIndex = index;
                return;
            }
        }
        combo.SelectedIndex = 0;
    }

    private static bool ParseWindowValue(string value, DatePicker datePicker, TextBox timePicker)
    {
        if (string.IsNullOrEmpty(value))
        {
            datePicker.SelectedDate = null;
            timePicker.Text = string.Empty;
            return true;
        }
        if (!DateTime.TryParseExact(value, "yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var parsed))
        {
            return false;
        }
        datePicker.SelectedDate = parsed.Date;
        timePicker.Text = parsed.ToString("HH:mm:ss");
        return true;
    }

    private static bool ReadWindowValue(DatePicker datePicker, TextBox timePicker,
        out string value, out string error)
    {
        var date = datePicker.SelectedDate;
        var timeText = timePicker.Text?.Trim() ?? string.Empty;
        if (date is null && string.IsNullOrEmpty(timeText))
        {
            value = string.Empty;
            error = string.Empty;
            return true;
        }
        if (date is null || string.IsNullOrEmpty(timeText))
        {
            value = string.Empty;
            error = "时间窗口的日期和时间必须同时填写。";
            return false;
        }
        if (!TimeSpan.TryParse(timeText, out var time))
        {
            value = string.Empty;
            error = "时间格式无效，应为 HH:mm:ss（例如 08:30:00）。";
            return false;
        }
        var combined = date.Value.Date.Add(time);
        value = combined.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
        error = string.Empty;
        return true;
    }
}
