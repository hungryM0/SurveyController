#include "pch.h"
#include "AnswerEditorWindow.xaml.h"
#include "AISettingsDialog.h"
#include "StrategyEditor.xaml.h"

#if __has_include("AnswerEditorWindow.g.cpp")
#include "AnswerEditorWindow.g.cpp"
#endif

#include <microsoft.ui.xaml.window.h>
#include <winrt/Microsoft.UI.Interop.h>

namespace winrt::SurveyController::App::implementation
{
    using namespace Microsoft::UI::Windowing;
    using namespace Microsoft::UI::Xaml;

    AnswerEditorWindow::AnswerEditorWindow() : m_document(Services::WizardDocument::Current())
    {
        InitializeComponent();
        Title(L"逐题答案编辑器");
        m_document.BeginEditTransaction();
        Closed([this](IInspectable const&, WindowEventArgs const&)
        {
            if (!m_committed) m_document.RollbackEditTransaction();
            if (m_closedHandler) m_closedHandler(m_committed);
        });
    }

    void AnswerEditorWindow::Show(Microsoft::UI::WindowId owner)
    {
        ConfigureWindow(owner);
        Activate();
    }

    void AnswerEditorWindow::ConfigureWindow(Microsoft::UI::WindowId owner)
    {
        Microsoft::UI::Xaml::Window window = *this;
        window.as<::IWindowNative>()->get_WindowHandle(&m_hwnd);
        auto ownerWindow = AppWindow::GetFromWindowId(owner);
        HWND ownerHwnd{};
        if (ownerWindow)
        {
            auto ownerAppWindow = AppWindow::GetFromWindowId(owner);
            auto ownerId = ownerAppWindow.Id();
            ownerHwnd = Microsoft::UI::GetWindowFromWindowId(ownerId);
        }
        if (ownerHwnd) ::SetWindowLongPtrW(m_hwnd, GWLP_HWNDPARENT, reinterpret_cast<LONG_PTR>(ownerHwnd));

        auto appWindow = AppWindow();
        auto presenter = appWindow.Presenter().as<OverlappedPresenter>();
        presenter.IsResizable(true);
        presenter.IsMaximizable(true);
        presenter.IsMinimizable(false);
        presenter.IsModal(true);

        auto dpi = static_cast<int>(::GetDpiForWindow(m_hwnd));
        auto display = DisplayArea::GetFromWindowId(appWindow.Id(), DisplayAreaFallback::Nearest);
        auto width = ::MulDiv(1180, dpi, USER_DEFAULT_SCREEN_DPI);
        auto height = ::MulDiv(840, dpi, USER_DEFAULT_SCREEN_DPI);
        if (display)
        {
            auto work = display.WorkArea();
            auto margin = ::MulDiv(24, dpi, USER_DEFAULT_SCREEN_DPI);
            width = (std::min)(width, (std::max)(work.Width - margin * 2, 320));
            height = (std::min)(height, (std::max)(work.Height - margin * 2, 320));
            auto availableWidth = (std::max)(work.Width - margin * 2, 320);
            auto availableHeight = (std::max)(work.Height - margin * 2, 320);
            presenter.PreferredMinimumWidth((std::min)(::MulDiv(760, dpi, USER_DEFAULT_SCREEN_DPI), availableWidth));
            presenter.PreferredMinimumHeight((std::min)(::MulDiv(560, dpi, USER_DEFAULT_SCREEN_DPI), availableHeight));
            appWindow.Resize({ width, height });
            appWindow.Move({ work.X + (work.Width - width) / 2, work.Y + (work.Height - height) / 2 });
        }
        else appWindow.Resize({ width, height });
    }

    void AnswerEditorWindow::OnSave(IInspectable const&, RoutedEventArgs const&)
    {
        auto editor = winrt::get_self<implementation::StrategyEditor>(Editor());
        if (editor->SaveCurrentQuestion()) CloseEditor(true);
    }
    void AnswerEditorWindow::OnCancel(IInspectable const&, RoutedEventArgs const&) { CloseEditor(false); }
    void AnswerEditorWindow::OnOpenAISettings(IInspectable const&, RoutedEventArgs const&) { ShowAISettingsAsync(); }

    fire_and_forget AnswerEditorWindow::ShowAISettingsAsync()
    {
        if (m_aiSettingsOpen) co_return;
        auto lifetime = get_strong();
        m_aiSettingsOpen = true;
        try
        {
            co_await Views::ShowAISettingsDialogAsync(Content().XamlRoot());
        }
        catch (...) {}
        m_aiSettingsOpen = false;
    }

    void AnswerEditorWindow::OnKeyDown(IInspectable const&, Microsoft::UI::Xaml::Input::KeyRoutedEventArgs const& args)
    {
        if (args.Key() == Windows::System::VirtualKey::Escape)
        {
            args.Handled(true);
            CloseEditor(false);
        }
    }

    void AnswerEditorWindow::CloseEditor(bool commit)
    {
        if (m_closing) return;
        m_closing = true;
        m_committed = commit;
        if (commit) m_document.CommitEditTransaction();
        else m_document.RollbackEditTransaction();
        Close();
    }
}
