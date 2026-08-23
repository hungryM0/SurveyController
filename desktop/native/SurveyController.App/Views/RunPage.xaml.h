#pragma once

#include "RunPage.g.h"
#include "Services/WizardDocument.h"

namespace winrt::SurveyController::App::implementation
{
    struct RunPage : RunPageT<RunPage>
    {
        RunPage();

        void OnLoaded(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnUnloaded(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void PrepareForShutdown() noexcept;

        void OnExecutionChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::NumberBoxValueChangedEventArgs const&);
        winrt::fire_and_forget OnCheckAndStart(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnPauseRun(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnResumeRun(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnStopRun(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnExportLogs(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnExportResult(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        Services::WizardDocument& m_document;
        Windows::Data::Json::JsonObject m_settings{ nullptr };
        Windows::Data::Json::JsonObject m_runResult{ nullptr };
        std::vector<hstring> m_logLines;
        Microsoft::UI::Dispatching::DispatcherQueueTimer m_pollTimer{ nullptr };
        hstring m_runId;
        hstring m_notifiedRunId;
        std::uint64_t m_afterSequence{};
        bool m_busy{};
        bool m_polling{};
        bool m_initialized{};
        bool m_isLoaded{};
        std::uint64_t m_pageGeneration{};
        std::uint32_t m_pollFailures{};

        void PopulateFromDocument();
        void UpdateReview();
        void ScheduleExecutionSync();
        void SyncExecutionToDocument();
        bool EnsureSurveyReady();
        void ApplyRunState(hstring const& json);
        void StartPolling();
        void StopPolling() noexcept;
        Windows::Foundation::IAsyncAction PollRunAsync();
        Windows::Foundation::IAsyncAction RunControlAsync(winrt::hstring method);
        Windows::Foundation::IAsyncOperation<hstring> ChooseSaveFile(bool json);
        Windows::Foundation::IAsyncAction ExportLinesAsync(hstring const& path, Windows::Data::Json::JsonArray const& lines, hstring const& successMessage);
        void SetBusy(bool busy, hstring const& message = L"");
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct RunPage : RunPageT<RunPage, implementation::RunPage> {};
}
