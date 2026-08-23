#include "pch.h"
#include "SurveyPage.xaml.h"
#include "Services/RpcServices.h"
#include "Services/WindowContext.h"
#include "Services/JsonHelpers.h"

#if __has_include("SurveyPage.g.cpp")
#include "SurveyPage.g.cpp"
#endif

namespace winrt::SurveyController::App::implementation
{
    using namespace Microsoft::UI::Xaml;
    using namespace Microsoft::UI::Xaml::Controls;

    namespace
    {
        hstring ProviderLabel(hstring const& provider)
        {
            if (provider == L"qq") return L"腾讯问卷";
            if (provider == L"credamo") return L"见数";
            return L"问卷星";
        }
    }

    SurveyPage::SurveyPage() : m_document(Services::WizardDocument::Current())
    {
        InitializeComponent();
        m_initialized = true;
        RefreshFromDocument();
    }

    void SurveyPage::OnLoaded(IInspectable const&, RoutedEventArgs const&)
    {
        // 从其他页面返回时刷新统计与概要（答案编辑、规则修改都会影响这里）。
        RefreshFromDocument();
    }

    void SurveyPage::RefreshFromDocument()
    {
        m_parsed = m_document.HasRealSurvey();
        auto const url = m_document.URL();
        if (SurveyUrl().Text() != url && !m_parsed)
        {
            SurveyUrl().Text(url);
        }
        else if (SurveyUrl().Text().empty() && !url.empty())
        {
            SurveyUrl().Text(url);
        }
        UpdateStats();
        ParsedCard().Visibility(m_parsed ? Visibility::Visible : Visibility::Collapsed);
        EmptyHint().Visibility(m_parsed ? Visibility::Collapsed : Visibility::Visible);
        ParseLabel().Text(m_parsed ? L"重新解析" : L"解析并继续");
        ParseIcon().Symbol(m_parsed ? Symbol::Refresh : Symbol::Forward);
    }

