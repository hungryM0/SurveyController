#include "pch.h"
#include "StrategyEditor.xaml.h"

#if __has_include("StrategyEditor.g.cpp")
#include "StrategyEditor.g.cpp"
#endif

#include <algorithm>
#include <cmath>
#include <limits>

namespace winrt::SurveyController::App::implementation
{
    using namespace Microsoft::UI::Xaml;
    using namespace Microsoft::UI::Xaml::Controls;
    using namespace Windows::Data::Json;

    StrategyEditor::StrategyEditor() : m_document(Services::WizardDocument::Current())
    {
        InitializeComponent();
        m_initialized = true;
    }

    void StrategyEditor::OnLoaded(IInspectable const&, RoutedEventArgs const&)
    {
        if (m_isLoaded) return;
        m_isLoaded = true;
        try
        {
            // ItemsRepeater rejects some collection changes while its template is still loading.
            OptionWeightRows().ItemsSource(m_weightOptions);
            m_itemsSourceBound = true;
            Refresh();
        }
        catch (hresult_error const& error)
        {
            QuestionStatus().Severity(InfoBarSeverity::Error);
            QuestionStatus().Title(L"答案编辑器加载失败");
            QuestionStatus().Message(error.message());
            QuestionStatus().IsOpen(true);
        }
        catch (...)
        {
            QuestionStatus().Severity(InfoBarSeverity::Error);
            QuestionStatus().Title(L"答案编辑器加载失败");
            QuestionStatus().Message(L"无法加载题目答案编辑器。");
            QuestionStatus().IsOpen(true);
        }
    }

    void StrategyEditor::Refresh()
    {
        if (!m_isLoaded || !m_itemsSourceBound) return;
        RebuildQuestionTree(m_questionIndex);
    }

    void StrategyEditor::LoadQuestion()
    {
        auto index = m_questionIndex;
        if (index < 0) return;
        auto question = m_document.QuestionAt(static_cast<uint32_t>(index));
        auto strategy = m_document.StrategyAt(static_cast<uint32_t>(index));
        auto number = static_cast<int32_t>(question.GetNamedNumber(L"num", 0));
        auto summary = m_document.Questions()[static_cast<size_t>(index)];
        m_currentNormalizedType = summary.normalizedType;
        QuestionTitle().Text(question.GetNamedString(L"title", L"未命名题目"));
        QuestionMeta().Text(hstring{ L"第 " + std::to_wstring(number) + L" 题 · "
            + std::wstring{ summary.type }
            + (question.GetNamedBoolean(L"required", false) ? L" · 必答" : L"") });
        QuestionTypeBadge().Text(summary.type);
        QuestionTypeIcon().Glyph(summary.icon);
        RequiredBadgeBorder().Visibility(question.GetNamedBoolean(L"required", false) ? Visibility::Visible : Visibility::Collapsed);
        auto hasLogic = question.GetNamedArray(L"jump_rules", JsonArray{}).Size() > 0 ||
            question.GetNamedArray(L"controls_display_targets", JsonArray{}).Size() > 0;
        LogicBadgeBorder().Visibility(hasLogic ? Visibility::Visible : Visibility::Collapsed);
        UnsupportedBadgeBorder().Visibility(summary.unsupported ? Visibility::Visible : Visibility::Collapsed);
        ApplyQuestionTypeBrush(summary.normalizedType);
        m_syncingWeights = true;
        SelectTag(Bias(), strategy.GetNamedString(L"psycho_bias", L"custom"));
        m_syncingWeights = false;
        RebuildWeightEditor(question, strategy, summary.normalizedType);
        WeightSettingsSection().Visibility(m_weightOptions.Size() > 0 ? Visibility::Visible : Visibility::Collapsed);
        auto aiEnabled = strategy.GetNamedBoolean(L"ai_enabled", false);
        AIEnabled().IsOn(aiEnabled);
        SelectTag(TextRandomMode(), strategy.GetNamedString(L"text_random_mode", L"none"));
        if (aiEnabled) TextRandomMode().SelectedIndex(0);
        auto textRange = strategy.GetNamedArray(L"text_random_int_range", JsonArray{});
        TextRangeMin().Value(textRange.Size() > 0 ? textRange.GetNumberAt(0) : std::numeric_limits<double>::quiet_NaN());
        TextRangeMax().Value(textRange.Size() > 1 ? textRange.GetNumberAt(1) : std::numeric_limits<double>::quiet_NaN());
        Dimension().Text(strategy.GetNamedString(L"dimension", L""));
        LoadAdvancedEditors(question, strategy, summary);
        UpdateTextModeVisibility();
        QuestionStatus().IsOpen(false);
        m_currentQuestionDirty = false;
    }

    void StrategyEditor::OnSaveQuestion(IInspectable const&, RoutedEventArgs const&)
    {
        SaveCurrentQuestion();
    }

