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
        using namespace Microsoft::UI::Xaml::Media;
        using namespace Microsoft::UI::Xaml::Shapes;
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
            auto line = StackPanel{};
            line.Orientation(Orientation::Horizontal);
            line.Spacing(7);
            auto icon = FontIcon{};
            icon.Glyph(question.icon);
            icon.FontSize(14);
            icon.Foreground(foreground);
            auto badge = Shapes::Ellipse{};
            badge.Width(8);
            badge.Height(8);
            badge.VerticalAlignment(VerticalAlignment::Center);
            badge.Fill(resources.Lookup(box_value(backgroundKey)).as<Brush>());
            auto type = TextBlock{};
            type.Text(question.type);
            type.FontSize(12);
            type.FontWeight(Windows::UI::Text::FontWeights::SemiBold());
            type.Foreground(badgeForeground);
            auto title = TextBlock{};
            title.Text(hstring{ std::to_wstring(question.number) + L". " + std::wstring{ ShortTitle(question.title) } });
            title.TextTrimming(TextTrimming::CharacterEllipsis);
            line.Children().Append(icon);
            line.Children().Append(badge);
            line.Children().Append(type);
            line.Children().Append(title);
            auto appendBadge = [&](wchar_t const* label, wchar_t const* backgroundKey, wchar_t const* foregroundKey)
            {
                auto badge = ContentControl{};
                badge.Style(resources.Lookup(box_value(L"WizardTextBadgeStyle")).as<Style>());
                badge.Content(box_value(label));
                badge.Background(resources.Lookup(box_value(backgroundKey)).as<Brush>());
                badge.Foreground(resources.Lookup(box_value(foregroundKey)).as<Brush>());
                line.Children().Append(badge);
            };
            if (question.required)
            {
                appendBadge(L"必答", L"RequiredBadgeBackgroundBrush", L"RequiredBadgeForegroundBrush");
            }
            if (question.hasJump)
            {
                appendBadge(L"跳题", L"JumpBadgeBackgroundBrush", L"JumpBadgeForegroundBrush");
            }
            if (question.hasDisplayLogic)
            {
                appendBadge(L"逻辑", L"ControlsDisplayBadgeBackgroundBrush", L"ControlsDisplayBadgeForegroundBrush");
            }
            if (question.unsupported)
            {
                appendBadge(L"不支持", L"UnsupportedBadgeBackgroundBrush", L"UnsupportedBadgeForegroundBrush");
            }
            auto content = StackPanel{};
            content.Spacing(2);
            content.Children().Append(line);
            if (!question.logicSummary.empty())
            {
                auto logic = TextBlock{};
                logic.Text(question.logicSummary);
                logic.FontSize(11);
                logic.Foreground(resources.Lookup(box_value(L"TextFillColorSecondaryBrush")).as<Brush>());
                logic.TextTrimming(TextTrimming::CharacterEllipsis);
                content.Children().Append(logic);
            }
            Automation::AutomationProperties::SetName(content, hstring{ L"第 " + std::to_wstring(question.number) + L" 题，" +
                std::wstring{ question.type } + L"，" + std::wstring{ question.title } });
            return content;
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

        uint32_t unsupportedCount = 0;
        std::map<int32_t, uint32_t> pageCounts;
        for (uint32_t index = 0; index < questions.size(); ++index)
        {
            unsupportedCount += questions[index].unsupported ? 1u : 0u;
            ++pageCounts[questions[index].page];
        }

        std::map<int32_t, TreeViewNode> pages;
        auto pageNode = [&](int32_t page)
        {
            auto found = pages.find(page);
            if (found != pages.end()) return found->second;
            TreeViewNode node;
            node.Content(box_value(hstring{ L"第 " + std::to_wstring(page) + L" 页 · " +
                std::to_wstring(pageCounts[page]) + L" 题" }));
            node.IsExpanded(true);
            tree.RootNodes().Append(node);
            pages.emplace(page, node);
            return node;
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
        }

        if (tree.RootNodes().Size() == 0)
        {
            m_questionIndex = -1;
            UpdateTaskbarBadge(unsupportedCount);
            QuestionTitle().Text(L"没有匹配的题目");
            QuestionMeta().Text(L"清空搜索框后显示全部题目");
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
        auto node = m_questionNodes[static_cast<size_t>(index)];
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

}
