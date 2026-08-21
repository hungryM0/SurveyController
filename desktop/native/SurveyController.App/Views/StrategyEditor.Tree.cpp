#include "pch.h"
#include "StrategyEditor.xaml.h"
#include "Services/JsonHelpers.h"

#include <algorithm>
#include <map>
#include <unordered_map>
#include <cwctype>
#include <tuple>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        using namespace Microsoft::UI::Xaml;
        using namespace Microsoft::UI::Xaml::Controls;
        using namespace Microsoft::UI::Xaml::Media;
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
            auto optionTexts = Services::GetJsonArray(question, L"option_texts");
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
            auto options = Services::GetJsonArray(question, L"option_texts");
            for (auto const& value : options)
            {
                if (value.ValueType() == JsonValueType::String) haystack += L" " + std::wstring{ value.GetString() };
            }
            std::transform(haystack.begin(), haystack.end(), haystack.begin(), ::towlower);
            return haystack.find(needle) != std::wstring::npos;
        }

        std::tuple<wchar_t const*, wchar_t const*, wchar_t const*> QuestionBrushKeys(hstring const& type)
        {
            if (type == L"single" || type == L"multiple" || type == L"dropdown") return { L"QuestionChoiceBrush", L"QuestionChoiceBadgeForegroundBrush", L"QuestionChoiceBadgeBackgroundBrush" };
            if (type == L"text" || type == L"multi_text" || type == L"location") return { L"QuestionTextBrush", L"QuestionTextBadgeForegroundBrush", L"QuestionTextBadgeBackgroundBrush" };
            if (type == L"scale" || type == L"slider") return { L"QuestionScaleBrush", L"QuestionScaleBadgeForegroundBrush", L"QuestionScaleBadgeBackgroundBrush" };
            if (type == L"matrix") return { L"QuestionMatrixBrush", L"QuestionMatrixBadgeForegroundBrush", L"QuestionMatrixBadgeBackgroundBrush" };
            if (type == L"sort") return { L"QuestionSortBrush", L"QuestionSortBadgeForegroundBrush", L"QuestionSortBadgeBackgroundBrush" };
            return { L"QuestionUnknownBrush", L"QuestionUnknownBadgeForegroundBrush", L"QuestionUnknownBadgeBackgroundBrush" };
        }

        UIElement QuestionNodeContent(Services::WizardQuestion const& question)
        {
            auto [foregroundKey, badgeForegroundKey, backgroundKey] = QuestionBrushKeys(question.normalizedType);
            auto resources = Application::Current().Resources();
            auto foreground = resources.Lookup(box_value(foregroundKey)).as<Brush>();
            auto badgeForeground = resources.Lookup(box_value(badgeForegroundKey)).as<Brush>();
            auto row = StackPanel{};
            row.Orientation(Orientation::Horizontal);
            row.Spacing(7);
            auto icon = FontIcon{};
            icon.Glyph(question.icon);
            icon.FontSize(14);
            icon.Foreground(foreground);
            auto badge = InfoBadge{};
            badge.Width(8);
            badge.Height(8);
            badge.VerticalAlignment(VerticalAlignment::Center);
            badge.Background(resources.Lookup(box_value(backgroundKey)).as<Brush>());
            auto type = TextBlock{};
            type.Text(question.type);
            type.FontSize(12);
            type.FontWeight(Windows::UI::Text::FontWeights::SemiBold());
            type.Foreground(badgeForeground);
            auto title = TextBlock{};
            title.Text(hstring{ std::to_wstring(question.number) + L". " + std::wstring{ ShortTitle(question.title) } });
            title.TextTrimming(TextTrimming::CharacterEllipsis);
            row.Children().Append(icon);
            row.Children().Append(badge);
            row.Children().Append(type);
            row.Children().Append(title);
            auto appendStatus = [&](wchar_t const* label, wchar_t const* brushKey)
            {
                auto status = StackPanel{};
                status.Orientation(Orientation::Horizontal);
                status.Spacing(5);
                auto dot = InfoBadge{};
                dot.Width(8);
                dot.Height(8);
                dot.VerticalAlignment(VerticalAlignment::Center);
                auto color = resources.Lookup(box_value(brushKey)).as<Brush>();
                dot.Background(color);
                auto text = TextBlock{};
                text.Text(label);
                text.Style(resources.Lookup(box_value(L"WizardBadgeTextStyle")).as<Style>());
                text.Foreground(color);
                status.Children().Append(dot);
                status.Children().Append(text);
                row.Children().Append(status);
            };
            if (question.required)
            {
                appendStatus(L"必答", L"RequiredBadgeForegroundBrush");
            }
            if (question.hasJump || question.hasDisplayLogic)
            {
                appendStatus(L"逻辑", L"LogicBadgeForegroundBrush");
            }
            if (question.unsupported)
            {
                appendStatus(L"不支持", L"UnsupportedBadgeForegroundBrush");
            }
            Automation::AutomationProperties::SetName(row, hstring{ L"第 " + std::to_wstring(question.number) + L" 题，" +
                std::wstring{ question.type } + L"，" + std::wstring{ question.title } });
            return row;
        }

        void UpdateTaskbarBadge(uint32_t unsupportedCount)
        {
            try
            {
                auto manager = Microsoft::Windows::BadgeNotifications::BadgeNotificationManager::Current();
                if (unsupportedCount == 0) manager.ClearBadge();
                else manager.SetBadgeAsCount(unsupportedCount);
            }
            catch (...) {}
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
            UpdateTaskbarBadge(0);
            return;
        }

        bool hasUnknownLogic = false;
        uint32_t unsupportedCount = 0;
        int32_t maxQuestionNumber = 0;
        std::unordered_map<int32_t, int32_t> questionIndices;
        for (uint32_t index = 0; index < questions.size(); ++index)
        {
            auto question = m_document.QuestionAt(index);
            auto status = question.GetNamedString(L"logic_parse_status", L"");
            std::wstring normalized{ status };
            std::transform(normalized.begin(), normalized.end(), normalized.begin(), ::towlower);
            hasUnknownLogic = hasUnknownLogic || normalized == L"unknown";
            unsupportedCount += questions[index].unsupported ? 1u : 0u;
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
            auto parent = pageNode(PageNumber(question));

            TreeViewNode node;
            node.Content(QuestionNodeContent(summary));
            parent.Children().Append(node);
            m_questionNodes[index] = node;
            m_treeTargets.emplace_back(node, static_cast<int32_t>(index));

            if (hasUnknownLogic) continue;

            auto displayTargets = Services::GetJsonArray(question, L"controls_display_targets");
            for (auto const& value : displayTargets)
            {
                if (value.ValueType() != JsonValueType::Object) continue;
                auto target = value.GetObject();
                auto targetNumber = static_cast<int32_t>(target.GetNamedNumber(L"target_question_num", 0));
                if (targetNumber <= 0) continue;
                auto targetIndex = questionIndices.contains(targetNumber)
                    ? questionIndices.at(targetNumber) : static_cast<int32_t>(index);
                auto options = Services::GetJsonArray(target, L"condition_option_indices");
                appendRelation(node, hstring{ L"条件 · 选中" + std::wstring{ OptionLabel(question, options) }
                    + L" → 显示第 " + std::to_wstring(targetNumber) + L" 题" }, targetIndex);
            }

            auto jumpRules = Services::GetJsonArray(question, L"jump_rules");
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
            UpdateTaskbarBadge(unsupportedCount);
            QuestionTitle().Text(L"没有匹配的题目");
            QuestionMeta().Text(L"清空搜索框后显示全部题目");
            QuestionCountSummary().Text(L"0 / " + std::to_wstring(questions.size()) + L" 题");
            return;
        }
        UpdateTaskbarBadge(unsupportedCount);
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
        if (m_questionIndex >= 0 && m_questionIndex != index && !SaveCurrentQuestion())
        {
            auto previous = m_questionNodes[static_cast<size_t>(m_questionIndex)];
            m_syncingTreeSelection = true;
            QuestionTree().SelectedNode(previous);
            m_syncingTreeSelection = false;
            return;
        }
        m_questionIndex = index;
        auto total = static_cast<double>(m_document.Questions().size());
        QuestionCountSummary().Text(hstring{ L"第 " + std::to_wstring(index + 1) + L" / " + std::to_wstring(static_cast<int32_t>(total)) + L" 题" });
        auto node = m_questionNodes[static_cast<size_t>(index)];
        PreviousQuestionButton().IsEnabled(index > 0);
        NextQuestionButton().IsEnabled(index + 1 < static_cast<int32_t>(m_questionNodes.size()));
        if (QuestionTree().SelectedNode() != node)
        {
            m_syncingTreeSelection = true;
            QuestionTree().SelectedNode(node);
            m_syncingTreeSelection = false;
        }
        LoadQuestion();
    }

    void StrategyEditor::OnQuestionSearchChanged(IInspectable const&, AutoSuggestBoxTextChangedEventArgs const& args)
    {
        if (args.Reason() == AutoSuggestionBoxTextChangeReason::UserInput)
        {
            auto suggestions = winrt::single_threaded_observable_vector<IInspectable>();
            auto questions = m_document.Questions();
            for (auto const& question : questions)
            {
                auto raw = m_document.QuestionAt(static_cast<uint32_t>(&question - questions.data()));
                if (!ContainsText(raw, QuestionSearch().Text(), question.number)) continue;
                suggestions.Append(box_value(hstring{ L"第 " + std::to_wstring(question.number) + L" · " + std::wstring{ question.type }
                    + L" · " + std::wstring{ ShortTitle(question.title) } +
                    (question.logicSummary.empty() ? L"" : L" · " + std::wstring{ question.logicSummary }) }));
                if (suggestions.Size() >= 12) break;
            }
            QuestionSearch().ItemsSource(suggestions);
        }
    }

    void StrategyEditor::OnQuestionSuggestionChosen(IInspectable const&, AutoSuggestBoxSuggestionChosenEventArgs const& args)
    {
        auto selected = unbox_value_or<hstring>(args.SelectedItem(), L"");
        std::wstring selectedText{ selected };
        auto separator = selectedText.find(L" ");
        if (separator == std::wstring::npos) return;
        try
        {
            auto number = std::stoi(selectedText.substr(1, separator - 1));
            auto questions = m_document.Questions();
            for (uint32_t index = 0; index < questions.size(); ++index)
            {
                if (questions[index].number == number)
                {
                    SelectQuestion(static_cast<int32_t>(index));
                    return;
                }
            }
        }
        catch (...) {}
    }

    void StrategyEditor::OnQuestionQuerySubmitted(IInspectable const&, AutoSuggestBoxQuerySubmittedEventArgs const& args)
    {
        auto selected = args.ChosenSuggestion() ? unbox_value_or<hstring>(args.ChosenSuggestion(), L"") : args.QueryText();
        std::wstring selectedText{ selected };
        auto separator = selectedText.find(L" ");
        if (separator == std::wstring::npos)
        {
            auto questions = m_document.Questions();
            for (uint32_t index = 0; index < questions.size(); ++index)
            {
                if (ContainsText(m_document.QuestionAt(index), selected, questions[index].number))
                {
                    SelectQuestion(static_cast<int32_t>(index));
                    return;
                }
            }
            return;
        }
        try
        {
            auto number = std::stoi(selectedText.substr(1, separator - 1));
            auto questions = m_document.Questions();
            for (uint32_t index = 0; index < questions.size(); ++index)
            {
                if (questions[index].number == number) { SelectQuestion(static_cast<int32_t>(index)); return; }
            }
        }
        catch (...) {}
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
                SelectQuestion(targetIndex);
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

    void StrategyEditor::OnPreviousQuestion(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        if (m_questionIndex > 0) SelectQuestion(m_questionIndex - 1);
    }

    void StrategyEditor::OnNextQuestion(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        if (m_questionIndex >= 0 && m_questionIndex + 1 < static_cast<int32_t>(m_questionNodes.size()))
            SelectQuestion(m_questionIndex + 1);
    }
}
