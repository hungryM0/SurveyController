#include "pch.h"
#include "StrategyEditor.xaml.h"

#if __has_include("StrategyEditor.g.cpp")
#include "StrategyEditor.g.cpp"
#endif

#include <algorithm>
#include <cmath>
#include <limits>
#include <optional>
#include <sstream>
#include <unordered_set>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        using namespace Microsoft::UI::Xaml;
        using namespace Microsoft::UI::Xaml::Controls;
        using namespace Windows::Data::Json;

        std::wstring Trim(std::wstring value)
        {
            auto const first = value.find_first_not_of(L" \t\r\n");
            if (first == std::wstring::npos) return {};
            auto const last = value.find_last_not_of(L" \t\r\n");
            return value.substr(first, last - first + 1);
        }

        JsonArray ParseIntList(hstring const& text, bool oneBased = true)
        {
            std::wstring normalized{ text };
            for (auto& character : normalized)
            {
                if (character == L',' || character == L';' || character == L'|') character = L' ';
            }
            std::wistringstream input(normalized);
            std::unordered_set<int32_t> seen;
            std::vector<int32_t> values;
            int32_t value = 0;
            while (input >> value)
            {
                if (oneBased) --value;
                if (value >= 0 && seen.insert(value).second) values.push_back(value);
            }
            std::sort(values.begin(), values.end());
            JsonArray result;
            for (auto const item : values) result.Append(JsonValue::CreateNumberValue(item));
            return result;
        }

        hstring FormatIntList(JsonArray const& values, bool oneBased = true)
        {
            std::wostringstream output;
            for (uint32_t index = 0; index < values.Size(); ++index)
            {
                if (index) output << L", ";
                auto value = static_cast<int32_t>(values.GetNumberAt(index));
                output << (oneBased ? value + 1 : value);
            }
            return hstring{ output.str() };
        }

        JsonArray ParseStrings(hstring const& text, wchar_t delimiter = L'|')
        {
            JsonArray result;
            std::wstringstream input(std::wstring{ text });
            std::wstring item;
            while (std::getline(input, item, delimiter))
            {
                auto value = Trim(std::move(item));
                if (!value.empty()) result.Append(JsonValue::CreateStringValue(hstring{ value }));
            }
            return result;
        }

        hstring FormatStrings(JsonArray const& values, wchar_t const* separator = L" | ")
        {
            std::wstring output;
            for (auto const& value : values)
            {
                if (value.ValueType() != JsonValueType::String) continue;
                if (!output.empty()) output += separator;
                output += value.GetString();
            }
            return hstring{ output };
        }

        JsonArray ParseBoolList(hstring const& text)
        {
            std::wstring normalized{ text };
            for (auto& character : normalized)
            {
                if (character == L',' || character == L';' || character == L'|') character = L' ';
            }
            std::wistringstream input(normalized);
            JsonArray result;
            int32_t value = 0;
            while (input >> value)
            {
                result.Append(JsonValue::CreateBooleanValue(value != 0));
            }
            return result;
        }

        hstring FormatBoolList(JsonArray const& values)
        {
            std::wostringstream output;
            for (uint32_t index = 0; index < values.Size(); ++index)
            {
                if (index) output << L", ";
                output << (values.GetBooleanAt(index) ? 1 : 0);
            }
            return hstring{ output.str() };
        }

        JsonArray ParseRanges(hstring const& text)
        {
            JsonArray result;
            std::wstringstream input(std::wstring{ text });
            std::wstring item;
            while (std::getline(input, item, L'|'))
            {
                auto normalized = Trim(std::move(item));
                for (auto& character : normalized) if (character == L'-') character = L' ';
                std::wistringstream rangeInput(normalized);
                int32_t minimum = 0;
                int32_t maximum = 0;
                if (!(rangeInput >> minimum >> maximum)) continue;
                JsonArray range;
                range.Append(JsonValue::CreateNumberValue((std::min)(minimum, maximum)));
                range.Append(JsonValue::CreateNumberValue((std::max)(minimum, maximum)));
                result.Append(range);
            }
            return result;
        }

        hstring FormatRanges(JsonArray const& values)
        {
            std::wostringstream output;
            for (uint32_t index = 0; index < values.Size(); ++index)
            {
                auto range = values.GetArrayAt(index);
                if (range.Size() < 2) continue;
                if (output.tellp() > 0) output << L" | ";
                output << static_cast<int32_t>(range.GetNumberAt(0)) << L'-'
                    << static_cast<int32_t>(range.GetNumberAt(1));
            }
            return hstring{ output.str() };
        }

        std::optional<int32_t> OptionalOneBasedIndex(hstring const& text)
        {
            auto value = Trim(std::wstring{ text });
            if (value.empty()) return std::nullopt;
            try
            {
                auto parsed = std::stoi(value) - 1;
                if (parsed >= 0) return parsed;
            }
            catch (...) {}
            return std::nullopt;
        }
    }

    StrategyEditor::StrategyEditor() : m_document(Services::WizardDocument::Current())
    {
        InitializeComponent();
        m_initialized = true;
        Refresh();
    }

    void StrategyEditor::OnEditorModeChanged(IInspectable const&, SelectorBarSelectionChangedEventArgs const&)
    {
        int32_t index = 0;
        auto selected = EditorModeSelector().SelectedItem();
        for (uint32_t i = 0; i < EditorModeSelector().Items().Size(); ++i)
        {
            if (EditorModeSelector().Items().GetAt(i) == selected) { index = static_cast<int32_t>(i); break; }
        }
        QuestionEditorPanel().Visibility(index == 0 ? Visibility::Visible : Visibility::Collapsed);
        RuleEditorPanel().Visibility(index == 1 ? Visibility::Visible : Visibility::Collapsed);
    }

    void StrategyEditor::Refresh()
    {
        RebuildQuestionTree(m_questionIndex);
        LoadRules();
    }

    void StrategyEditor::LoadQuestion()
    {
        auto index = m_questionIndex;
        if (index < 0) return;
        auto question = m_document.QuestionAt(static_cast<uint32_t>(index));
        auto strategy = m_document.StrategyAt(static_cast<uint32_t>(index));
        auto number = static_cast<int32_t>(question.GetNamedNumber(L"num", 0));
        QuestionTitle().Text(question.GetNamedString(L"title", L"未命名题目"));
        QuestionMeta().Text(hstring{ L"第 " + std::to_wstring(number) + L" 题 · "
            + std::wstring{ question.GetNamedString(L"provider_type", question.GetNamedString(L"type_code", L"")) }
            + (question.GetNamedBoolean(L"required", false) ? L" · 必答" : L"") });
        m_syncingWeights = true;
        SelectTag(Bias(), strategy.GetNamedString(L"psycho_bias", L"custom"));
        m_syncingWeights = false;
        RebuildWeightEditor(question, strategy);
        AIEnabled().IsOn(strategy.GetNamedBoolean(L"ai_enabled", false));
        FillableOptions().Text(FormatIntList(strategy.GetNamedArray(L"fillable_option_indices", JsonArray{})));
        OptionFillTexts().Text(FormatStrings(strategy.GetNamedArray(L"option_fill_texts", JsonArray{})));
        SelectTag(TextRandomMode(), strategy.GetNamedString(L"text_random_mode", L""));
        auto textRange = strategy.GetNamedArray(L"text_random_int_range", JsonArray{});
        TextRangeMin().Value(textRange.Size() > 0 ? textRange.GetNumberAt(0) : std::numeric_limits<double>::quiet_NaN());
        TextRangeMax().Value(textRange.Size() > 1 ? textRange.GetNumberAt(1) : std::numeric_limits<double>::quiet_NaN());
        LocationParts().Text(FormatStrings(strategy.GetNamedArray(L"location_parts", JsonArray{})));
        MultiTextModes().Text(FormatStrings(strategy.GetNamedArray(L"multi_text_blank_modes", JsonArray{})));
        MultiTextAIFlags().Text(FormatBoolList(strategy.GetNamedArray(L"multi_text_blank_ai_flags", JsonArray{})));
        MultiTextRanges().Text(FormatRanges(strategy.GetNamedArray(L"multi_text_blank_int_ranges", JsonArray{})));
        auto attached = strategy.GetNamedArray(L"attached_option_selects", JsonArray{});
        AttachedOptionSelects().Text(attached.Size() ? attached.Stringify() : L"");
        UpdateTextModeVisibility();
        QuestionStatus().IsOpen(false);
    }

    void StrategyEditor::OnSaveQuestion(IInspectable const&, RoutedEventArgs const&)
    {
        auto index = m_questionIndex;
        if (index < 0) return;
        try
        {
            JsonObject changes;
            changes.SetNamedValue(L"psycho_bias", JsonValue::CreateStringValue(SelectedTag(Bias(), L"custom")));
            changes.SetNamedValue(L"ai_enabled", JsonValue::CreateBooleanValue(AIEnabled().IsOn()));
            auto weights = WeightValues();
            if (weights.Size())
            {
                double total = 0;
                for (auto const& value : weights) total += value.GetNumber();
                if (total <= 0) throw hresult_invalid_argument(L"选项配比不能全为 0。");
                JsonObject table;
                table.SetNamedValue(L"options", weights);
                changes.SetNamedValue(L"custom_weights", table);
                changes.SetNamedValue(L"probabilities", table);
                changes.SetNamedValue(L"distribution_mode", JsonValue::CreateStringValue(L"custom"));
            }
            else changes.SetNamedValue(L"custom_weights", JsonValue::CreateNullValue());
            changes.SetNamedValue(L"fillable_option_indices", ParseIntList(FillableOptions().Text()));
            changes.SetNamedValue(L"option_fill_texts", ParseStrings(OptionFillTexts().Text()));
            auto textMode = SelectedTag(TextRandomMode(), L"");
            changes.SetNamedValue(L"text_random_mode", JsonValue::CreateStringValue(textMode));
            if (textMode == L"integer" && !std::isnan(TextRangeMin().Value()) && !std::isnan(TextRangeMax().Value()))
            {
                JsonArray range;
                range.Append(JsonValue::CreateNumberValue((std::min)(TextRangeMin().Value(), TextRangeMax().Value())));
                range.Append(JsonValue::CreateNumberValue((std::max)(TextRangeMin().Value(), TextRangeMax().Value())));
                changes.SetNamedValue(L"text_random_int_range", range);
            }
            else changes.SetNamedValue(L"text_random_int_range", JsonValue::CreateNullValue());
            changes.SetNamedValue(L"location_parts", ParseStrings(LocationParts().Text()));
            changes.SetNamedValue(L"multi_text_blank_modes", ParseStrings(MultiTextModes().Text()));
            changes.SetNamedValue(L"multi_text_blank_ai_flags", ParseBoolList(MultiTextAIFlags().Text()));
            changes.SetNamedValue(L"multi_text_blank_int_ranges", ParseRanges(MultiTextRanges().Text()));
            changes.SetNamedValue(L"attached_option_selects", AttachedOptionSelects().Text().empty()
                ? JsonArray{} : JsonArray::Parse(AttachedOptionSelects().Text()));
            m_document.UpdateQuestionStrategy(static_cast<uint32_t>(index), changes);

            Refresh();
            QuestionStatus().Severity(InfoBarSeverity::Success);
            QuestionStatus().Title(L"题目设置已保存");
            QuestionStatus().Message(L"");
            QuestionStatus().IsOpen(true);
        }
        catch (hresult_error const& error)
        {
            QuestionStatus().Severity(InfoBarSeverity::Error);
            QuestionStatus().Title(L"题目设置格式错误");
            QuestionStatus().Message(error.message());
            QuestionStatus().IsOpen(true);
        }
    }

    void StrategyEditor::OnTextModeChanged(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (!m_initialized) return;
        UpdateTextModeVisibility();
    }

    void StrategyEditor::UpdateTextModeVisibility()
    {
        TextRangeRow().Visibility(SelectedTag(TextRandomMode(), L"") == L"integer"
            ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
    }

    void StrategyEditor::LoadRules()
    {
        RuleList().Items().Clear();
        auto rules = m_document.Rules();
        for (auto const& value : rules)
        {
            auto rule = value.GetObject();
            auto condition = static_cast<int32_t>(rule.GetNamedNumber(L"condition_question_num", 0));
            auto target = static_cast<int32_t>(rule.GetNamedNumber(L"target_question_num", 0));
            auto mode = rule.GetNamedString(L"condition_mode", L"selected") == L"not_selected" ? L"未选中" : L"已选中";
            auto action = rule.GetNamedString(L"action_mode", L"must_select") == L"must_not_select" ? L"不得选择" : L"必须选择";
            RuleList().Items().Append(box_value(hstring{ L"第 " + std::to_wstring(condition) + L" 题 " + mode
                + L" → 第 " + std::to_wstring(target) + L" 题 " + action }));
        }
        if (rules.Size()) RuleList().SelectedIndex((std::min)(m_ruleIndex < 0 ? 0 : m_ruleIndex, static_cast<int32_t>(rules.Size() - 1)));
        else OnNewRule(nullptr, nullptr);
    }

    void StrategyEditor::OnRuleSelected(IInspectable const&, SelectionChangedEventArgs const&)
    {
        m_ruleIndex = RuleList().SelectedIndex();
        LoadRule();
    }

    void StrategyEditor::LoadRule()
    {
        auto rules = m_document.Rules();
        if (m_ruleIndex < 0 || static_cast<uint32_t>(m_ruleIndex) >= rules.Size()) return;
        auto rule = rules.GetObjectAt(static_cast<uint32_t>(m_ruleIndex));
        ConditionQuestion().Value(rule.GetNamedNumber(L"condition_question_num", 1));
        SelectTag(ConditionMode(), rule.GetNamedString(L"condition_mode", L"selected"));
        ConditionOptions().Text(FormatIntList(rule.GetNamedArray(L"condition_option_indices", JsonArray{})));
        auto conditionRow = rule.GetNamedValue(L"condition_row_index", nullptr);
        ConditionRow().Text(conditionRow && conditionRow.ValueType() == JsonValueType::Number
            ? hstring{ std::to_wstring(static_cast<int32_t>(conditionRow.GetNumber()) + 1) } : L"");
        TargetQuestion().Value(rule.GetNamedNumber(L"target_question_num", 1));
        SelectTag(ActionMode(), rule.GetNamedString(L"action_mode", L"must_select"));
        TargetOptions().Text(FormatIntList(rule.GetNamedArray(L"target_option_indices", JsonArray{})));
        auto targetRow = rule.GetNamedValue(L"target_row_index", nullptr);
        TargetRow().Text(targetRow && targetRow.ValueType() == JsonValueType::Number
            ? hstring{ std::to_wstring(static_cast<int32_t>(targetRow.GetNumber()) + 1) } : L"");
        RuleStatus().IsOpen(false);
    }

    void StrategyEditor::OnNewRule(IInspectable const&, RoutedEventArgs const&)
    {
        m_ruleIndex = -1;
        RuleList().SelectedIndex(-1);
        ConditionQuestion().Value(1);
        SelectTag(ConditionMode(), L"selected");
        ConditionOptions().Text(L"1");
        ConditionRow().Text(L"");
        TargetQuestion().Value(m_document.QuestionCount() > 1 ? 2 : 1);
        SelectTag(ActionMode(), L"must_select");
        TargetOptions().Text(L"1");
        TargetRow().Text(L"");
        RuleStatus().IsOpen(false);
    }

    void StrategyEditor::OnDeleteRule(IInspectable const&, RoutedEventArgs const&)
    {
        if (m_ruleIndex < 0) return;
        m_document.DeleteRule(static_cast<uint32_t>(m_ruleIndex));
        m_ruleIndex = -1;
        LoadRules();
    }

    void StrategyEditor::OnSaveRule(IInspectable const&, RoutedEventArgs const&)
    {
        if (std::isnan(ConditionQuestion().Value()) || std::isnan(TargetQuestion().Value())) return;
        auto conditions = ParseIntList(ConditionOptions().Text());
        auto targets = ParseIntList(TargetOptions().Text());
        if (!conditions.Size() || !targets.Size())
        {
            RuleStatus().Severity(InfoBarSeverity::Error);
            RuleStatus().Title(L"条件和目标至少选择一个选项");
            RuleStatus().IsOpen(true);
            return;
        }
        JsonObject rule;
        auto existing = m_ruleIndex >= 0 && static_cast<uint32_t>(m_ruleIndex) < m_document.Rules().Size()
            ? m_document.Rules().GetObjectAt(static_cast<uint32_t>(m_ruleIndex)) : JsonObject{};
        if (existing.HasKey(L"id")) rule.SetNamedValue(L"id", existing.GetNamedValue(L"id"));
        rule.SetNamedValue(L"condition_question_num", JsonValue::CreateNumberValue(ConditionQuestion().Value()));
        rule.SetNamedValue(L"condition_mode", JsonValue::CreateStringValue(SelectedTag(ConditionMode(), L"selected")));
        rule.SetNamedValue(L"condition_option_indices", conditions);
        if (auto row = OptionalOneBasedIndex(ConditionRow().Text())) rule.SetNamedValue(L"condition_row_index", JsonValue::CreateNumberValue(*row));
        rule.SetNamedValue(L"target_question_num", JsonValue::CreateNumberValue(TargetQuestion().Value()));
        rule.SetNamedValue(L"action_mode", JsonValue::CreateStringValue(SelectedTag(ActionMode(), L"must_select")));
        rule.SetNamedValue(L"target_option_indices", targets);
        if (auto row = OptionalOneBasedIndex(TargetRow().Text())) rule.SetNamedValue(L"target_row_index", JsonValue::CreateNumberValue(*row));
        m_document.SetRule(m_ruleIndex, rule);
        LoadRules();
        RuleStatus().Severity(InfoBarSeverity::Success);
        RuleStatus().Title(L"条件规则已保存");
        RuleStatus().Message(L"");
        RuleStatus().IsOpen(true);
    }

    hstring StrategyEditor::SelectedTag(ComboBox const& combo, hstring const& fallback) const
    {
        auto item = combo.SelectedItem().try_as<ComboBoxItem>();
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
}