    void SurveyPage::UpdateStats()
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
        if (m_parsed)
        {
            auto question = m_document.QuestionAt(0);
            SurveyTitle().Text(m_document.Title().empty() ? L"未命名问卷" : m_document.Title());
            SurveyProviderBadge().Text(ProviderLabel(m_document.Provider()));
            SurveyIcon().Glyph(question ? question.GetNamedString(L"icon", L"") : L"");
        }
    }

    void SurveyPage::ShowParsedSurvey()
    {
        UpdateStats();
        ParsedCard().Visibility(Visibility::Visible);
        EmptyHint().Visibility(Visibility::Collapsed);
        ParseLabel().Text(L"重新解析");
        ParseIcon().Symbol(Symbol::Refresh);
    }

    void SurveyPage::SetBusy(bool busy)
    {
        m_busy = busy;
        SurveyUrl().IsEnabled(!busy);
        ParseButton().IsEnabled(!busy);
    }

    void SurveyPage::ShowStatus(InfoBarSeverity severity, hstring const& title, hstring const& message)
    {
        SurveyStatus().Severity(severity);
        SurveyStatus().Title(title);
        SurveyStatus().Message(message);
        SurveyStatus().IsOpen(true);
    }

    void SurveyPage::OnSurveyUrlChanged(IInspectable const&, TextChangedEventArgs const&)
    {
        if (!m_initialized) return;
        if (!m_document.HasRealSurvey() || SurveyUrl().Text() == m_document.URL()) return;
        m_parsed = false;
        m_document.SetSurveyURL(SurveyUrl().Text());
        ShowStatus(InfoBarSeverity::Warning, L"链接已修改", L"需要重新解析问卷。");
        RefreshFromDocument();
    }

    fire_and_forget SurveyPage::OnParse(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        if (m_busy) co_return;
        auto url = SurveyUrl().Text();
        SetBusy(true);

        hstring result;
        hstring error;
        co_await winrt::resume_background();
        try { result = co_await Services::ConfigService{}.CreateSurveyAsync(url); }
        catch (winrt::hresult_error const& value) { error = value.message(); }
        catch (std::exception const& value) { error = to_hstring(value.what()); }
        catch (...) { error = L"后端调用失败。"; }

        lifetime->DispatcherQueue().TryEnqueue([lifetime, result, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty())
            {
                lifetime->ShowStatus(InfoBarSeverity::Error, L"无法解析问卷", error);
                return;
            }
            try
            {
                lifetime->m_document.SetParsedConfig(result);
                if (!lifetime->m_document.HasRealSurvey())
                {
                    lifetime->ShowStatus(InfoBarSeverity::Error, L"解析完成", L"解析结果没有真实可作答题目。");
                    return;
                }
                lifetime->m_parsed = true;
                lifetime->ShowParsedSurvey();
                lifetime->ShowStatus(InfoBarSeverity::Success, L"问卷解析完成", lifetime->m_document.Title());
            }
            catch (winrt::hresult_error const& value)
            {
                lifetime->ShowStatus(InfoBarSeverity::Error, L"解析结果无效", value.message());
            }
            catch (...)
            {
                lifetime->ShowStatus(InfoBarSeverity::Error, L"解析结果无效", L"请检查链接后重试。");
            }
        });
    }

    Windows::Foundation::IAsyncOperation<hstring> SurveyPage::ChooseFile(bool image, bool spreadsheet)
    {
        Microsoft::Windows::Storage::Pickers::FileOpenPicker picker(Services::MainWindowId());
        auto types = picker.FileTypeFilter();
        if (image) { types.Append(L".png"); types.Append(L".jpg"); types.Append(L".jpeg"); types.Append(L".bmp"); }
        else if (spreadsheet) { types.Append(L".xlsx"); types.Append(L".xls"); }
        else { types.Append(L".json"); }
        auto file = co_await picker.PickSingleFileAsync();
        co_return file ? file.Path() : hstring{};
    }

    fire_and_forget SurveyPage::OnChooseQRCode(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        if (m_busy) co_return;
        hstring path;
        try { path = co_await ChooseFile(true); }
        catch (winrt::hresult_error const& value) { ShowStatus(InfoBarSeverity::Error, L"无法打开图片", value.message()); co_return; }
        catch (...) { ShowStatus(InfoBarSeverity::Error, L"无法打开图片", L"选择二维码图片失败。"); co_return; }
        if (path.empty()) co_return;

        SetBusy(true);
        hstring parsed;
        hstring error;
        co_await winrt::resume_background();
        try { parsed = co_await Services::ConfigService{}.DecodeQrSurveyAsync(path); }
        catch (winrt::hresult_error const& value) { error = value.message(); }
        catch (std::exception const& value) { error = to_hstring(value.what()); }
        catch (...) { error = L"二维码识别失败。"; }

        lifetime->DispatcherQueue().TryEnqueue([lifetime, parsed, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty())
            {
                lifetime->ShowStatus(InfoBarSeverity::Error, L"二维码识别失败", error);
                return;
            }
            try
            {
                lifetime->m_document.SetParsedConfig(parsed);
                if (!lifetime->m_document.HasRealSurvey())
                {
                    lifetime->ShowStatus(InfoBarSeverity::Error, L"二维码已识别", L"对应问卷没有真实可作答题目。");
                    return;
                }
                lifetime->m_parsed = true;
                lifetime->SurveyUrl().Text(lifetime->m_document.URL());
                lifetime->ShowParsedSurvey();
                lifetime->ShowStatus(InfoBarSeverity::Success, L"二维码已识别", lifetime->m_document.Title());
            }
            catch (...)
            {
                lifetime->ShowStatus(InfoBarSeverity::Error, L"二维码导入失败", L"结果不是有效的问卷配置。");
            }
        });
    }

    fire_and_forget SurveyPage::OnImportConfig(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        if (m_busy) co_return;
        hstring path;
        try { path = co_await ChooseFile(false); }
        catch (winrt::hresult_error const& value) { ShowStatus(InfoBarSeverity::Error, L"无法打开配置", value.message()); co_return; }
        catch (...) { ShowStatus(InfoBarSeverity::Error, L"无法打开配置", L"选择配置文件失败。"); co_return; }
        if (path.empty()) co_return;

        SetBusy(true);
        hstring result;
        hstring error;
        co_await winrt::resume_background();
        try { result = co_await Services::ConfigService{}.LoadAsync(path); }
        catch (winrt::hresult_error const& value) { error = value.message(); }
        catch (std::exception const& value) { error = to_hstring(value.what()); }
        catch (...) { error = L"配置文件读取失败。"; }

        lifetime->DispatcherQueue().TryEnqueue([lifetime, result, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty())
            {
                lifetime->ShowStatus(InfoBarSeverity::Error, L"导入配置失败", error);
                return;
            }
            try
            {
                lifetime->m_document.LoadConfigState(result);
                if (!lifetime->m_document.HasRealSurvey())
                {
                    lifetime->ShowStatus(InfoBarSeverity::Error, L"导入配置失败", L"配置中没有真实可作答题目。");
                    return;
                }
                lifetime->m_parsed = true;
                lifetime->SurveyUrl().Text(lifetime->m_document.URL());
                lifetime->ShowParsedSurvey();
                lifetime->ShowStatus(InfoBarSeverity::Success, L"配置已导入",
                    L"请在「作答」「网络」「时间」确认配置，然后到「运行」启动任务。");
            }
            catch (winrt::hresult_error const& value)
            {
                lifetime->ShowStatus(InfoBarSeverity::Error, L"导入配置失败", value.message());
            }
            catch (...)
            {
                lifetime->ShowStatus(InfoBarSeverity::Error, L"导入配置失败", L"文件内容不是有效的问卷配置。");
            }
        });
    }

    void SurveyPage::OnEditAnswers(IInspectable const&, RoutedEventArgs const&)
    {
        if (m_busy) return;
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
