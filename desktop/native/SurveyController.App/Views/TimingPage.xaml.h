#pragma once

#include "TimingPage.g.h"
#include "Services/WizardDocument.h"

namespace winrt::SurveyController::App::implementation
{
    struct TimingPage : TimingPageT<TimingPage>
    {
        TimingPage();

        void OnNumberChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::NumberBoxValueChangedEventArgs const&);
        void OnWindowDateChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::CalendarDatePickerDateChangedEventArgs const&);
        void OnWindowTimeChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::TimePickerSelectedTimeChangedEventArgs const&);
        void OnToggled(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnChooseReverseFill(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        Services::WizardDocument& m_document;
        hstring m_reverseFillPath;
        bool m_initialized{};
        bool m_loadingSettings{};
        Microsoft::UI::Dispatching::DispatcherQueueTimer m_syncTimer{ nullptr };
        int32_t m_syncGeneration{};

        void PopulateFromDocument();
        void ScheduleSync();
        bool SyncToDocument();
        Windows::Foundation::IAsyncOperation<hstring> ChooseFile(bool image, bool spreadsheet = false);
        void ShowStatus(Microsoft::UI::Xaml::Controls::InfoBarSeverity severity,
            hstring const& title, hstring const& message);
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct TimingPage : TimingPageT<TimingPage, implementation::TimingPage> {};
}
