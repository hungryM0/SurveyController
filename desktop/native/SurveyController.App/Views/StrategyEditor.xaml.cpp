#include "pch.h"
#include "StrategyEditor.xaml.h"
#include "Services/JsonHelpers.h"
#include "Services/RpcServices.h"

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

    namespace
    {
        bool IsWithin(IInspectable const& focused, DependencyObject const& region)
        {
            auto current = focused.try_as<DependencyObject>();
            while (current)
            {
                if (current == region) return true;
                current = Microsoft::UI::Xaml::Media::VisualTreeHelper::GetParent(current);
            }
            return false;
        }
    }

    StrategyEditor::StrategyEditor() : m_sourceDocument(Services::WizardDocument::Current())
    {
        InitializeComponent();
        m_document.LoadConfigState(m_sourceDocument.ConfigState());
        m_sourceRevision = m_sourceDocument.Revision();
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
            LoadEditorViewAsync();
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

    fire_and_forget StrategyEditor::LoadEditorViewAsync()
    {
        auto lifetime = get_strong();
        try
        {
            auto result = co_await Services::ConfigService{}.BuildAnswerEditorAsync(m_sourceDocument.RunRequest());
            auto view = JsonObject::Parse(result);
            ApplyEditorView(view);
            Refresh();
        }
        catch (hresult_error const& error)
        {
            QuestionStatus().Severity(InfoBarSeverity::Error);
            QuestionStatus().Title(L"答案编辑器加载失败");
            QuestionStatus().Message(error.message());
            QuestionStatus().IsOpen(true);
        }
    }

    void StrategyEditor::ApplyEditorView(JsonObject const& view)
    {
        m_editorQuestions = Services::GetJsonArray(view, L"questions");
        for (uint32_t index = 0; index < m_editorQuestions.Size(); ++index)
        {
            auto value = m_editorQuestions.GetAt(index);
            if (value.ValueType() != JsonValueType::Object) continue;
            auto display = value.GetObject();
            auto question = m_document.QuestionAt(index);
            if (!question) continue;
            question.SetNamedValue(L"normalized_type", JsonValue::CreateStringValue(display.GetNamedString(L"questionType", L"unsupported")));
            question.SetNamedValue(L"type_label", JsonValue::CreateStringValue(display.GetNamedString(L"questionTypeLabel", L"暂不支持")));
            question.SetNamedValue(L"page", JsonValue::CreateNumberValue(display.GetNamedNumber(L"page", 1)));
            question.SetNamedValue(L"page_question_count", JsonValue::CreateNumberValue(display.GetNamedNumber(L"pageQuestionCount", 0)));
            question.SetNamedValue(L"unsupported", JsonValue::CreateBooleanValue(display.GetNamedBoolean(L"unsupported", false)));
            question.SetNamedValue(L"unsupported_reason", JsonValue::CreateStringValue(display.GetNamedString(L"unsupportedReason", L"")));
            question.SetNamedValue(L"logic_summary", JsonValue::CreateStringValue(display.GetNamedString(L"logicSummary", L"")));
            question.SetNamedValue(L"inbound_relations", display.GetNamedArray(L"inboundRelations", JsonArray{}));
            question.SetNamedValue(L"outbound_relations", display.GetNamedArray(L"outboundRelations", JsonArray{}));
            question.SetNamedValue(L"search_segments", display.GetNamedArray(L"searchSegments", JsonArray{}));
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
            + (question.GetNamedBoolean(L"required", false) ? L" · 必答" : L" · 非必答")
            + (summary.unsupported ? L" · 暂不支持" : L"")
            + (summary.logicSummary.empty() ? L"" : L" · " + std::wstring{ summary.logicSummary }) });

        m_syncingWeights = true;
        SelectTag(Bias(), strategy.GetNamedString(L"psycho_bias", L"custom"));
        m_syncingWeights = false;
        RebuildWeightEditor(question, strategy, summary.normalizedType);
        WeightSettingsSection().Visibility(!summary.unsupported && m_weightOptions.Size() > 0 ? Visibility::Visible : Visibility::Collapsed);
        auto aiEnabled = strategy.GetNamedBoolean(L"ai_enabled", false);
        AIEnabled().IsOn(aiEnabled);
        SelectTag(TextRandomMode(), strategy.GetNamedString(L"text_random_mode", L"none"));
        if (aiEnabled) TextRandomMode().SelectedIndex(0);
        auto textRange = Services::GetJsonArray(strategy, L"text_random_int_range");
        TextRangeMin().Value(textRange.Size() > 0 ? textRange.GetNumberAt(0) : std::numeric_limits<double>::quiet_NaN());
        TextRangeMax().Value(textRange.Size() > 1 ? textRange.GetNumberAt(1) : std::numeric_limits<double>::quiet_NaN());
        LoadAdvancedEditors(question, strategy, summary);
        UpdateTextModeVisibility();
        QuestionStatus().IsOpen(false);
        m_currentQuestionDirty = false;
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
            auto options = Services::GetJsonArray(table, L"options");
            auto rows = Services::GetJsonArray(table, L"rows");
            if (options.Size() || rows.Size())
            {
                auto validate = [](JsonArray const& values)
                {
                    double total = 0;
                    for (auto const& value : values) total += value.GetNumber();
                    if (total <= 0) throw hresult_error(E_INVALIDARG, L"选项配比不能全为 0。");
                };
                if (options.Size() && !m_sliderValue) validate(options);
                for (auto const& row : rows)
                {
                    if (row.ValueType() == JsonValueType::Array) validate(row.GetArray());
                }
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
                    throw hresult_error(E_INVALIDARG, L"随机整数模式必须填写最小值和最大值。");
                JsonArray range;
                range.Append(JsonValue::CreateNumberValue((std::min)(TextRangeMin().Value(), TextRangeMax().Value())));
                range.Append(JsonValue::CreateNumberValue((std::max)(TextRangeMin().Value(), TextRangeMax().Value())));
                changes.SetNamedValue(L"text_random_int_range", range);
            }
            else changes.SetNamedValue(L"text_random_int_range", JsonValue::CreateNullValue());
            SaveAdvancedEditors(m_document.QuestionAt(static_cast<uint32_t>(index)), m_currentNormalizedType, changes);
            m_document.UpdateQuestionStrategy(static_cast<uint32_t>(index), changes);
            auto question = m_document.QuestionAt(static_cast<uint32_t>(index));
            auto number = static_cast<int32_t>(question.GetNamedNumber(L"num", 0));
            m_pendingDrafts[number] = DraftFromStrategy(number, m_document.StrategyAt(static_cast<uint32_t>(index)));
            m_currentQuestionDirty = false;

            QuestionStatus().Severity(InfoBarSeverity::Success);
            QuestionStatus().Title(L"题目草稿已保留");
            QuestionStatus().Message(L"保存全部答案后才会写入配置。");
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

    JsonObject StrategyEditor::DraftFromStrategy(int32_t questionNumber, JsonObject const& strategy) const
    {
        JsonObject draft;
        draft.SetNamedValue(L"questionNum", JsonValue::CreateNumberValue(questionNumber));
        auto copy = [&](wchar_t const* target, wchar_t const* source)
        {
            if (strategy.HasKey(source)) draft.SetNamedValue(target, strategy.GetNamedValue(source));
        };
        copy(L"distributionMode", L"distribution_mode");
        copy(L"customWeights", L"custom_weights");
        copy(L"texts", L"texts");
        copy(L"aiEnabled", L"ai_enabled");
        copy(L"optionFillTexts", L"option_fill_texts");
        copy(L"fillableOptionIndices", L"fillable_option_indices");
        copy(L"attachedOptionSelects", L"attached_option_selects");
        copy(L"locationParts", L"location_parts");
        copy(L"multiTextBlankModes", L"multi_text_blank_modes");
        copy(L"multiTextBlankAIFlags", L"multi_text_blank_ai_flags");
        copy(L"multiTextBlankIntRanges", L"multi_text_blank_int_ranges");
        copy(L"textRandomMode", L"text_random_mode");
        copy(L"textRandomIntRange", L"text_random_int_range");
        copy(L"dimension", L"dimension");
        copy(L"psychoBias", L"psycho_bias");
        return draft;
    }

    Windows::Foundation::IAsyncOperation<bool> StrategyEditor::ApplyChangesAsync()
    {
        if (!SaveCurrentQuestion()) co_return false;
        if (m_sourceRevision != m_sourceDocument.Revision())
        {
            QuestionStatus().Severity(InfoBarSeverity::Error);
            QuestionStatus().Title(L"配置已更新");
            QuestionStatus().Message(L"问卷已重新加载或路径已切换，本次答案草稿已失效。");
            QuestionStatus().IsOpen(true);
            co_return false;
        }
        if (m_pendingDrafts.empty()) co_return true;
        JsonObject request = JsonObject::Parse(m_sourceDocument.RunRequest());
        JsonArray changes;
        for (auto const& [number, draft] : m_pendingDrafts)
        {
            UNREFERENCED_PARAMETER(number);
            changes.Append(draft);
        }
        request.SetNamedValue(L"changes", changes);
        try
        {
            auto resultText = co_await Services::ConfigService{}.ApplyAnswerChangesAsync(request.Stringify());
            auto result = JsonObject::Parse(resultText);
            auto errors = Services::GetJsonArray(result, L"errors");
            if (errors.Size() > 0)
            {
                auto first = errors.GetObjectAt(0);
                auto number = static_cast<int32_t>(first.GetNamedNumber(L"questionNum", 0));
                QuestionStatus().Severity(InfoBarSeverity::Error);
                QuestionStatus().Title(number > 0 ? hstring{ L"第 " + std::to_wstring(number) + L" 题保存失败" } : L"答案保存失败");
                QuestionStatus().Message(first.GetNamedString(L"message", L"答案配置无效。"));
                QuestionStatus().IsOpen(true);
                co_return false;
            }
            auto config = result.GetNamedObject(L"config", nullptr);
            if (!config) throw hresult_error(E_FAIL, L"后端没有返回完整配置。");
            m_sourceDocument.SetParsedConfig(config.Stringify());
            m_sourceRevision = m_sourceDocument.Revision();
            m_pendingDrafts.clear();
            co_return true;
        }
        catch (hresult_error const& error)
        {
            QuestionStatus().Severity(InfoBarSeverity::Error);
            QuestionStatus().Title(L"答案保存失败");
            QuestionStatus().Message(error.message());
            QuestionStatus().IsOpen(true);
            co_return false;
        }
    }

    void StrategyEditor::FocusSearch() { QuestionSearch().Focus(FocusState::Keyboard); }
    void StrategyEditor::SelectPreviousQuestion() { SelectQuestion(m_questionIndex - 1); }
    void StrategyEditor::SelectNextQuestion() { SelectQuestion(m_questionIndex + 1); }
    void StrategyEditor::FocusSection(bool reverse)
    {
        std::vector<Control> regions{ QuestionSearch() };
        if (QuestionListPane().Visibility() == Visibility::Visible) regions.push_back(QuestionTree());
        if (QuestionDetailScroll().Visibility() == Visibility::Visible) regions.push_back(QuestionDetailScroll());
        if (regions.empty()) return;

        auto focused = Microsoft::UI::Xaml::Input::FocusManager::GetFocusedElement(XamlRoot());
        int32_t current = -1;
        for (uint32_t index = 0; index < regions.size(); ++index)
        {
            if (IsWithin(focused, regions[index]))
            {
                current = static_cast<int32_t>(index);
                break;
            }
        }
        auto const size = static_cast<int32_t>(regions.size());
        auto next = reverse ? (current <= 0 ? size - 1 : current - 1) : (current + 1) % size;
        regions[static_cast<size_t>(next)].Focus(FocusState::Keyboard);
    }
    void StrategyEditor::ShowQuestionList()
    {
        if (ActualWidth() < 800)
        {
            QuestionListPane().Visibility(Visibility::Visible);
            QuestionDetailScroll().Visibility(Visibility::Collapsed);
        }
        QuestionTree().Focus(FocusState::Keyboard);
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

    void StrategyEditor::OnBackToList(IInspectable const&, RoutedEventArgs const&) { ShowQuestionList(); }

    void StrategyEditor::UpdateTextModeVisibility()
    {
        auto mode = SelectedTag(TextRandomMode(), L"none");
        TextAnswers().Visibility(mode == L"none"
            ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        TextRangeRow().Visibility(mode == L"integer"
            ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
    }

    hstring StrategyEditor::SelectedTag(RadioButtons const& buttons, hstring const& fallback) const
    {
        auto item = buttons.SelectedItem().try_as<RadioButton>();
        return item ? unbox_value_or<hstring>(item.Tag(), fallback) : fallback;
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
