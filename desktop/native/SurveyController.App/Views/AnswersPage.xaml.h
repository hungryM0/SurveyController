#pragma once

#include "AnswersPage.g.h"
#include "AnswerEditorWindow.xaml.h"
#include "Services/WizardDocument.h"

namespace winrt::SurveyController::App::implementation
{
    struct AnswersPage : AnswersPageT<AnswersPage>
    {
        AnswersPage();

        void OnLoaded(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnEditAnswers(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        Services::WizardDocument& m_document;
        SurveyController::App::AnswerEditorWindow m_answerEditor{ nullptr };

        void UpdateStats();
        void ShowStatus(Microsoft::UI::Xaml::Controls::InfoBarSeverity severity,
            hstring const& title, hstring const& message);
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct AnswersPage : AnswersPageT<AnswersPage, implementation::AnswersPage> {};
}
