#include "pch.h"
#include "RunPage.xaml.h"
#include "Services/RpcServices.h"
#include "Services/ShellSettings.h"
#include "Services/TaskNotification.h"
#include "Services/JsonHelpers.h"
#include "Services/WindowContext.h"

#if __has_include("RunPage.g.cpp")
#include "RunPage.g.cpp"
#endif

#include <algorithm>

namespace winrt::SurveyController::App::implementation
{
    using namespace Microsoft::UI::Dispatching;
    using namespace Microsoft::UI::Xaml;
    using namespace Microsoft::UI::Xaml::Controls;
    using namespace Windows::Data::Json;

    namespace
    {
        int32_t NumberValue(NumberBox const& control, int32_t fallback, int32_t minimum, int32_t maximum)
        {
            auto value = control.Value();
            if (std::isnan(value)) return fallback;
            return std::clamp(static_cast<int32_t>(value), minimum, maximum);
        }

        hstring NumberText(int32_t value, wchar_t const* suffix)
        {
            return hstring{ std::to_wstring(value) + suffix };
        }

        InfoBarSeverity RunSeverity(hstring const& status)
        {
            if (status == L"succeeded") return InfoBarSeverity::Success;
            if (status == L"paused") return InfoBarSeverity::Warning;
            if (status == L"failed") return InfoBarSeverity::Error;
            return InfoBarSeverity::Informational;
        }
    }

    RunPage::RunPage() : m_document(Services::WizardDocument::Current())
    {
        InitializeComponent();
        m_initialized = true;
        try
        {
            hstring parseError;
            Services::TryParseJsonObject(Services::ShellSettings::Current().Json(), m_settings, parseError);
        }
        catch (...) {}
        PopulateFromDocument();
    }

    void RunPage::PopulateFromDocument()
    {
        TargetCount().Value(m_document.Target());
        ThreadCount().Value(m_document.Threads());
        UpdateReview();
    }

    void RunPage::OnLoaded(IInspectable const&, RoutedEventArgs const&)
    {
        m_isLoaded = true;
        ++m_pageGeneration;
        PopulateFromDocument();
        if (!m_runId.empty()) StartPolling();
    }

    void RunPage::OnUnloaded(IInspectable const&, RoutedEventArgs const&)
    {
        m_isLoaded = false;
        ++m_pageGeneration;
        StopPolling();
    }

    void RunPage::PrepareForShutdown() noexcept
    {
        m_isLoaded = false;
        ++m_pageGeneration;
        StopPolling();
    }

    void RunPage::UpdateReview()
    {
        ReviewSurvey().Text(m_document.Title().empty() ? L"未导入问卷" : m_document.Title());
        auto provider = m_document.Provider();
        ReviewProvider().Text(provider == L"qq" ? L"腾讯问卷" : provider == L"credamo" ? L"见数" : L"问卷星");
        ReviewQuestions().Text(NumberText(static_cast<int32_t>(m_document.QuestionCount()), L" 题"));
        ReviewNetwork().Text([this]
        {
            auto mode = m_document.ProxyMode();
            return mode == L"fixed" ? L"固定代理" : mode == L"random" ? L"随机 IP" : L"直连";
        }());

        auto alphaStr = std::to_wstring(m_document.TargetAlpha());
        if (alphaStr.size() > 4) alphaStr = alphaStr.substr(0, 4);
        ReviewReliability().Text(m_document.PsychometricsEnabled()
            ? hstring{ L"已启用 (α = " + alphaStr + L")" }
            : L"未启用");

        auto duration = m_document.AnswerDuration();
        ReviewDuration().Text(hstring{ std::to_wstring(duration[0]) + L" ~ " + std::to_wstring(duration[1]) + L" 秒" });
        ReviewUrl().Text(m_document.URL().empty() ? L"-" : m_document.URL());
        TargetCount().Value(m_document.Target());
        ThreadCount().Value(m_document.Threads());
    }

    void RunPage::ScheduleExecutionSync()
    {
        // NumberBox 连续点击只保留最终值；直接同步即可，无需计时器。
        SyncExecutionToDocument();
        UpdateReview();
    }

