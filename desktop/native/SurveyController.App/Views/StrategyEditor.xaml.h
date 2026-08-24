#pragma once

#include "StrategyEditor.g.h"
#include "Services/WizardDocument.h"
#include "ViewModels/OptionWeight.h"

namespace winrt::SurveyController::App::implementation
{
    struct StrategyEditor : StrategyEditorT<StrategyEditor>
    {
        StrategyEditor();
        void OnLoaded(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void Refresh();
        bool SaveCurrentQuestion();
        Windows::Foundation::Collections::IObservableVector<SurveyController::App::OptionWeight> WeightOptions();

        void OnQuestionSelected(IInspectable const&, Microsoft::UI::Xaml::Controls::TreeViewSelectionChangedEventArgs const&);
        void OnQuestionInvoked(IInspectable const&, Microsoft::UI::Xaml::Controls::TreeViewItemInvokedEventArgs const&);
        void OnQuestionSearchChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::AutoSuggestBoxTextChangedEventArgs const&);
        void OnQuestionSuggestionChosen(IInspectable const&, Microsoft::UI::Xaml::Controls::AutoSuggestBoxSuggestionChosenEventArgs const&);
        void OnQuestionQuerySubmitted(IInspectable const&, Microsoft::UI::Xaml::Controls::AutoSuggestBoxQuerySubmittedEventArgs const&);
        void OnBiasChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnTextModeChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnAIEnabledToggled(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnQuestionTextChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::TextChangedEventArgs const&);
        void OnQuestionNumberChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::NumberBoxValueChangedEventArgs const&);

    private:
        Services::WizardDocument& m_document;
        bool m_initialized{};
        bool m_isLoaded{};
        bool m_itemsSourceBound{};
        bool m_syncingWeights{};
        bool m_multipleWeights{};
        bool m_sliderValue{};
        bool m_syncingTreeSelection{};
        bool m_currentQuestionDirty{};
        int32_t m_questionIndex{ -1 };
        hstring m_currentNormalizedType;
        hstring m_questionSearch;
        std::vector<Microsoft::UI::Xaml::Controls::TreeViewNode> m_questionNodes;
        std::vector<std::pair<Microsoft::UI::Xaml::Controls::TreeViewNode, int32_t>> m_treeTargets;
        Windows::Foundation::Collections::IObservableVector<SurveyController::App::OptionWeight> m_weightOptions{
            winrt::single_threaded_observable_vector<SurveyController::App::OptionWeight>() };
        std::vector<hstring> m_weightLabels;
        uint32_t m_weightRows{ 1 };
        uint32_t m_weightColumns{};

        struct OptionFillControls
        {
            int32_t optionIndex{};
            Microsoft::UI::Xaml::Controls::TextBox text{ nullptr };
            Microsoft::UI::Xaml::Controls::RadioButtons mode{ nullptr };
            Microsoft::UI::Xaml::Controls::NumberBox minimum{ nullptr };
            Microsoft::UI::Xaml::Controls::NumberBox maximum{ nullptr };
            Microsoft::UI::Xaml::Controls::ToggleSwitch ai{ nullptr };
        };

        struct MultiTextControls
        {
            Microsoft::UI::Xaml::Controls::RadioButtons mode{ nullptr };
            Microsoft::UI::Xaml::Controls::NumberBox minimum{ nullptr };
            Microsoft::UI::Xaml::Controls::NumberBox maximum{ nullptr };
            Microsoft::UI::Xaml::Controls::ToggleSwitch ai{ nullptr };
        };

        struct AttachedSelectControls
        {
            int32_t optionIndex{};
            hstring optionText;
            Windows::Data::Json::JsonObject source{ nullptr };
            std::vector<hstring> selectTexts;
            std::vector<Microsoft::UI::Xaml::Controls::NumberBox> weights;
        };

        std::vector<OptionFillControls> m_optionFillControls;
        std::vector<MultiTextControls> m_multiTextControls;
        std::vector<AttachedSelectControls> m_attachedSelectControls;

        void LoadQuestion();
        void RebuildQuestionTree(int32_t selectedIndex);
        void SelectQuestion(int32_t index);
        void RebuildWeightEditor(Windows::Data::Json::JsonObject const& question,
            Windows::Data::Json::JsonObject const& strategy, hstring const& normalizedType);
        void ApplyBiasPreset(hstring const& bias);
        void UpdateRatioPreview();
        Windows::Data::Json::JsonArray WeightValues() const;
        Windows::Data::Json::JsonObject WeightTable() const;
        void UpdateTextModeVisibility();
        void LoadAdvancedEditors(Windows::Data::Json::JsonObject const& question,
            Windows::Data::Json::JsonObject const& strategy, Services::WizardQuestion const& summary);
        void SaveAdvancedEditors(Windows::Data::Json::JsonObject const& question,
            hstring const& normalizedType, Windows::Data::Json::JsonObject& changes);
        void ApplyQuestionTypeBrush(hstring const& normalizedType);
        hstring SelectedTag(Microsoft::UI::Xaml::Controls::RadioButtons const&, hstring const&) const;
        void SelectTag(Microsoft::UI::Xaml::Controls::RadioButtons const&, hstring const&);
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct StrategyEditor : StrategyEditorT<StrategyEditor, implementation::StrategyEditor> {};
}
