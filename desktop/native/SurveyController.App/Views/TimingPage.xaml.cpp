#include "pch.h"
#include "TimingPage.xaml.h"
#include "Services/WindowContext.h"

#if __has_include("TimingPage.g.cpp")
#include "TimingPage.g.cpp"
#endif

#include <algorithm>
#include <cmath>
#include <ctime>
#include <iomanip>
#include <sstream>

namespace winrt::SurveyController::App::implementation
{
    using namespace Microsoft::UI::Dispatching;
    using namespace Microsoft::UI::Xaml;
    using namespace Microsoft::UI::Xaml::Controls;

    namespace
    {
        int32_t NumberValue(NumberBox const& control, int32_t fallback, int32_t minimum, int32_t maximum)
        {
            auto value = control.Value();
            if (std::isnan(value)) return fallback;
            return std::clamp(static_cast<int32_t>(value), minimum, maximum);
        }

        bool ParseWindowValue(hstring const& value, CalendarDatePicker const& datePicker, TimePicker const& timePicker)
        {
            if (value.empty())
            {
                datePicker.Date(nullptr);
                timePicker.SelectedTime(nullptr);
                return true;
            }
            std::tm parsed{};
            std::wistringstream stream{ std::wstring{ value } };
            stream >> std::get_time(&parsed, L"%Y-%m-%d %H:%M:%S");
            if (stream.fail()) return false;
            parsed.tm_isdst = -1;
            auto timestamp = std::mktime(&parsed);
            if (timestamp == -1) return false;
            auto date = winrt::clock::from_time_t(timestamp);
            auto time = std::chrono::hours{ parsed.tm_hour } + std::chrono::minutes{ parsed.tm_min } +
                std::chrono::seconds{ parsed.tm_sec };
            datePicker.Date(box_value(date).as<Windows::Foundation::IReference<Windows::Foundation::DateTime>>());
            timePicker.SelectedTime(box_value(Windows::Foundation::TimeSpan{ time }).as<Windows::Foundation::IReference<Windows::Foundation::TimeSpan>>());
            return true;
        }

        bool ReadWindowValue(CalendarDatePicker const& datePicker, TimePicker const& timePicker,
            hstring& value, hstring& error)
        {
            auto date = datePicker.Date();
            auto time = timePicker.SelectedTime();
            if (!date && !time)
            {
                value.clear();
                return true;
            }
            if (!date || !time)
            {
                error = L"时间窗口的日期和时间必须同时填写。";
                return false;
            }
            auto timestamp = winrt::clock::to_time_t(date.Value());
            std::tm local{};
            localtime_s(&local, &timestamp);
            auto duration = time.Value();
            auto hours = std::chrono::duration_cast<std::chrono::hours>(duration);
            auto minutes = std::chrono::duration_cast<std::chrono::minutes>(duration - hours);
            auto seconds = std::chrono::duration_cast<std::chrono::seconds>(duration - hours - minutes);
            wchar_t buffer[20]{};
            swprintf_s(buffer, L"%04d-%02d-%02d %02d:%02d:%02d",
                local.tm_year + 1900, local.tm_mon + 1, local.tm_mday,
                static_cast<int>(hours.count()), static_cast<int>(minutes.count()), static_cast<int>(seconds.count()));
            value = buffer;
            return true;
        }
    }

    TimingPage::TimingPage() : m_document(Services::WizardDocument::Current())
    {
        InitializeComponent();
        m_initialized = true;
        PopulateFromDocument();
    }

    void TimingPage::PopulateFromDocument()
    {
        m_loadingSettings = true;
        auto duration = m_document.AnswerDuration();
        AnswerDurationMin().Value(duration[0]);
        AnswerDurationMax().Value(duration[1]);
        auto interval = m_document.SubmitInterval();
        SubmitIntervalMin().Value(interval[0]);
        SubmitIntervalMax().Value(interval[1]);
        auto window = m_document.AnswerWindow();
        if (!ParseWindowValue(window[0], WindowStartDate(), WindowStartTime()) ||
            !ParseWindowValue(window[1], WindowEndDate(), WindowEndTime()))
        {
            ShowStatus(InfoBarSeverity::Warning, L"时间窗口格式无效",
                L"配置中的时间窗口应为 YYYY-MM-DD HH:mm:ss，请重新填写。");
        }
        FailStop().IsOn(m_document.FailStop());
        PauseCaptcha().IsOn(m_document.PauseCaptcha());
        m_reverseFillPath = m_document.ReverseFillPath();
        ReverseFillEnabled().IsOn(m_document.ReverseFillEnabled());
        ReverseFillButtonLabel().Text(m_reverseFillPath.empty() ? L"选择 Excel" : L"更换 Excel");
        m_loadingSettings = false;
    }

