#pragma once

#include "SurveyPage.g.h"
#include "AnswerEditorWindow.xaml.h"
#include "Services/WizardDocument.h"

namespace winrt::SurveyController::App::implementation
{
    struct SurveyPage : SurveyPageT<SurveyPage>
    {
        SurveyPage();

        void OnLoaded(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnSurveyUrlChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::TextChangedEventArgs const&);
        winrt::fire_and_forget OnParse(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnChooseQRCode(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnImportConfig(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnEditAnswers(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        Services::WizardDocument& m_document;
        SurveyController::App::AnswerEditorWindow m_answerEditor{ nullptr };
        bool m_initialized{};
        bool m_busy{};
        bool m_parsed{};

        void RefreshFromDocument();
        void UpdateStats();
        void SetBusy(bool busy);
        void ShowStatus(Microsoft::UI::Xaml::Controls::InfoBarSeverity severity,
            hstring const& title, hstring const& message);
        void ShowParsedSurvey();
        Windows::Foundation::IAsyncOperation<hstring> ChooseFile(bool image, bool spreadsheet = false);
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct SurveyPage : SurveyPageT<SurveyPage, implementation::SurveyPage> {};
}
