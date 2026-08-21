#pragma once

#include "RuleEditor.g.h"
#include "Services/WizardDocument.h"

namespace winrt::SurveyController::App::implementation
{
    struct RuleEditor : RuleEditorT<RuleEditor>
    {
        RuleEditor();
        void Refresh();
        void OnLoaded(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnRuleSelected(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnNewRule(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnDeleteRule(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnMoveRuleUp(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnMoveRuleDown(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnSaveRule(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnConditionQuestionTextChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::AutoSuggestBoxTextChangedEventArgs const&);
        void OnTargetQuestionTextChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::AutoSuggestBoxTextChangedEventArgs const&);
        void OnConditionQuestionChosen(IInspectable const&, Microsoft::UI::Xaml::Controls::AutoSuggestBoxSuggestionChosenEventArgs const&);
        void OnTargetQuestionChosen(IInspectable const&, Microsoft::UI::Xaml::Controls::AutoSuggestBoxSuggestionChosenEventArgs const&);
        void OnConditionQuestionSubmitted(IInspectable const&, Microsoft::UI::Xaml::Controls::AutoSuggestBoxQuerySubmittedEventArgs const&);
        void OnTargetQuestionSubmitted(IInspectable const&, Microsoft::UI::Xaml::Controls::AutoSuggestBoxQuerySubmittedEventArgs const&);

    private:
        Services::WizardDocument& m_document;
        int32_t m_ruleIndex{ -1 };
        int32_t m_conditionNumber{};
        int32_t m_targetNumber{};
        bool m_isLoaded{};
        bool m_refreshPending{};
        bool m_updating{};
        void ClearRuleForm();
        void LoadRule();
        void UpdateCommandState();
        void LoadQuestionPicker(Microsoft::UI::Xaml::Controls::AutoSuggestBox const&, bool target);
        void SubmitQuestionQuery(Microsoft::UI::Xaml::Controls::AutoSuggestBox const&,
            Microsoft::UI::Xaml::Controls::AutoSuggestBoxQuerySubmittedEventArgs const&, bool target);
        bool SelectQuestion(int32_t number, bool target);
        Windows::Data::Json::JsonArray SelectedIndices(Microsoft::UI::Xaml::Controls::ListView const&) const;
        hstring SelectedTag(Microsoft::UI::Xaml::Controls::RadioButtons const&, hstring const&) const;
        void SelectTag(Microsoft::UI::Xaml::Controls::RadioButtons const&, hstring const&);
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct RuleEditor : RuleEditorT<RuleEditor, implementation::RuleEditor> {};
}