    void RunPage::SyncExecutionToDocument()
    {
        if (!m_initialized) return;
        auto target = NumberValue(TargetCount(), 1, 1, 999999);
        auto threads = (std::min)(target, NumberValue(ThreadCount(), 1, 1, 128));
        m_document.SetExecution(
            target,
            threads,
            m_document.SubmitInterval()[0],
            m_document.SubmitInterval()[1],
            m_document.AnswerDuration()[0],
            m_document.AnswerDuration()[1],
            m_document.AnswerWindow()[0],
            m_document.AnswerWindow()[1],
            m_document.FailStop(),
            m_document.PauseCaptcha());
    }

    void RunPage::OnExecutionChanged(IInspectable const&, NumberBoxValueChangedEventArgs const&)
    {
        ScheduleExecutionSync();
    }

    bool RunPage::EnsureSurveyReady()
    {
        if (m_document.HasRealSurvey()) return true;
        CheckStatus().Title(L"无法启动任务");
        CheckStatus().Message(L"尚未导入问卷或问卷没有可作答题目。请先到「问卷」页解析。");
        CheckStatus().Severity(InfoBarSeverity::Error);
        CheckStatus().IsOpen(true);
        return false;
    }

    fire_and_forget RunPage::OnCheckAndStart(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        if (m_busy) co_return;
        if (!EnsureSurveyReady()) co_return;

        SyncExecutionToDocument();

        // 检查、持久化、启动由 Go 应用服务作为一个事务完成。
        SetBusy(true, L"正在检查配置并启动任务");
        auto params = m_document.SaveRequest();

        hstring result;
        hstring error;
        co_await winrt::resume_background();
        try { result = co_await Services::TaskService{}.CheckAndStartAsync(params); }
        catch (winrt::hresult_error const& value) { error = value.message(); }
        catch (std::exception const& value) { error = to_hstring(value.what()); }
        catch (...) { error = L"后端调用失败。"; }

        lifetime->DispatcherQueue().TryEnqueue([lifetime, result, error]()
        {
            lifetime->SetBusy(false);
            lifetime->MonitorCard().Visibility(Visibility::Visible);
            if (!error.empty())
            {
                lifetime->CheckStatus().Title(L"无法启动任务");
                lifetime->CheckStatus().Message(error);
                lifetime->CheckStatus().Severity(InfoBarSeverity::Error);
                lifetime->CheckStatus().IsOpen(true);
                return;
            }
            lifetime->ApplyRunState(result);
            lifetime->StartPolling();
        });
    }

    fire_and_forget RunPage::OnPauseRun(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        try { co_await RunControlAsync(L"PauseRun"); }
        catch (winrt::hresult_error const& error) { SetBusy(false); CheckStatus().Title(L"暂停任务失败"); CheckStatus().Message(error.message()); CheckStatus().Severity(InfoBarSeverity::Error); CheckStatus().IsOpen(true); }
        catch (...) { SetBusy(false); CheckStatus().Title(L"暂停任务失败"); CheckStatus().Message(L"请重试。"); CheckStatus().Severity(InfoBarSeverity::Error); CheckStatus().IsOpen(true); }
    }

    fire_and_forget RunPage::OnResumeRun(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        try { co_await RunControlAsync(L"ResumeRun"); }
        catch (winrt::hresult_error const& error) { SetBusy(false); CheckStatus().Title(L"恢复任务失败"); CheckStatus().Message(error.message()); CheckStatus().Severity(InfoBarSeverity::Error); CheckStatus().IsOpen(true); }
        catch (...) { SetBusy(false); CheckStatus().Title(L"恢复任务失败"); CheckStatus().Message(L"请重试。"); CheckStatus().Severity(InfoBarSeverity::Error); CheckStatus().IsOpen(true); }
    }

    fire_and_forget RunPage::OnStopRun(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        try { co_await RunControlAsync(L"CancelRun"); }
        catch (winrt::hresult_error const& error) { SetBusy(false); CheckStatus().Title(L"停止任务失败"); CheckStatus().Message(error.message()); CheckStatus().Severity(InfoBarSeverity::Error); CheckStatus().IsOpen(true); }
        catch (...) { SetBusy(false); CheckStatus().Title(L"停止任务失败"); CheckStatus().Message(L"请重试。"); CheckStatus().Severity(InfoBarSeverity::Error); CheckStatus().IsOpen(true); }
    }

