#include "pch.h"
#include "RuleEditor.xaml.h"

#if __has_include("RuleEditor.g.cpp")
#include "RuleEditor.g.cpp"
#endif

#include <algorithm>

namespace winrt::SurveyController::App::implementation
{
    using namespace Microsoft::UI::Xaml;
    using namespace Microsoft::UI::Xaml::Controls;
    using namespace Windows::Data::Json;

    namespace
    {
        struct UpdatingGuard
        {
            bool& value;
            ~UpdatingGuard() { value = false; }
        };

        int32_t ParseQuestionNumber(hstring const& label)
        {
            std::wstring text{ label };
            auto first = text.find_first_of(L"0123456789");
            if (first == std::wstring::npos) return 0;
            try { return std::stoi(text.substr(first)); }
            catch (...) { return 0; }
        }

        hstring RuleLabel(JsonObject const& rule, uint32_t index)
        {
            auto condition = static_cast<int32_t>(rule.GetNamedNumber(L"condition_question_num", 0));
            auto target = static_cast<int32_t>(rule.GetNamedNumber(L"target_question_num", 0));
            auto mode = rule.GetNamedString(L"condition_mode", L"selected") == L"not_selected" ? L"未选中" : L"已选中";
            auto action = rule.GetNamedString(L"action_mode", L"must_select") == L"must_not_select" ? L"不得选择" : L"必须选择";
            return hstring{ std::to_wstring(index + 1) + L". 第 " + std::to_wstring(condition) + L" 题" + mode +
                L" → 第 " + std::to_wstring(target) + L" 题" + action };
        }

        bool IsRuleQuestion(Services::WizardQuestion const& question)
        {
            auto const& type = question.normalizedType;
            return !question.unsupported && question.options > 0 &&
                (type == L"single" || type == L"multiple" || type == L"dropdown" || type == L"scale" ||
                    type == L"matrix" || type == L"slider" || type == L"sort");
        }

        hstring QuestionLabel(Services::WizardQuestion const& question)
        {
            return hstring{ L"第 " + std::to_wstring(question.number) + L" 题 · " + std::wstring{ question.type }
                + L" · " + std::wstring{ question.title } };
        }
    }

    RuleEditor::RuleEditor() : m_document(Services::WizardDocument::Current())
    {
        InitializeComponent();
    }

    void RuleEditor::OnLoaded(IInspectable const&, RoutedEventArgs const&)
    {
        m_isLoaded = true;
        try
        {
            if (m_refreshPending || RuleList().Items().Size() == 0) Refresh();
        }
        catch (hresult_error const& error)
        {
            RuleStatus().Severity(InfoBarSeverity::Error);
            RuleStatus().Title(L"条件规则加载失败");
            RuleStatus().Message(error.message());
            RuleStatus().IsOpen(true);
        }
        catch (...)
        {
            RuleStatus().Severity(InfoBarSeverity::Error);
            RuleStatus().Title(L"条件规则加载失败");
            RuleStatus().Message(L"无法加载条件规则。");
            RuleStatus().IsOpen(true);
        }
    }

    void RuleEditor::Refresh()
    {
        if (!m_isLoaded)
        {
            m_refreshPending = true;
            return;
        }
        if (m_updating)
        {
            m_refreshPending = true;
            return;
        }

        m_updating = true;
        m_refreshPending = false;
        UpdatingGuard finish{ m_updating };
        RuleList().Items().Clear();
        auto rules = m_document.Rules();
        for (uint32_t index = 0; index < rules.Size(); ++index)
        {
            RuleList().Items().Append(box_value(RuleLabel(rules.GetObjectAt(index), index)));
        }
        if (rules.Size() == 0) ClearRuleForm();
        else
        {
            m_ruleIndex = std::clamp(m_ruleIndex < 0 ? 0 : m_ruleIndex, 0, static_cast<int32_t>(rules.Size() - 1));
            RuleList().SelectedIndex(m_ruleIndex);
            LoadRule();
        }
        UpdateCommandState();
    }

    void RuleEditor::OnRuleSelected(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (m_updating) return;
        m_ruleIndex = RuleList().SelectedIndex();
        LoadRule();
        UpdateCommandState();
    }

    void RuleEditor::OnNewRule(IInspectable const&, RoutedEventArgs const&)
    {
        if (m_updating) return;
        m_updating = true;
        UpdatingGuard finish{ m_updating };
        ClearRuleForm();
    }

