#include "pch.h"
#include "StrategyEditor.xaml.h"

#include <algorithm>
#include <map>
#include <unordered_map>
#include <cwctype>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        using namespace Microsoft::UI::Xaml::Controls;
        using namespace Windows::Data::Json;

        hstring ShortTitle(hstring const& value)
        {
            std::wstring title{ value.empty() ? L"未命名题目" : value.c_str() };
            constexpr size_t limit = 24;
            if (title.size() > limit) title = title.substr(0, limit - 1) + L"…";
            return hstring{ title };
        }

        hstring OptionLabel(JsonObject const& question, JsonArray const& indices)
        {
            auto optionTexts = question.GetNamedArray(L"option_texts", JsonArray{});
            std::wstring result;
            uint32_t count = 0;
            for (auto const& value : indices)
            {
                if (value.ValueType() != JsonValueType::Number) continue;
                auto index = static_cast<int32_t>(value.GetNumber());
                if (index < 0) continue;
                if (count++) result += L"、";
                if (static_cast<uint32_t>(index) < optionTexts.Size())
                {
                    auto text = ShortTitle(optionTexts.GetStringAt(static_cast<uint32_t>(index)));
                    result += L"“" + std::wstring{ text } + L"”";
                }
                else
                {
                    result += L"第 " + std::to_wstring(index + 1) + L" 项";
                }
                if (count == 3 && indices.Size() > 3)
                {
                    result += L"等" + std::to_wstring(indices.Size()) + L"项";
                    break;
                }
            }
            return result.empty() ? hstring{ L"指定选项" } : hstring{ result };
        }

        int32_t PageNumber(JsonObject const& question)
        {
            return (std::max)(1, static_cast<int32_t>(question.GetNamedNumber(L"page", 1)));
        }

        bool ContainsText(JsonObject const& question, hstring const& query, int32_t number)
        {
            std::wstring needle{ query };
            std::transform(needle.begin(), needle.end(), needle.begin(), ::towlower);
            if (needle.empty()) return true;
            std::wstring haystack = std::to_wstring(number) + L" " + std::wstring{ question.GetNamedString(L"title", L"") };
            auto options = question.GetNamedArray(L"option_texts", JsonArray{});
            for (auto const& value : options)
            {
                if (value.ValueType() == JsonValueType::String) haystack += L" " + std::wstring{ value.GetString() };
            }
            std::transform(haystack.begin(), haystack.end(), haystack.begin(), ::towlower);
            return haystack.find(needle) != std::wstring::npos;
        }
    }

    void StrategyEditor::RebuildQuestionTree(int32_t selectedIndex)
    {
        auto tree = QuestionTree();
        tree.RootNodes().Clear();
        m_questionNodes.clear();
        m_treeTargets.clear();

        auto questions = m_document.Questions();
        m_questionNodes.resize(questions.size());
        if (questions.empty())
        {
            m_questionIndex = -1;
            return;
        }

        bool hasUnknownLogic = false;
        int32_t maxQuestionNumber = 0;
        std::unordered_map<int32_t, int32_t> questionIndices;
        for (uint32_t index = 0; index < questions.size(); ++index)
        {
            auto question = m_document.QuestionAt(index);
            auto status = question.GetNamedString(L"logic_parse_status", L"");
            std::wstring normalized{ status };
            std::transform(normalized.begin(), normalized.end(), normalized.begin(), ::towlower);
            hasUnknownLogic = hasUnknownLogic || normalized == L"unknown";
            maxQuestionNumber = (std::max)(maxQuestionNumber, questions[index].number);
            questionIndices.try_emplace(questions[index].number, static_cast<int32_t>(index));
        }

        std::map<int32_t, TreeViewNode> pages;
        auto pageNode = [&](int32_t page)
        {
            auto found = pages.find(page);
            if (found != pages.end()) return found->second;
            TreeViewNode node;
            node.Content(box_value(hstring{ L"第 " + std::to_wstring(page) + L" 页" }));
            node.IsExpanded(true);
            tree.RootNodes().Append(node);
            pages.emplace(page, node);
            return node;
        };

        auto appendRelation = [&](TreeViewNode const& parent, hstring const& label, int32_t targetIndex)
        {
            TreeViewNode node;
            node.Content(box_value(label));
            parent.Children().Append(node);
            m_treeTargets.emplace_back(node, targetIndex);
        };

        for (uint32_t index = 0; index < questions.size(); ++index)
        {
            auto const& summary = questions[index];
            auto question = m_document.QuestionAt(index);
            if (!ContainsText(question, m_questionSearch, summary.number)) continue;
            auto parent = pageNode(PageNumber(question));

            TreeViewNode node;
            std::wstring label = std::to_wstring(summary.number) + L". [" + std::wstring{ summary.type }
                + L"] " + std::wstring{ ShortTitle(summary.title) };
            node.Content(box_value(hstring{ label }));
            parent.Children().Append(node);
            m_questionNodes[index] = node;
            m_treeTargets.emplace_back(node, static_cast<int32_t>(index));

            if (hasUnknownLogic) continue;

            auto displayTargets = question.GetNamedArray(L"controls_display_targets", JsonArray{});
            for (auto const& value : displayTargets)
            {
                if (value.ValueType() != JsonValueType::Object) continue;
                auto target = value.GetObject();
                auto targetNumber = static_cast<int32_t>(target.GetNamedNumber(L"target_question_num", 0));
                if (targetNumber <= 0) continue;
                auto targetIndex = questionIndices.contains(targetNumber)
                    ? questionIndices.at(targetNumber) : static_cast<int32_t>(index);
                auto options = target.GetNamedArray(L"condition_option_indices", JsonArray{});
                appendRelation(node, hstring{ L"条件 · 选中" + std::wstring{ OptionLabel(question, options) }
                    + L" → 显示第 " + std::to_wstring(targetNumber) + L" 题" }, targetIndex);
            }

            auto jumpRules = question.GetNamedArray(L"jump_rules", JsonArray{});
            for (auto const& value : jumpRules)
            {
                if (value.ValueType() != JsonValueType::Object) continue;
                auto rule = value.GetObject();
                auto targetNumber = static_cast<int32_t>(rule.GetNamedNumber(L"jumpto", 0));
                if (targetNumber <= 0) continue;
                JsonArray optionIndex;
                optionIndex.Append(JsonValue::CreateNumberValue(rule.GetNamedNumber(L"option_index", -1)));
                auto endsSurvey = rule.GetNamedBoolean(L"terminates_survey", false) || targetNumber > maxQuestionNumber;
                auto targetIndex = !endsSurvey && questionIndices.contains(targetNumber)
                    ? questionIndices.at(targetNumber) : static_cast<int32_t>(index);
                auto targetLabel = endsSurvey
                    ? std::wstring{ L"结束" }
                    : L"第 " + std::to_wstring(targetNumber) + L" 题";
                appendRelation(node, hstring{ L"跳题 · 选中" + std::wstring{ OptionLabel(question, optionIndex) }
                    + L" → " + targetLabel }, targetIndex);
            }
            node.IsExpanded(node.Children().Size() > 0);
        }

        if (tree.RootNodes().Size() == 0)
        {
            m_questionIndex = -1;
            QuestionTitle().Text(L"没有匹配的题目");
            QuestionMeta().Text(L"清空搜索框后显示全部题目");
            QuestionCountSummary().Text(L"0 / " + std::to_wstring(questions.size()) + L" 题");
            QuestionProgress().Value(0);
            return;
        }
        auto validIndex = selectedIndex >= 0 && selectedIndex < static_cast<int32_t>(questions.size())
            && m_questionNodes[static_cast<size_t>(selectedIndex)]
            ? selectedIndex : -1;
        if (validIndex < 0)
        {
            for (size_t index = 0; index < m_questionNodes.size(); ++index)
            {
                if (m_questionNodes[index]) { validIndex = static_cast<int32_t>(index); break; }
            }
        }
        SelectQuestion(validIndex);
    }

    void StrategyEditor::SelectQuestion(int32_t index)
    {
        if (index < 0 || index >= static_cast<int32_t>(m_questionNodes.size())) return;
        if (!m_questionNodes[static_cast<size_t>(index)]) return;
        m_questionIndex = index;
        auto total = static_cast<double>(m_document.Questions().size());
        QuestionProgress().Maximum(total > 0 ? total : 1);
        QuestionProgress().Value(static_cast<double>(index + 1));
        QuestionCountSummary().Text(hstring{ L"第 " + std::to_wstring(index + 1) + L" / " + std::to_wstring(static_cast<int32_t>(total)) + L" 题 · 可搜索题号、题干和选项" });
        auto node = m_questionNodes[static_cast<size_t>(index)];
        if (QuestionTree().SelectedNode() != node)
        {
            m_syncingTreeSelection = true;
            QuestionTree().SelectedNode(node);
            m_syncingTreeSelection = false;
        }
        LoadQuestion();
    }

    void StrategyEditor::OnQuestionSearchChanged(IInspectable const&, TextChangedEventArgs const& args)
    {
        (void)args;
        m_questionSearch = QuestionSearch().Text();
        RebuildQuestionTree(m_questionIndex);
    }

    void StrategyEditor::OnQuestionSelected(IInspectable const&, TreeViewSelectionChangedEventArgs const&)
    {
        if (m_syncingTreeSelection) return;
        auto node = QuestionTree().SelectedNode();
        if (!node) return;
        for (auto const& [candidate, targetIndex] : m_treeTargets)
        {
            if (candidate == node)
            {
                m_questionIndex = targetIndex;
                LoadQuestion();
                return;
            }
        }
    }

    void StrategyEditor::OnQuestionInvoked(IInspectable const&, TreeViewItemInvokedEventArgs const& args)
    {
        auto node = args.InvokedItem().try_as<TreeViewNode>();
        if (!node) return;
        for (auto const& [candidate, targetIndex] : m_treeTargets)
        {
            if (candidate == node)
            {
                auto lifetime = get_strong();
                DispatcherQueue().TryEnqueue([lifetime, targetIndex]()
                {
                    lifetime->SelectQuestion(targetIndex);
                });
                return;
            }
        }
    }
}