    fire_and_forget RunPage::OnExportLogs(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        try
        {
            auto path = co_await ChooseSaveFile(false);
            if (path.empty()) co_return;
            JsonArray lines;
            for (auto const& line : m_logLines) lines.Append(JsonValue::CreateStringValue(line));
            co_await ExportLinesAsync(path, lines, L"日志已导出");
        }
        catch (winrt::hresult_error const& error)
        {
            RunExportStatus().Severity(InfoBarSeverity::Error);
            RunExportStatus().Title(L"导出失败");
            RunExportStatus().Message(error.message());
            RunExportStatus().IsOpen(true);
        }
        catch (...)
        {
            RunExportStatus().Severity(InfoBarSeverity::Error);
            RunExportStatus().Title(L"导出失败");
            RunExportStatus().Message(L"导出日志失败。");
            RunExportStatus().IsOpen(true);
        }
    }

    fire_and_forget RunPage::OnExportResult(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        if (!m_runResult) co_return;
        try
        {
            auto path = co_await ChooseSaveFile(true);
            if (path.empty()) co_return;
            JsonObject payload;
            payload.SetNamedValue(L"result", m_runResult);
            JsonArray logs;
            for (auto const& line : m_logLines) logs.Append(JsonValue::CreateStringValue(line));
            payload.SetNamedValue(L"logs", logs);
            JsonArray lines;
            lines.Append(JsonValue::CreateStringValue(payload.Stringify()));
            co_await ExportLinesAsync(path, lines, L"任务结果已导出");
        }
        catch (winrt::hresult_error const& error)
        {
            RunExportStatus().Severity(InfoBarSeverity::Error);
            RunExportStatus().Title(L"导出失败");
            RunExportStatus().Message(error.message());
            RunExportStatus().IsOpen(true);
        }
        catch (...)
        {
            RunExportStatus().Severity(InfoBarSeverity::Error);
            RunExportStatus().Title(L"导出失败");
            RunExportStatus().Message(L"导出任务结果失败。");
            RunExportStatus().IsOpen(true);
        }
    }

    Windows::Foundation::IAsyncOperation<hstring> RunPage::ChooseSaveFile(bool json)
    {
        Microsoft::Windows::Storage::Pickers::FileSavePicker picker(Services::MainWindowId());
        picker.SuggestedFileName(json ? L"surveycontroller-result" : L"surveycontroller-runtime");
        picker.DefaultFileExtension(json ? L".json" : L".log");
        auto choices = picker.FileTypeChoices();
        Windows::Foundation::Collections::IVector<hstring> extensions = winrt::single_threaded_vector<hstring>();
        extensions.Append(json ? L".json" : L".log");
        choices.Insert(json ? L"JSON 文件" : L"日志文件", extensions);
        auto file = co_await picker.PickSaveFileAsync();
        co_return file ? file.Path() : hstring{};
    }

    Windows::Foundation::IAsyncAction RunPage::ExportLinesAsync(hstring const& path, JsonArray const& lines, hstring const& successMessage)
    {
        auto lifetime = get_strong();
        JsonObject request;
        request.SetNamedValue(L"path", JsonValue::CreateStringValue(path));
        request.SetNamedValue(L"lines", lines);
        hstring error;
        co_await winrt::resume_background();
        try { co_await Services::TaskService{}.ExportAsync(path, lines); }
        catch (winrt::hresult_error const& value) { error = value.message(); }

        lifetime->DispatcherQueue().TryEnqueue([lifetime, error, successMessage]()
        {
            lifetime->RunExportStatus().Severity(error.empty() ? InfoBarSeverity::Success : InfoBarSeverity::Error);
            lifetime->RunExportStatus().Title(error.empty() ? successMessage : L"导出失败");
            lifetime->RunExportStatus().Message(error);
            lifetime->RunExportStatus().IsOpen(true);
        });
    }

