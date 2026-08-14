#pragma once

#include "StrategyEditor.g.h"
#include "Services/WizardDocument.h"
#include "ViewModels/OptionWeight.h"

namespace winrt::SurveyController::App::implementation
{
    struct StrategyEditor : StrategyEditorT<StrategyEditor>
    {
        StrategyEditor();
        void Refresh();
        Windows::Foundation::Collections::IObservableVector<SurveyController::App::OptionWeight> WeightOptions();

        void OnQuestionSelected(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnEditorModeChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectorBarSelectionChangedEventArgs const&);
        void OnSaveQuestion(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnBiasChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
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
        bool m_syncingWeights{};
        bool m_multipleWeights{};
        Windows::Foundation::Collections::IObservableVector<SurveyController::App::OptionWeight> m_weightOptions;
        std::vector<hstring> m_weightLabels;

        void LoadQuestion();
        void RebuildWeightEditor(Windows::Data::Json::JsonObject const& question,
            Windows::Data::Json::JsonObject const& strategy);
        void ApplyBiasPreset(hstring const& bias);
        void UpdateRatioPreview();
        Windows::Data::Json::JsonArray WeightValues() const;
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
