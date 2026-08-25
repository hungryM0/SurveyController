#include "pch.h"
#include "ReverseFillPage.xaml.h"
#include "Services/WindowContext.h"

#if __has_include("ReverseFillPage.g.cpp")
#include "ReverseFillPage.g.cpp"
#endif

namespace winrt::SurveyController::App::implementation
{
    using namespace Microsoft::UI::Xaml;
    using namespace Microsoft::UI::Xaml::Controls;

    ReverseFillPage::ReverseFillPage() : m_document(Services::WizardDocument::Current())
    {
        InitializeComponent();
        m_initialized = true;
        PopulateFromDocument();
    }

    void ReverseFillPage::OnLoaded(IInspectable const&, RoutedEventArgs const&)
    {
        PopulateFromDocument();
    }

    void ReverseFillPage::PopulateFromDocument()
    {
        m_loadingSettings = true;
        auto path = m_document.ReverseFillPath();
        PathDisplay().Text(path);
        PickLabel().Text(path.empty() ? L"选择 Excel" : L"更换 Excel");
        ReverseFillEnabled().IsOn(m_document.ReverseFillEnabled());
        m_loadingSettings = false;
    }

    void ReverseFillPage::SyncToDocument()
    {
        if (!m_initialized || m_loadingSettings) return;
        // 反填配置独立成页后，写回职责从任务向导移交给本页。
        m_document.SetReverseFill(ReverseFillEnabled().IsOn(), m_document.ReverseFillPath());
    }

    void ReverseFillPage::ShowStatus(InfoBarSeverity severity, hstring const& title, hstring const& message)
    {
        ReverseFillStatus().Severity(severity);
        ReverseFillStatus().Title(title);
        ReverseFillStatus().Message(message);
        ReverseFillStatus().IsOpen(true);
    }

    fire_and_forget ReverseFillPage::OnChooseSpreadsheet(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();

        Microsoft::Windows::Storage::Pickers::FileOpenPicker picker(Services::MainWindowId());
        auto types = picker.FileTypeFilter();
        types.Append(L".xlsx");
        types.Append(L".xls");
        auto file = co_await picker.PickSingleFileAsync();
        if (!file) co_return;

        auto path = file.Path();
        try
        {
            // 路径写回文档；开关保持用户当前选择。
            m_document.SetReverseFill(ReverseFillEnabled().IsOn(), path);
            PathDisplay().Text(path);
            PickLabel().Text(L"更换 Excel");
            ShowStatus(InfoBarSeverity::Success, L"已选择反填表格", path);
        }
        catch (winrt::hresult_error const& value)
        {
            ShowStatus(InfoBarSeverity::Error, L"反填表格设置失败", value.message());
        }
        catch (...)
        {
            ShowStatus(InfoBarSeverity::Error, L"反填表格设置失败", L"请重试。");
        }
    }

    void ReverseFillPage::OnToggled(IInspectable const&, RoutedEventArgs const&)
    {
        if (ReverseFillEnabled().IsOn() && m_document.ReverseFillPath().empty())
        {
            ShowStatus(InfoBarSeverity::Warning, L"尚未选择表格",
                L"请先点击「选择 Excel」指定反填表格，否则开关不会生效。");
            return;
        }
        SyncToDocument();
    }
}