    void RunPage::ApplyRunState(hstring const& json)
    {
        JsonObject state;
        hstring parseError;
        if (!Services::TryParseJsonObject(json, state, parseError))
        {
            CheckStatus().Title(L"运行状态无效");
            CheckStatus().Message(parseError);
            CheckStatus().Severity(InfoBarSeverity::Error);
            CheckStatus().IsOpen(true);
            return;
        }
        auto nextRunId = state.GetNamedString(L"runId", m_runId);
        if (!nextRunId.empty() && nextRunId != m_runId)
        {
            RunLogs().Items().Clear();
            m_logLines.clear();
            m_runResult = nullptr;
            RunResultCard().Visibility(Visibility::Collapsed);
            ExportResultButton().Visibility(Visibility::Collapsed);
            ExportLogsButton().Visibility(Visibility::Collapsed);
            RunExportStatus().IsOpen(false);
        }
        m_runId = nextRunId;
        m_afterSequence = static_cast<std::uint64_t>(state.GetNamedNumber(L"nextSequence", static_cast<double>(m_afterSequence)));
        auto status = state.GetNamedString(L"status", L"idle");
        auto runTitle = status == L"running" ? L"运行中" : status == L"paused" ? L"已暂停" : status == L"succeeded" ? L"已完成" : status == L"failed" ? L"运行失败" : status == L"canceling" ? L"正在停止" : status == L"stopped" ? L"已停止" : L"尚未启动";
        RunStatus().Title(runTitle);
        RunStatus().Severity(RunSeverity(status));
        auto events = state.GetNamedArray(L"events", JsonArray{});
        for (auto const& value : events)
        {
            auto event = value.GetObject().GetNamedObject(L"event", JsonObject{});
            auto message = event.GetNamedString(L"message", L"");
            if (!message.empty())
            {
                auto worker = event.GetNamedString(L"worker", L"core");
                hstring line{ L"[" + std::wstring{ worker } + L"] " + std::wstring{ message } };
                m_logLines.push_back(line);
                if (m_logLines.size() > 200) m_logLines.erase(m_logLines.begin());
                RunLogs().Items().Append(box_value(line));
                if (RunLogs().Items().Size() > 200) RunLogs().Items().RemoveAt(0);
            }
            auto total = event.GetNamedNumber(L"total", 0);
            auto current = event.GetNamedNumber(L"current", 0);
            if (total > 0)
            {
                RunProgress().Maximum(total);
                RunProgress().Value((std::min)(current, total));
                RunProgressText().Text(hstring{ std::to_wstring(static_cast<int32_t>(current)) + L" / " + std::to_wstring(static_cast<int32_t>(total)) });
            }
            if (!message.empty()) RunStatus().Message(message);
        }
        m_runResult = state.GetNamedObject(L"result", JsonObject{});
        if (m_runResult && m_runResult.Size() > 0)
        {
            auto success = static_cast<int32_t>(m_runResult.GetNamedNumber(L"success", 0));
            auto fail = static_cast<int32_t>(m_runResult.GetNamedNumber(L"fail", 0));
            RunResultSuccess().Text(hstring{ std::to_wstring(success) });
            RunResultFail().Text(hstring{ std::to_wstring(fail) });
            RunResultTotal().Text(hstring{ std::to_wstring(success + fail) });
            RunResultCard().Visibility(Visibility::Visible);
            ExportResultButton().Visibility(Visibility::Visible);
        }
        ExportLogsButton().Visibility(m_logLines.empty()
            ? Visibility::Collapsed : Visibility::Visible);
        auto stateError = state.GetNamedString(L"error", L"");
        if (!stateError.empty()) RunStatus().Message(stateError);
        auto active = status == L"running" || status == L"paused" || status == L"canceling";
        if (!active && !m_runId.empty() && m_notifiedRunId != m_runId &&
            (!m_settings || m_settings.GetNamedBoolean(L"taskResultNotification", true)) &&
            (m_runResult || !stateError.empty()))
        {
            auto title = stateError.empty() ? L"任务执行完成" : L"任务执行失败";
            auto body = stateError;
            if (body.empty())
            {
                auto success = static_cast<int32_t>(m_runResult.GetNamedNumber(L"success", 0));
                auto fail = static_cast<int32_t>(m_runResult.GetNamedNumber(L"fail", 0));
                body = hstring{ L"成功 " + std::to_wstring(success) + L" 份，失败 " + std::to_wstring(fail) + L" 份" };
            }
            Services::TaskNotification::Current().Show(title, body);
            m_notifiedRunId = m_runId;
        }
        PauseButton().IsEnabled(status == L"running");
        ResumeButton().IsEnabled(status == L"paused");
        StopButton().IsEnabled(active && status != L"canceling");
        StartButton().IsEnabled(!active && !m_busy);
        if (!active && m_pollTimer) m_pollTimer.Stop();
    }