    void RuleEditor::ClearRuleForm()
    {
        m_ruleIndex = -1;
        RuleList().SelectedIndex(-1);
        m_conditionNumber = 0;
        m_targetNumber = 0;
        ConditionQuestion().Text(L"");
        TargetQuestion().Text(L"");
        ConditionOptions().Items().Clear();
        TargetOptions().Items().Clear();
        ConditionRow().Visibility(Visibility::Collapsed);
        TargetRow().Visibility(Visibility::Collapsed);
        ConditionMode().SelectedIndex(0);
        ActionMode().SelectedIndex(0);
        RuleStatus().IsOpen(false);
        UpdateCommandState();
    }

    void RuleEditor::OnDeleteRule(IInspectable const&, RoutedEventArgs const&)
    {
        if (!m_isLoaded || m_updating || m_ruleIndex < 0) return;
        m_document.DeleteRule(static_cast<uint32_t>(m_ruleIndex));
        m_ruleIndex = (std::max)(0, m_ruleIndex - 1);
        Refresh();
    }

    void RuleEditor::OnMoveRuleUp(IInspectable const&, RoutedEventArgs const&)
    {
        if (!m_isLoaded || m_updating) return;
        if (m_ruleIndex > 0 && m_document.MoveRuleUp(static_cast<uint32_t>(m_ruleIndex))) --m_ruleIndex;
        Refresh();
    }

    void RuleEditor::OnMoveRuleDown(IInspectable const&, RoutedEventArgs const&)
    {
        if (!m_isLoaded || m_updating) return;
        if (m_ruleIndex >= 0 && m_document.MoveRuleDown(static_cast<uint32_t>(m_ruleIndex))) ++m_ruleIndex;
        Refresh();
    }

    void RuleEditor::UpdateCommandState()
    {
        auto count = static_cast<int32_t>(m_document.Rules().Size());
        auto selected = m_ruleIndex >= 0 && m_ruleIndex < count;
        DeleteRuleButton().IsEnabled(selected);
        MoveRuleUpButton().IsEnabled(selected && m_ruleIndex > 0);
        MoveRuleDownButton().IsEnabled(selected && m_ruleIndex + 1 < count);
    }

    void RuleEditor::LoadQuestionPicker(AutoSuggestBox const& box, bool target)
    {
        auto suggestions = winrt::single_threaded_observable_vector<IInspectable>();
        std::wstring needle{ box.Text() };
        std::transform(needle.begin(), needle.end(), needle.begin(), ::towlower);
        for (auto const& question : m_document.Questions())
        {
            if (!IsRuleQuestion(question)) continue;
            if (target && m_conditionNumber > 0 && question.number <= m_conditionNumber) continue;
            std::wstring label{ QuestionLabel(question) };
            std::wstring haystack{ label };
            std::transform(haystack.begin(), haystack.end(), haystack.begin(), ::towlower);
            if (needle.empty() || haystack.find(needle) != std::wstring::npos) suggestions.Append(box_value(hstring{ label }));
            if (suggestions.Size() >= 20) break;
        }
        box.ItemsSource(suggestions);
    }

    void RuleEditor::OnConditionQuestionTextChanged(IInspectable const&, AutoSuggestBoxTextChangedEventArgs const& args)
    {
        if (args.Reason() == AutoSuggestionBoxTextChangeReason::UserInput) LoadQuestionPicker(ConditionQuestion(), false);
    }

    void RuleEditor::OnTargetQuestionTextChanged(IInspectable const&, AutoSuggestBoxTextChangedEventArgs const& args)
    {
        if (args.Reason() == AutoSuggestionBoxTextChangeReason::UserInput) LoadQuestionPicker(TargetQuestion(), true);
    }

    void RuleEditor::OnConditionQuestionChosen(IInspectable const&, AutoSuggestBoxSuggestionChosenEventArgs const& args)
    {
        auto label = unbox_value_or<hstring>(args.SelectedItem(), L"");
        if (SelectQuestion(ParseQuestionNumber(label), false)) ConditionQuestion().Text(label);
    }

    void RuleEditor::OnTargetQuestionChosen(IInspectable const&, AutoSuggestBoxSuggestionChosenEventArgs const& args)
    {
        auto label = unbox_value_or<hstring>(args.SelectedItem(), L"");
        if (SelectQuestion(ParseQuestionNumber(label), true)) TargetQuestion().Text(label);
    }

    void RuleEditor::OnConditionQuestionSubmitted(IInspectable const&, AutoSuggestBoxQuerySubmittedEventArgs const& args)
    {
        SubmitQuestionQuery(ConditionQuestion(), args, false);
    }

    void RuleEditor::OnTargetQuestionSubmitted(IInspectable const&, AutoSuggestBoxQuerySubmittedEventArgs const& args)
    {
        SubmitQuestionQuery(TargetQuestion(), args, true);
    }

