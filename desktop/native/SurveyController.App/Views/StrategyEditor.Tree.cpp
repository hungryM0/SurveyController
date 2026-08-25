#include "pch.h"
#include "StrategyEditor.xaml.h"
#include "Services/JsonHelpers.h"

#include <algorithm>
#include <map>
#include <cwctype>
#include <tuple>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        using namespace Microsoft::UI::Xaml;
        using namespace Microsoft::UI::Xaml::Controls;
        using namespace Windows::Data::Json;

        hstring ShortTitle(hstring const& value)
        {
            std::wstring title{ value.empty() ? L"未命名题目" : value.c_str() };
            constexpr size_t limit = 24;
            if (title.size() > limit) title = title.substr(0, limit - 1) + L"…";
            return hstring{ title };
        }

        int32_t PageNumber(JsonObject const& question)
        {
            return (std::max)(1, static_cast<int32_t>(question.GetNamedNumber(L"page", 1)));
        }

        struct SearchMatch
        {
            int32_t count{};
            hstring firstLabel;
        };

        SearchMatch MatchSearchSegments(JsonObject const& question, hstring const& query)
        {
            std::wstring needle{ query };
            std::transform(needle.begin(), needle.end(), needle.begin(), ::towlower);
            if (needle.empty()) return {};

            SearchMatch match;
            for (auto const& value : Services::GetJsonArray(question, L"search_segments"))
            {
                if (value.ValueType() != JsonValueType::Object) continue;
                auto segment = value.GetObject();
                auto label = segment.GetNamedString(L"label", L"内容");
                std::wstring haystack{ label };
                haystack += L" " + std::wstring{ segment.GetNamedString(L"text", L"") };
                std::transform(haystack.begin(), haystack.end(), haystack.begin(), ::towlower);
                if (haystack.find(needle) == std::wstring::npos) continue;
                if (match.firstLabel.empty()) match.firstLabel = label;
                ++match.count;
            }
            return match;
        }

        hstring SearchPositionText(std::vector<int32_t> const& matches, int32_t currentIndex, int32_t occurrences)
        {
            if (matches.empty()) return L"0 题匹配";
            auto current = std::find(matches.begin(), matches.end(), currentIndex);
            auto position = current == matches.end() ? 0 : static_cast<int32_t>(std::distance(matches.begin(), current) + 1);
            return hstring{ std::to_wstring(position) + L" / " + std::to_wstring(matches.size()) + L" 题 · "
                + std::to_wstring(occurrences) + L" 处匹配" };
        }

        UIElement QuestionNodeContent(Services::WizardQuestion const& question)
        {
            auto title = TextBlock{};
            title.Text(hstring{ std::to_wstring(question.number) + L". " + std::wstring{ ShortTitle(question.title) } });
            title.TextTrimming(TextTrimming::CharacterEllipsis);
            Automation::AutomationProperties::SetName(title, hstring{ L"第 " + std::to_wstring(question.number) + L" 题，" +
                std::wstring{ question.type } + L"，" + std::wstring{ question.title } });
            Automation::AutomationProperties::SetAutomationId(title, hstring{ L"AnswerEditor.Question." + std::to_wstring(question.number) });
            return title;
        }

        UIElement PageNodeContent(int32_t page, int32_t questionCount)
        {
            auto text = TextBlock{};
            text.Text(hstring{ L"第 " + std::to_wstring(page) + L" 页 · " + std::to_wstring(questionCount) + L" 题" });
            Automation::AutomationProperties::SetName(text, text.Text());
            Automation::AutomationProperties::SetAutomationId(text, hstring{ L"AnswerEditor.Page." + std::to_wstring(page) });
            return text;
        }

        UIElement RelationNodeContent(JsonObject const& relation)
        {
            auto label = TextBlock{};
            label.Text(relation.GetNamedString(L"label", L"逻辑关系"));
            label.FontWeight(Windows::UI::Text::FontWeights::SemiBold());
            label.TextTrimming(TextTrimming::CharacterEllipsis);
            auto summary = relation.GetNamedString(L"summary", L"");
            Automation::AutomationProperties::SetName(label, summary);
            Automation::AutomationProperties::SetAutomationId(label, relation.GetNamedString(L"id", L"AnswerEditor.Relation"));
            return label;
        }

        StackPanel SearchSuggestion(Services::WizardQuestion const& question, SearchMatch const& match)
        {
            auto panel = StackPanel{};
            panel.Spacing(1);
            panel.Tag(box_value(question.number));
            auto primary = TextBlock{};
            primary.Text(hstring{ L"第 " + std::to_wstring(question.number) + L" 题 · " + std::wstring{ ShortTitle(question.title) } });
            auto secondary = TextBlock{};
            secondary.Text(hstring{ std::wstring{ match.firstLabel } + L" · " + std::to_wstring(match.count) + L" 处匹配" });
            secondary.FontSize(12);
            secondary.Foreground(Application::Current().Resources().Lookup(box_value(L"TextFillColorSecondaryBrush")).as<Microsoft::UI::Xaml::Media::Brush>());
            panel.Children().Append(primary);
            panel.Children().Append(secondary);
            Automation::AutomationProperties::SetName(panel, hstring{ std::wstring{ primary.Text() } + L"，" + std::wstring{ secondary.Text() } });
            Automation::AutomationProperties::SetAutomationId(panel, hstring{ L"AnswerEditor.SearchResult." + std::to_wstring(question.number) });
            return panel;
        }

        int32_t SuggestionQuestionNumber(IInspectable const& value)
        {
            auto element = value.try_as<FrameworkElement>();
            return element ? unbox_value_or<int32_t>(element.Tag(), 0) : 0;
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

        std::map<int32_t, TreeViewNode> pages;
        auto pageNode = [&](int32_t page, int32_t questionCount)
        {
            auto found = pages.find(page);
            if (found != pages.end()) return found->second;
            TreeViewNode node;
            node.Content(PageNodeContent(page, questionCount));
            node.IsExpanded(true);
            tree.RootNodes().Append(node);
            pages.emplace(page, node);
            return node;
        };

        for (uint32_t index = 0; index < questions.size(); ++index)
        {
            auto const& summary = questions[index];
            auto question = m_document.QuestionAt(index);
            auto parent = pageNode(PageNumber(question), summary.pageQuestionCount);

            TreeViewNode node;
            node.Content(QuestionNodeContent(summary));
            parent.Children().Append(node);
            m_questionNodes[index] = node;
            m_treeTargets.emplace_back(node, static_cast<int32_t>(index));

            auto appendRelations = [&](JsonArray const& relations, bool inbound)
            {
                for (auto const& value : relations)
                {
                    if (value.ValueType() != JsonValueType::Object) continue;
                    auto relation = value.GetObject();
                    auto targetNumber = static_cast<int32_t>(relation.GetNamedNumber(
                        inbound ? L"sourceQuestionNum" : L"targetQuestionNum", 0));
                    if (targetNumber <= 0) continue;
                    auto target = -1;
                    for (uint32_t candidate = 0; candidate < questions.size(); ++candidate)
                    {
                        if (questions[candidate].number == targetNumber)
                        {
                            target = static_cast<int32_t>(candidate);
                            break;
                        }
                    }
                    if (target < 0) continue;
                    TreeViewNode relationNode;
                    relationNode.Content(RelationNodeContent(relation));
                    // Keep relations as first-class page entries. Nesting them
                    // under every question makes the tree tall and hides the
                    // actual navigation targets behind expansion state.
                    parent.Children().Append(relationNode);
                    m_treeTargets.emplace_back(relationNode, target);
                }
            };
            appendRelations(Services::GetJsonArray(question, L"inbound_relations"), true);
            appendRelations(Services::GetJsonArray(question, L"outbound_relations"), false);
        }

        if (tree.RootNodes().Size() == 0)
        {
            m_questionIndex = -1;
            QuestionTitle().Text(L"没有匹配的题目");
            QuestionMeta().Text(L"清空搜索框后显示全部题目");
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
        if (m_questionIndex >= 0 && m_questionIndex != index && !SaveCurrentQuestion())
        {
            auto previous = m_questionNodes[static_cast<size_t>(m_questionIndex)];
            m_syncingTreeSelection = true;
            QuestionTree().SelectedNode(previous);
            m_syncingTreeSelection = false;
            return;
        }
        m_questionIndex = index;
        auto node = m_questionNodes[static_cast<size_t>(index)];
        if (QuestionTree().SelectedNode() != node)
        {
            m_syncingTreeSelection = true;
            QuestionTree().SelectedNode(node);
            m_syncingTreeSelection = false;
        }
        LoadQuestion();
        if (ActualWidth() < 800)
        {
            QuestionListPane().Visibility(Visibility::Collapsed);
            QuestionDetailScroll().Visibility(Visibility::Visible);
            BackToListButton().Visibility(Visibility::Visible);
        }
    }

    void StrategyEditor::OnQuestionSearchChanged(IInspectable const&, AutoSuggestBoxTextChangedEventArgs const& args)
    {
        if (args.Reason() == AutoSuggestionBoxTextChangeReason::UserInput)
        {
            auto suggestions = winrt::single_threaded_observable_vector<IInspectable>();
            auto questions = m_document.Questions();
            std::vector<int32_t> matches;
            int32_t occurrences = 0;
            for (uint32_t index = 0; index < questions.size(); ++index)
            {
                auto match = MatchSearchSegments(m_document.QuestionAt(index), QuestionSearch().Text());
                if (match.count == 0) continue;
                matches.push_back(static_cast<int32_t>(index));
                occurrences += match.count;
                if (suggestions.Size() < 12) suggestions.Append(SearchSuggestion(questions[index], match));
            }
            QuestionSearch().ItemsSource(suggestions);
            SearchPosition().Text(QuestionSearch().Text().empty() ? L"" : SearchPositionText(matches, m_questionIndex, occurrences));
        }
    }

    void StrategyEditor::OnQuestionSuggestionChosen(IInspectable const&, AutoSuggestBoxSuggestionChosenEventArgs const& args)
    {
        auto number = SuggestionQuestionNumber(args.SelectedItem());
        if (number <= 0) return;
        auto questions = m_document.Questions();
        for (uint32_t index = 0; index < questions.size(); ++index)
        {
            if (questions[index].number == number) { SelectQuestion(static_cast<int32_t>(index)); return; }
        }
    }

    void StrategyEditor::OnQuestionQuerySubmitted(IInspectable const&, AutoSuggestBoxQuerySubmittedEventArgs const& args)
    {
        auto chosenNumber = args.ChosenSuggestion() ? SuggestionQuestionNumber(args.ChosenSuggestion()) : 0;
        auto questions = m_document.Questions();
        std::vector<int32_t> matches;
        int32_t occurrences = 0;
        for (uint32_t index = 0; index < questions.size(); ++index)
        {
            auto match = MatchSearchSegments(m_document.QuestionAt(index), args.QueryText());
            if (match.count == 0) continue;
            matches.push_back(static_cast<int32_t>(index));
            occurrences += match.count;
        }
        if (chosenNumber > 0)
        {
            for (uint32_t index = 0; index < questions.size(); ++index)
            {
                if (questions[index].number == chosenNumber)
                {
                    SelectQuestion(static_cast<int32_t>(index));
                    SearchPosition().Text(SearchPositionText(matches, m_questionIndex, occurrences));
                    return;
                }
            }
            return;
        }
        if (!matches.empty())
        {
            SelectQuestion(matches.front());
            SearchPosition().Text(SearchPositionText(matches, m_questionIndex, occurrences));
        }
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
                auto lifetime = get_strong();
                DispatcherQueue().TryEnqueue([lifetime, targetIndex]()
                {
                    if (targetIndex >= 0 && targetIndex < static_cast<int32_t>(lifetime->m_questionNodes.size()))
                    {
                        try { lifetime->SelectQuestion(targetIndex); }
                        catch (hresult_error const& error)
                        {
                            lifetime->QuestionStatus().Severity(InfoBarSeverity::Error);
                            lifetime->QuestionStatus().Title(L"切换题目失败");
                            lifetime->QuestionStatus().Message(error.message());
                            lifetime->QuestionStatus().IsOpen(true);
                        }
                        catch (...)
                        {
                            lifetime->QuestionStatus().Severity(InfoBarSeverity::Error);
                            lifetime->QuestionStatus().Title(L"切换题目失败");
                            lifetime->QuestionStatus().Message(L"题目状态已更新，请重新选择。");
                            lifetime->QuestionStatus().IsOpen(true);
                        }
                    }
                });
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
                    if (targetIndex < 0 || targetIndex >= static_cast<int32_t>(lifetime->m_questionNodes.size())) return;
                    try { lifetime->SelectQuestion(targetIndex); }
                    catch (...)
                    {
                        lifetime->QuestionStatus().Severity(InfoBarSeverity::Error);
                        lifetime->QuestionStatus().Title(L"切换题目失败");
                        lifetime->QuestionStatus().Message(L"题目状态已更新，请重新选择。");
                        lifetime->QuestionStatus().IsOpen(true);
                    }
                });
                return;
            }
        }
    }

    void StrategyEditor::SelectNextMatch()
    {
        auto questions = m_document.Questions();
        std::vector<int32_t> matches;
        int32_t occurrences = 0;
        for (uint32_t index = 0; index < questions.size(); ++index)
        {
            auto match = MatchSearchSegments(m_document.QuestionAt(index), QuestionSearch().Text());
            if (match.count == 0) continue;
            matches.push_back(static_cast<int32_t>(index));
            occurrences += match.count;
        }
        if (matches.empty()) return;
        auto position = std::find(matches.begin(), matches.end(), m_questionIndex);
        auto next = position == matches.end() || ++position == matches.end() ? matches.begin() : position;
        SelectQuestion(*next);
        SearchPosition().Text(SearchPositionText(matches, m_questionIndex, occurrences));
    }

    void StrategyEditor::SelectPreviousMatch()
    {
        auto questions = m_document.Questions();
        std::vector<int32_t> matches;
        int32_t occurrences = 0;
        for (uint32_t index = 0; index < questions.size(); ++index)
        {
            auto match = MatchSearchSegments(m_document.QuestionAt(index), QuestionSearch().Text());
            if (match.count == 0) continue;
            matches.push_back(static_cast<int32_t>(index));
            occurrences += match.count;
        }
        if (matches.empty()) return;
        auto position = std::find(matches.begin(), matches.end(), m_questionIndex);
        auto previous = position == matches.end() || position == matches.begin() ? std::prev(matches.end()) : std::prev(position);
        SelectQuestion(*previous);
        SearchPosition().Text(SearchPositionText(matches, m_questionIndex, occurrences));
    }

}