    void RunPage::StartPolling()
    {
        if (!m_isLoaded || m_runId.empty()) return;
        if (!m_pollTimer)
        {
            m_pollTimer = DispatcherQueue().CreateTimer();
            m_pollTimer.Interval(std::chrono::milliseconds(700));
            auto weak = get_weak();
            m_pollTimer.Tick([weak](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->PollRunAsync();
            });
        }
        m_pollFailures = 0;
        m_pollTimer.Interval(std::chrono::milliseconds(700));
        m_pollTimer.Start();
    }

    void RunPage::StopPolling() noexcept
    {
        if (m_pollTimer) m_pollTimer.Stop();
        m_polling = false;
    }

    Windows::Foundation::IAsyncAction RunPage::PollRunAsync()
    {
        auto lifetime = get_strong();
        if (m_polling || m_runId.empty() || !m_isLoaded) co_return;
        m_polling = true;
        auto const generation = m_pageGeneration;
        auto const runId = m_runId;
        hstring result, error;
        try
        {
            result = co_await Services::TaskService{}.StateAsync(runId, m_afterSequence);
        }
        catch (winrt::hresult_error const& value) { error = value.message(); }
        catch (std::exception const& value) { error = to_hstring(value.what()); }
        catch (...) { error = L"查询任务状态失败。"; }

        if (!m_isLoaded || generation != m_pageGeneration || runId != m_runId)
        {
            // 过期请求必须释放守卫，否则后续轮询会被永久阻塞。
            m_polling = false;
            co_return;
        }
        m_polling = false;
        if (!error.empty())
        {
            ++m_pollFailures;
            if (m_pollFailures >= 3)
            {
                StopPolling();
                RunStatus().Title(L"后端连接中断");
                RunStatus().Message(L"请重新进入本页后重试：" + error);
                RunStatus().Severity(InfoBarSeverity::Error);
                co_return;
            }
            m_pollTimer.Interval(std::chrono::milliseconds(700 * (1 << m_pollFailures)));
            co_return;
        }
        m_pollFailures = 0;
        m_pollTimer.Interval(std::chrono::milliseconds(700));
        ApplyRunState(result);
    }

    Windows::Foundation::IAsyncAction RunPage::RunControlAsync(hstring method)
    {
        auto lifetime = get_strong();
        if (m_busy) co_return;
        SetBusy(true, L"正在更新任务状态");
        hstring result, error;
        try
        {
            if (method == L"PauseRun") result = co_await Services::TaskService{}.PauseAsync(L"用户暂停");
            else if (method == L"ResumeRun") result = co_await Services::TaskService{}.ResumeAsync();
            else if (method == L"CancelRun") result = co_await Services::TaskService{}.StopAsync();
            else throw winrt::hresult_error(E_INVALIDARG, L"不支持的任务控制操作");
        }
        catch (winrt::hresult_error const& value) { error = value.message(); }
        catch (std::exception const& value) { error = to_hstring(value.what()); }
        catch (...) { error = L"更新任务状态失败。"; }

        SetBusy(false);
        if (!error.empty())
        {
            RunStatus().Title(L"操作失败");
            RunStatus().Message(error);
            RunStatus().Severity(InfoBarSeverity::Error);
            co_return;
        }
        ApplyRunState(result);
    }

    void RunPage::SetBusy(bool busy, hstring const& message)
    {
        m_busy = busy;
        StartButton().IsEnabled(!busy && !m_polling);
        TargetCount().IsEnabled(!busy);
        ThreadCount().IsEnabled(!busy);
        if (!message.empty())
        {
            CheckStatus().Title(L"正在处理");
            CheckStatus().Message(message);
            CheckStatus().Severity(InfoBarSeverity::Informational);
            CheckStatus().IsOpen(true);
        }
        else if (CheckStatus().Severity() == InfoBarSeverity::Informational)
        {
            CheckStatus().IsOpen(false);
        }
    }
}
