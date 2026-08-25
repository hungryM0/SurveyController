#pragma once

#include "ReverseFillPage.g.h"
#include "Services/WizardDocument.h"

namespace winrt::SurveyController::App::implementation
{
    struct ReverseFillPage : ReverseFillPageT<ReverseFillPage>
    {
        ReverseFillPage();

        void OnLoaded(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnChooseSpreadsheet(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnToggled(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        Services::WizardDocument& m_document;
        bool m_initialized{};
        bool m_loadingSettings{};

        void PopulateFromDocument();
        void SyncToDocument();
        void ShowStatus(Microsoft::UI::Xaml::Controls::InfoBarSeverity severity,
            hstring const& title, hstring const& message);
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct ReverseFillPage : ReverseFillPageT<ReverseFillPage, implementation::ReverseFillPage> {};
}