    void RuleEditor::SubmitQuestionQuery(AutoSuggestBox const& box,
        AutoSuggestBoxQuerySubmittedEventArgs const& args, bool target)
    {
        auto text = args.ChosenSuggestion() ? unbox_value_or<hstring>(args.ChosenSuggestion(), L"") : args.QueryText();
        auto number = ParseQuestionNumber(text);
        if (number > 0 && SelectQuestion(number, target))
        {
            for (auto const& question : m_document.Questions())
            {
                if (question.number == number) { box.Text(QuestionLabel(question)); return; }
            }
        }

        std::wstring needle{ text };
        std::transform(needle.begin(), needle.end(), needle.begin(), ::towlower);
        for (auto const& question : m_document.Questions())
        {
            if (!IsRuleQuestion(question) || (target && m_conditionNumber > 0 && question.number <= m_conditionNumber)) continue;
            auto label = QuestionLabel(question);
            std::wstring haystack{ label };
            std::transform(haystack.begin(), haystack.end(), haystack.begin(), ::towlower);
            if (haystack.find(needle) != std::wstring::npos && SelectQuestion(question.number, target))
            {
                box.Text(label);
                return;
            }
        }
    }

    bool RuleEditor::SelectQuestion(int32_t number, bool target)
    {
        if (!m_isLoaded) return false;
        auto options = target ? TargetOptions() : ConditionOptions();
        auto rows = target ? TargetRow() : ConditionRow();
        options.SelectedItems().Clear();
        options.Items().Clear();
        rows.SelectedIndex(-1);
        rows.Items().Clear();
        for (auto const& question : m_document.Questions())
        {
            if (question.number != number) continue;
            if (!IsRuleQuestion(question) || (target && m_conditionNumber > 0 && question.number <= m_conditionNumber)) return false;
            auto& selectedNumber = target ? m_targetNumber : m_conditionNumber;
            selectedNumber = number;
            for (int32_t index = 0; index < question.options; ++index)
            {
                auto label = static_cast<size_t>(index) < question.optionTexts.size() && !question.optionTexts[static_cast<size_t>(index)].empty()
                    ? question.optionTexts[static_cast<size_t>(index)]
                    : hstring{ L"选项 " + std::to_wstring(index + 1) };
                options.Items().Append(box_value(hstring{ std::to_wstring(index + 1) + L". " + std::wstring{ label } }));
            }
            for (int32_t index = 0; index < question.rows; ++index)
            {
                auto item = ComboBoxItem{};
                auto label = static_cast<size_t>(index) < question.rowTexts.size() && !question.rowTexts[static_cast<size_t>(index)].empty()
                    ? question.rowTexts[static_cast<size_t>(index)]
                    : hstring{ L"矩阵行 " + std::to_wstring(index + 1) };
                item.Content(box_value(hstring{ std::to_wstring(index + 1) + L". " + std::wstring{ label } }));
                item.Tag(box_value(index));
                rows.Items().Append(item);
            }
            rows.Visibility(question.normalizedType == L"matrix" && question.rows > 0
                ? Visibility::Visible : Visibility::Collapsed);
            if (rows.Items().Size()) rows.SelectedIndex(0);
            if (!target && m_targetNumber > 0 && m_targetNumber <= m_conditionNumber)
            {
                m_targetNumber = 0;
                TargetQuestion().Text(L"");
                TargetOptions().SelectedItems().Clear();
                TargetOptions().Items().Clear();
                TargetRow().Items().Clear();
                TargetRow().Visibility(Visibility::Collapsed);
            }
            return true;
        }
        return false;
    }

    JsonArray RuleEditor::SelectedIndices(ListView const& list) const
    {
        JsonArray result;
        for (auto const& selected : list.SelectedItems())
        {
            uint32_t index{};
            if (list.Items().IndexOf(selected, index)) result.Append(JsonValue::CreateNumberValue(index));
        }
        return result;
    }

    hstring RuleEditor::SelectedTag(RadioButtons const& buttons, hstring const& fallback) const
    {
        auto item = buttons.SelectedItem().try_as<RadioButton>();
        return item ? unbox_value_or<hstring>(item.Tag(), fallback) : fallback;
    }

    void RuleEditor::SelectTag(RadioButtons const& buttons, hstring const& value)
    {
        for (uint32_t index = 0; index < buttons.Items().Size(); ++index)
        {
            auto item = buttons.Items().GetAt(index).try_as<RadioButton>();
            if (item && unbox_value_or<hstring>(item.Tag(), L"") == value) { buttons.SelectedIndex(static_cast<int32_t>(index)); return; }
        }
        buttons.SelectedIndex(0);
    }

