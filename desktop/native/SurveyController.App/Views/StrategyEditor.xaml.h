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

        void OnQuestionSelected(IInspectable const&, Microsoft::UI::Xaml::Controls::TreeViewSelectionChangedEventArgs const&);
        void OnQuestionInvoked(IInspectable const&, Microsoft::UI::Xaml::Controls::TreeViewItemInvokedEventArgs const&);
        void OnQuestionSearchChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::TextChangedEventArgs const&);
        void OnEditorModeChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectorBarSelectionChangedEventArgs const&);
        void OnSaveQuestion(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnBiasChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnTextModeChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnRuleSelected(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnNewRule(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnDeleteRule(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnSaveRule(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        Services::WizardDocument& m_document;
        int32_t m_ruleIndex{ -1 };
        bool m_initialized{};
        bool m_syncingWeights{};
        bool m_multipleWeights{};
        bool m_syncingTreeSelection{};
        int32_t m_questionIndex{ -1 };
        hstring m_questionSearch;
        std::vector<Microsoft::UI::Xaml::Controls::TreeViewNode> m_questionNodes;
        std::vector<std::pair<Microsoft::UI::Xaml::Controls::TreeViewNode, int32_t>> m_treeTargets;
        Windows::Foundation::Collections::IObservableVector<SurveyController::App::OptionWeight> m_weightOptions{
            winrt::single_threaded_observable_vector<SurveyController::App::OptionWeight>() };
        std::vector<hstring> m_weightLabels;

        void LoadQuestion();
        void RebuildQuestionTree(int32_t selectedIndex);
        void SelectQuestion(int32_t index);
        void RebuildWeightEditor(Windows::Data::Json::JsonObject const& question,
            Windows::Data::Json::JsonObject const& strategy);
        void ApplyBiasPreset(hstring const& bias);
        void UpdateRatioPreview();
        Windows::Data::Json::JsonArray WeightValues() const;
        void LoadRule();
        void LoadRules();
        void UpdateTextModeVisibility();
        hstring SelectedTag(Microsoft::UI::Xaml::Controls::ComboBox const&, hstring const&) const;
        void SelectTag(Microsoft::UI::Xaml::Controls::ComboBox const&, hstring const&);
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct StrategyEditor : StrategyEditorT<StrategyEditor, implementation::StrategyEditor> {};
}