    void TimingPage::ScheduleSync()
    {
        ++m_syncGeneration;
        if (!m_syncTimer)
        {
            m_syncTimer = DispatcherQueue().CreateTimer();
            m_syncTimer.IsRepeating(false);
            m_syncTimer.Interval(std::chrono::milliseconds{ 30 });
            auto weak = get_weak();
            m_syncTimer.Tick([weak](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->SyncToDocument();
            });
        }
        m_syncTimer.Stop();
        m_syncTimer.Start();
    }

    bool TimingPage::SyncToDocument()
    {
        if (!m_initialized || m_loadingSettings) return true;

        auto durationMin = NumberValue(AnswerDurationMin(), 60, 1, 3600);
        auto durationMax = (std::max)(durationMin, NumberValue(AnswerDurationMax(), 120, 1, 3600));
        auto intervalMin = NumberValue(SubmitIntervalMin(), 0, 0, 1800);
        auto intervalMax = (std::max)(intervalMin, NumberValue(SubmitIntervalMax(), 0, 0, 1800));

        hstring windowStart, windowEnd, windowError;
        if (!ReadWindowValue(WindowStartDate(), WindowStartTime(), windowStart, windowError) ||
            !ReadWindowValue(WindowEndDate(), WindowEndTime(), windowEnd, windowError))
        {
            ShowStatus(InfoBarSeverity::Error, L"时间窗口无效", windowError);
            return false;
        }
        if (windowStart.empty() != windowEnd.empty())
        {
            ShowStatus(InfoBarSeverity::Error, L"时间窗口无效", L"时间窗口必须同时填写开始和结束时间，或全部清空。");
            return false;
        }
        if (!windowStart.empty() && windowStart >= windowEnd)
        {
            ShowStatus(InfoBarSeverity::Error, L"时间窗口无效", L"时间窗口的开始时间必须早于结束时间。");
            return false;
        }

        m_document.SetExecution(
            m_document.Target(),
            m_document.Threads(),
            intervalMin,
            intervalMax,
            durationMin,
            durationMax,
            windowStart,
            windowEnd,
            FailStop().IsOn(),
            PauseCaptcha().IsOn());
        m_document.SetReverseFill(ReverseFillEnabled().IsOn(), m_reverseFillPath);

        if (TimingStatus().Severity() == InfoBarSeverity::Error)
        {
            TimingStatus().IsOpen(false);
        }
        return true;
    }

    void TimingPage::ShowStatus(InfoBarSeverity severity, hstring const& title, hstring const& message)
    {
        TimingStatus().Severity(severity);
        TimingStatus().Title(title);
        TimingStatus().Message(message);
        TimingStatus().IsOpen(true);
    }

    void TimingPage::OnNumberChanged(IInspectable const&, NumberBoxValueChangedEventArgs const&)
    {
        ScheduleSync();
    }

    void TimingPage::OnWindowDateChanged(IInspectable const&, CalendarDatePickerDateChangedEventArgs const&)
    {
        ScheduleSync();
    }

    void TimingPage::OnWindowTimeChanged(IInspectable const&, TimePickerSelectedTimeChangedEventArgs const&)
    {
        ScheduleSync();
    }

    void TimingPage::OnToggled(IInspectable const&, RoutedEventArgs const&)
    {
        ScheduleSync();
    }

    Windows::Foundation::IAsyncOperation<hstring> TimingPage::ChooseFile(bool image, bool spreadsheet)
    {
        Microsoft::Windows::Storage::Pickers::FileOpenPicker picker(Services::MainWindowId());
        auto types = picker.FileTypeFilter();
        if (image) { types.Append(L".png"); types.Append(L".jpg"); types.Append(L".jpeg"); types.Append(L".bmp"); }
        else if (spreadsheet) { types.Append(L".xlsx"); types.Append(L".xls"); }
        else { types.Append(L".json"); }
        auto file = co_await picker.PickSingleFileAsync();
        co_return file ? file.Path() : hstring{};
    }

    fire_and_forget TimingPage::OnChooseReverseFill(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        hstring path;
        try
        {
            path = co_await ChooseFile(false, true);
        }
        catch (winrt::hresult_error const& value)
        {
            ShowStatus(InfoBarSeverity::Error, L"无法打开文件", value.message());
            co_return;
        }
        catch (...)
        {
            ShowStatus(InfoBarSeverity::Error, L"无法打开文件", L"选择 Excel 文件失败。");
            co_return;
        }
        if (path.empty()) co_return;

        m_reverseFillPath = path;
        ReverseFillEnabled().IsOn(true);
        ReverseFillButtonLabel().Text(L"更换 Excel");
        SyncToDocument();
        ShowStatus(InfoBarSeverity::Success, L"已选择反填表格", path);
    }
}