    void RuleEditor::LoadRule()
    {
        auto rules = m_document.Rules();
        if (m_ruleIndex < 0 || static_cast<uint32_t>(m_ruleIndex) >= rules.Size()) return;
        auto rule = rules.GetObjectAt(static_cast<uint32_t>(m_ruleIndex));
        auto conditionNumber = static_cast<int32_t>(rule.GetNamedNumber(L"condition_question_num", 0));
        auto targetNumber = static_cast<int32_t>(rule.GetNamedNumber(L"target_question_num", 0));
        m_conditionNumber = 0;
        m_targetNumber = 0;
        SelectQuestion(conditionNumber, false);
        SelectQuestion(targetNumber, true);
        ConditionQuestion().Text(hstring{ L"第 " + std::to_wstring(m_conditionNumber) + L" 题" });
        TargetQuestion().Text(hstring{ L"第 " + std::to_wstring(m_targetNumber) + L" 题" });
        SelectTag(ConditionMode(), rule.GetNamedString(L"condition_mode", L"selected"));
        SelectTag(ActionMode(), rule.GetNamedString(L"action_mode", L"must_select"));
        for (auto const& value : rule.GetNamedArray(L"condition_option_indices", JsonArray{}))
        {
            auto index = static_cast<int32_t>(value.GetNumber());
            if (index >= 0 && static_cast<uint32_t>(index) < ConditionOptions().Items().Size()) ConditionOptions().SelectedItems().Append(ConditionOptions().Items().GetAt(static_cast<uint32_t>(index)));
        }
        for (auto const& value : rule.GetNamedArray(L"target_option_indices", JsonArray{}))
        {
            auto index = static_cast<int32_t>(value.GetNumber());
            if (index >= 0 && static_cast<uint32_t>(index) < TargetOptions().Items().Size()) TargetOptions().SelectedItems().Append(TargetOptions().Items().GetAt(static_cast<uint32_t>(index)));
        }
        auto conditionRow = rule.GetNamedValue(L"condition_row_index", nullptr);
        auto targetRow = rule.GetNamedValue(L"target_row_index", nullptr);
        if (conditionRow && conditionRow.ValueType() == JsonValueType::Number) ConditionRow().SelectedIndex(static_cast<int32_t>(conditionRow.GetNumber()));
        if (targetRow && targetRow.ValueType() == JsonValueType::Number) TargetRow().SelectedIndex(static_cast<int32_t>(targetRow.GetNumber()));
        RuleStatus().IsOpen(false);
        UpdateCommandState();
    }

    void RuleEditor::OnSaveRule(IInspectable const&, RoutedEventArgs const&)
    {
        JsonObject rule;
        auto existing = m_ruleIndex >= 0 && static_cast<uint32_t>(m_ruleIndex) < m_document.Rules().Size()
            ? m_document.Rules().GetObjectAt(static_cast<uint32_t>(m_ruleIndex)) : JsonObject{};
        if (existing.HasKey(L"id")) rule.SetNamedValue(L"id", existing.GetNamedValue(L"id"));
        rule.SetNamedValue(L"condition_question_num", JsonValue::CreateNumberValue(m_conditionNumber));
        rule.SetNamedValue(L"condition_mode", JsonValue::CreateStringValue(SelectedTag(ConditionMode(), L"selected")));
        rule.SetNamedValue(L"condition_option_indices", SelectedIndices(ConditionOptions()));
        if (ConditionRow().Visibility() == Visibility::Visible && ConditionRow().SelectedIndex() >= 0) rule.SetNamedValue(L"condition_row_index", JsonValue::CreateNumberValue(ConditionRow().SelectedIndex()));
        rule.SetNamedValue(L"target_question_num", JsonValue::CreateNumberValue(m_targetNumber));
        rule.SetNamedValue(L"action_mode", JsonValue::CreateStringValue(SelectedTag(ActionMode(), L"must_select")));
        rule.SetNamedValue(L"target_option_indices", SelectedIndices(TargetOptions()));
        if (TargetRow().Visibility() == Visibility::Visible && TargetRow().SelectedIndex() >= 0) rule.SetNamedValue(L"target_row_index", JsonValue::CreateNumberValue(TargetRow().SelectedIndex()));
        auto validation = m_document.ValidateRule(rule);
        if (!validation.empty())
        {
            RuleStatus().Severity(InfoBarSeverity::Error);
            RuleStatus().Title(L"规则无法保存");
            RuleStatus().Message(validation);
            RuleStatus().IsOpen(true);
            return;
        }
        m_document.SetRule(m_ruleIndex, rule);
        if (m_ruleIndex < 0) m_ruleIndex = static_cast<int32_t>(m_document.Rules().Size() - 1);
        Refresh();
        RuleStatus().Severity(InfoBarSeverity::Success);
        RuleStatus().Title(L"规则已保存");
        RuleStatus().Message(L"");
        RuleStatus().IsOpen(true);
    }
}
