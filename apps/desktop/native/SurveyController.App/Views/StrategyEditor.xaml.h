#pragma once

#include "StrategyEditor.g.h"
#include "Services/WizardDocument.h"

namespace winrt::SurveyController::App::implementation
{
    struct StrategyEditor : StrategyEditorT<StrategyEditor>
    {
        StrategyEditor();
        void Refresh();

        void OnQuestionSelected(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnSaveQuestion(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnTextModeChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnRuleSelected(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnNewRule(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnDeleteRule(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnSaveRule(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnSaveDimensions(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        Services::WizardDocument& m_document;
        int32_t m_ruleIndex{ -1 };
        bool m_initialized{};

        void LoadQuestion();
        void LoadRule();
        void LoadRules();
        void LoadDimensions();
        void UpdateTextModeVisibility();
        hstring SelectedTag(Microsoft::UI::Xaml::Controls::ComboBox const&, hstring const&) const;
        void SelectTag(Microsoft::UI::Xaml::Controls::ComboBox const&, hstring const&);
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct StrategyEditor : StrategyEditorT<StrategyEditor, implementation::StrategyEditor> {};
}
