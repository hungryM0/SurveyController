#include "pch.h"
#include "AnswersPage.xaml.h"
#include "Services/WindowContext.h"

#if __has_include("AnswersPage.g.cpp")
#include "AnswersPage.g.cpp"
#endif

namespace winrt::SurveyController::App::implementation
{
    using namespace Microsoft::UI::Xaml;
    using namespace Microsoft::UI::Xaml::Controls;

    AnswersPage::AnswersPage() : m_document(Services::WizardDocument::Current())
    {
        InitializeComponent();
        UpdateStats();
        RuleEditorView().Refresh();
    }

    void AnswersPage::OnLoaded(IInspectable const&, RoutedEventArgs const&)
    {
        // 答案编辑窗口或问卷重新解析后，统计与规则列表都可能变化。
        UpdateStats();
        RuleEditorView().Refresh();
    }

    void AnswersPage::UpdateStats()
    {
        auto questions = m_document.Questions();
        uint32_t configured = 0;
        uint32_t ai = 0;
        uint32_t problems = 0;
        for (auto const& question : questions)
        {
            if (question.configured) ++configured;
            if (question.aiEnabled) ++ai;
            if (!question.configured || question.unsupported) ++problems;
        }
        TotalCount().Text(to_hstring(questions.size()));
        ConfiguredCount().Text(to_hstring(configured));
        AICount().Text(to_hstring(ai));
        ProblemCount().Text(to_hstring(problems));
    }

    void AnswersPage::ShowStatus(InfoBarSeverity severity, hstring const& title, hstring const& message)
    {
        AnswersHint().Severity(severity);
        AnswersHint().Title(title);
        AnswersHint().Message(message);
        AnswersHint().IsOpen(true);
    }

    void AnswersPage::OnEditAnswers(IInspectable const&, RoutedEventArgs const&)
    {
        if (m_answerEditor)
        {
            m_answerEditor.Activate();
            return;
        }
        SurveyController::App::AnswerEditorWindow window{ nullptr };
        try
        {
            window = winrt::make<implementation::AnswerEditorWindow>();
            auto editor = winrt::get_self<implementation::AnswerEditorWindow>(window);
            auto weak = get_weak();
            editor->SetClosedHandler([weak](bool)
            {
                if (auto self = weak.get())
                {
                    self->m_answerEditor = nullptr;
                    self->UpdateStats();
                }
            });
            m_answerEditor = window;
            editor->Show(Services::MainWindowId());
        }
        catch (winrt::hresult_error const& value)
        {
            m_answerEditor = nullptr;
            if (window) { try { window.Close(); } catch (...) {} }
            ShowStatus(InfoBarSeverity::Error, L"答案编辑器打开失败", value.message());
        }
        catch (...)
        {
            m_answerEditor = nullptr;
            if (window) { try { window.Close(); } catch (...) {} }
            ShowStatus(InfoBarSeverity::Error, L"答案编辑器打开失败", L"请重试。");
        }
    }
}