    bool StrategyEditor::SaveCurrentQuestion()
    {
        auto index = m_questionIndex;
        if (index < 0) return true;
        if (!m_currentQuestionDirty) return true;
        try
        {
            JsonObject changes;
            changes.SetNamedValue(L"psycho_bias", JsonValue::CreateStringValue(SelectedTag(Bias(), L"custom")));
            changes.SetNamedValue(L"ai_enabled", JsonValue::CreateBooleanValue(AIEnabled().IsOn()));
            auto table = WeightTable();
            auto options = table.GetNamedArray(L"options", JsonArray{});
            auto rows = table.GetNamedArray(L"rows", JsonArray{});
            if (options.Size() || rows.Size())
            {
                auto validate = [](JsonArray const& values)
                {
                    double total = 0;
                    for (auto const& value : values) total += value.GetNumber();
                    if (total <= 0) throw hresult_invalid_argument(L"选项配比不能全为 0。");
                };
                if (options.Size() && !m_sliderValue) validate(options);
                for (auto const& row : rows) validate(row.GetArray());
                changes.SetNamedValue(L"custom_weights", table);
                changes.SetNamedValue(L"probabilities", table);
                changes.SetNamedValue(L"distribution_mode", JsonValue::CreateStringValue(L"custom"));
            }
            else changes.SetNamedValue(L"custom_weights", JsonValue::CreateNullValue());
            auto textMode = SelectedTag(TextRandomMode(), L"none");
            changes.SetNamedValue(L"text_random_mode", JsonValue::CreateStringValue(textMode));
            if (textMode == L"integer")
            {
                if (std::isnan(TextRangeMin().Value()) || std::isnan(TextRangeMax().Value()))
                    throw hresult_invalid_argument(L"随机整数模式必须填写最小值和最大值。");
                JsonArray range;
                range.Append(JsonValue::CreateNumberValue((std::min)(TextRangeMin().Value(), TextRangeMax().Value())));
                range.Append(JsonValue::CreateNumberValue((std::max)(TextRangeMin().Value(), TextRangeMax().Value())));
                changes.SetNamedValue(L"text_random_int_range", range);
            }
            else changes.SetNamedValue(L"text_random_int_range", JsonValue::CreateNullValue());
            changes.SetNamedValue(L"dimension", JsonValue::CreateStringValue(Dimension().Text()));
            SaveAdvancedEditors(m_document.QuestionAt(static_cast<uint32_t>(index)), m_currentNormalizedType, changes);
            m_document.UpdateQuestionStrategy(static_cast<uint32_t>(index), changes);
            m_currentQuestionDirty = false;

            QuestionStatus().Severity(InfoBarSeverity::Success);
            QuestionStatus().Title(L"题目设置已保存");
            QuestionStatus().Message(L"");
            QuestionStatus().IsOpen(true);
            return true;
        }
        catch (hresult_error const& error)
        {
            QuestionStatus().Severity(InfoBarSeverity::Error);
            QuestionStatus().Title(L"题目设置格式错误");
            QuestionStatus().Message(error.message());
            QuestionStatus().IsOpen(true);
            return false;
        }
    }

    void StrategyEditor::OnTextModeChanged(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (!m_initialized) return;
        m_currentQuestionDirty = true;
        if (SelectedTag(TextRandomMode(), L"none") != L"none" && AIEnabled().IsOn()) AIEnabled().IsOn(false);
        UpdateTextModeVisibility();
    }

    void StrategyEditor::OnAIEnabledToggled(IInspectable const&, RoutedEventArgs const&)
    {
        if (!m_initialized) return;
        m_currentQuestionDirty = true;
        if (AIEnabled().IsOn() && SelectedTag(TextRandomMode(), L"none") != L"none") TextRandomMode().SelectedIndex(0);
        UpdateTextModeVisibility();
    }

    void StrategyEditor::OnQuestionTextChanged(IInspectable const&, TextChangedEventArgs const&)
    {
        if (m_initialized) m_currentQuestionDirty = true;
    }

    void StrategyEditor::OnQuestionNumberChanged(IInspectable const&, NumberBoxValueChangedEventArgs const&)
    {
        if (m_initialized) m_currentQuestionDirty = true;
    }

    void StrategyEditor::UpdateTextModeVisibility()
    {
        auto mode = SelectedTag(TextRandomMode(), L"none");
        TextAnswers().Visibility(mode == L"none"
            ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        TextRangeRow().Visibility(mode == L"integer"
            ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
    }

    hstring StrategyEditor::SelectedTag(ComboBox const& combo, hstring const& fallback) const
    {
        auto item = combo.SelectedItem().try_as<ComboBoxItem>();
        return item ? unbox_value_or<hstring>(item.Tag(), fallback) : fallback;
    }

    hstring StrategyEditor::SelectedTag(RadioButtons const& buttons, hstring const& fallback) const
    {
        auto item = buttons.SelectedItem().try_as<RadioButton>();
        return item ? unbox_value_or<hstring>(item.Tag(), fallback) : fallback;
    }

    void StrategyEditor::SelectTag(ComboBox const& combo, hstring const& value)
    {
        for (uint32_t index = 0; index < combo.Items().Size(); ++index)
        {
            auto item = combo.Items().GetAt(index).try_as<ComboBoxItem>();
            if (item && unbox_value_or<hstring>(item.Tag(), L"") == value)
            {
                combo.SelectedIndex(static_cast<int32_t>(index));
                return;
            }
        }
        combo.SelectedIndex(0);
    }

    void StrategyEditor::SelectTag(RadioButtons const& buttons, hstring const& value)
    {
        for (uint32_t index = 0; index < buttons.Items().Size(); ++index)
        {
            auto item = buttons.Items().GetAt(index).try_as<RadioButton>();
            if (item && unbox_value_or<hstring>(item.Tag(), L"") == value)
            {
                buttons.SelectedIndex(static_cast<int32_t>(index));
                return;
            }
        }
        buttons.SelectedIndex(0);
    }
}
