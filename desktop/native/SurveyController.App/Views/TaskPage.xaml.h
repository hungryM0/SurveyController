#pragma once

#include "TaskPage.g.h"
#include "Services/WizardDocument.h"
#include "AnswerEditorWindow.xaml.h"

namespace winrt::SurveyController::App::implementation
{
    struct TaskPage : TaskPageT<TaskPage>
    {
        TaskPage();
        void OnLoaded(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnUnloaded(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void PrepareForShutdown() noexcept;

        winrt::fire_and_forget OnPrimary(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnBack(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnEditAnswers(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnSurveyUrlChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::TextChangedEventArgs const&);
        winrt::fire_and_forget OnImportConfig(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnChooseQRCode(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnChooseReverseFill(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnProxyModeChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnProxySourceChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnProxyProvinceChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnProxyCityChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnPsychometricsToggled(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnTestFixedProxy(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnTestCustomProxy(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnSyncProxy(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnPauseRun(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnResumeRun(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnStopRun(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnExportLogs(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnExportResult(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        Services::WizardDocument& m_document;
        Windows::Data::Json::JsonObject m_settings{ nullptr };
        Windows::Data::Json::JsonObject m_proxyAreaOptions{ nullptr };
        Windows::Data::Json::JsonObject m_runResult{ nullptr };
        std::vector<hstring> m_logLines;
        Microsoft::UI::Dispatching::DispatcherQueueTimer m_pollTimer{ nullptr };
        hstring m_reverseFillPath;
        hstring m_proxyAreaCode;
        hstring m_runId;
        hstring m_notifiedRunId;
        uint64_t m_afterSequence{};
        int32_t m_step{};
        int32_t m_highestStep{};
        bool m_parsed{};
        bool m_busy{};
        SurveyController::App::AnswerEditorWindow m_answerEditor{ nullptr };
        bool m_polling{};
        bool m_updatingProxyAreas{};
        bool m_initialized{};
        bool m_isLoaded{};
        uint64_t m_pageGeneration{};
        uint32_t m_pollFailures{};

        void InitializeState();
        void PopulateControls();
        void ScheduleRuleRefresh();
        bool SyncControlsToDocument();
        void UpdateNetworkVisibility();
        void UpdatePsychometricsVisibility();
        winrt::fire_and_forget LoadProxyAreaOptions();
        void ApplyProxyAreaOptions(hstring const& json, hstring const& source);
        void RebuildProxyCities(hstring const& provinceCode, hstring const& selectedCode = L"");
        void ApplyProxyStatus(Windows::Data::Json::JsonObject const& state);
        void UpdateReview();
        void UpdateStepVisuals();
        void MoveToStep(int32_t step, bool force = false);
        void UpdateAnswerStats();
        void SetBusy(bool busy, hstring const& message = L"");
        void SetFooterError(hstring const& message);
        Windows::Foundation::IAsyncOperation<hstring> ChooseFile(bool image, bool spreadsheet = false);
        Windows::Foundation::IAsyncOperation<hstring> ChooseSaveFile(bool json);
        Windows::Foundation::IAsyncAction ExportLinesAsync(hstring const& path, Windows::Data::Json::JsonArray const& lines, hstring const& successMessage);
        hstring SelectedTag(Microsoft::UI::Xaml::Controls::ComboBox const& combo, hstring const& fallback) const;
        void SelectTag(Microsoft::UI::Xaml::Controls::ComboBox const& combo, hstring const& value);
        void ApplyCheckState(hstring const& json);
        void ApplyRunState(hstring const& json);
        void StartPolling();
        void StopPolling() noexcept;
        Windows::Foundation::IAsyncAction PollRunAsync();
        Windows::Foundation::IAsyncAction RunControlAsync(hstring method, hstring params);
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct TaskPage : TaskPageT<TaskPage, implementation::TaskPage> {};
}
