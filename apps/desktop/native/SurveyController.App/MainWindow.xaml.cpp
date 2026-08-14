#include "pch.h"
#include "MainWindow.xaml.h"
#include "Views/TaskPage.xaml.h"
#include "Views/SettingsPage.xaml.h"
#include "Views/CommunityPage.xaml.h"
#include "Views/MorePage.xaml.h"
#include "Services/BackendClient.h"
#include "Services/JsonHelpers.h"
#include "Services/ShellSettings.h"
#include "Services/UiMotion.h"
#include "Services/WizardDocument.h"

#if __has_include("MainWindow.g.cpp")
#include "MainWindow.g.cpp"
#endif

#include <microsoft.ui.xaml.window.h>
#include <commctrl.h>

namespace winrt::SurveyController::App::implementation
{
    MainWindow::MainWindow()
    {
        InitializeComponent();
        Title(L"SurveyController");
        ConfigureTitleBar();
        ConfigureWindow();
        ConnectBackend();
        AppWindow().Closing({ this, &MainWindow::OnWindowClosing });
        ShellNavigation().SelectionChanged({ this, &MainWindow::OnNavigationSelectionChanged });
        Content().as<Microsoft::UI::Xaml::FrameworkElement>().SizeChanged({ this, &MainWindow::OnRootSizeChanged });
        ShowPage(L"task");
    }

    void MainWindow::ConnectBackend()
    {
        auto& backend = winrt::SurveyController::App::Services::BackendClient::Current();
        backend.Start();
        m_settingsJson = backend.Call(L"GetAppSettings");
        m_configJson = backend.Call(L"LoadConfig", L"{}");
        Services::WizardDocument::Current().LoadConfigState(m_configJson);
        auto weak = get_weak();
        Services::ShellSettings::Current().SetChangedHandler([weak](hstring const& json)
        {
            if (auto self = weak.get()) self->ApplyShellSettings(json);
        });
        Services::ShellSettings::Current().Update(m_settingsJson);
    }

    void MainWindow::ConfigureBackdrop(bool enabled)
    {
        using namespace Microsoft::UI::Xaml::Media;
        if (!enabled)
        {
            SystemBackdrop(nullptr);
            return;
        }
        if (IsWindows11OrGreater())
        {
            SystemBackdrop(MicaBackdrop{});
            return;
        }
        SystemBackdrop(DesktopAcrylicBackdrop{});
    }

    void MainWindow::ApplyShellSettings(hstring const& json)
    {
        using namespace Microsoft::UI::Xaml;
        using namespace Windows::Data::Json;

        JsonObject settings;
        hstring parseError;
        if (!Services::TryParseJsonObject(json, settings, parseError))
        {
            return;
        }
        auto theme = settings.GetNamedString(L"themeMode", L"system");
        auto root = Content().try_as<FrameworkElement>();
        if (root)
        {
            root.RequestedTheme(theme == L"light" ? ElementTheme::Light
                : theme == L"dark" ? ElementTheme::Dark : ElementTheme::Default);
        }

        m_showNavigationText = settings.GetNamedBoolean(L"showNavigationText", true);
        UpdateNavigationLayout(root ? root.ActualWidth() : 0);

        ConfigureBackdrop(settings.GetNamedBoolean(L"micaEnabled", true));
        m_askSaveOnClose = settings.GetNamedBoolean(L"askSaveOnClose", true);
        auto topmost = settings.GetNamedBoolean(L"topmost", false);
        ::SetWindowPos(m_hwnd, topmost ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }

    void MainWindow::OnWindowClosing(
        Microsoft::UI::Windowing::AppWindow const&,
        Microsoft::UI::Windowing::AppWindowClosingEventArgs const& args)
    {
        if (m_closeConfirmed || !m_askSaveOnClose) return;
        args.Cancel(true);
        if (!m_confirmingClose) ConfirmCloseAsync();
    }

    fire_and_forget MainWindow::ConfirmCloseAsync()
    {
        auto lifetime = get_strong();
        m_confirmingClose = true;

        Microsoft::UI::Xaml::Controls::ContentDialog dialog;
        dialog.XamlRoot(Content().XamlRoot());
        dialog.Title(box_value(L"保存当前配置？"));
        dialog.Content(box_value(L"关闭前可以把本次改动写入配置文件。"));
        dialog.PrimaryButtonText(L"保存并关闭");
        dialog.SecondaryButtonText(L"不保存并关闭");
        dialog.CloseButtonText(L"取消");
        dialog.DefaultButton(Microsoft::UI::Xaml::Controls::ContentDialogButton::Primary);

        auto result = co_await dialog.ShowAsync();
        if (result == Microsoft::UI::Xaml::Controls::ContentDialogResult::Primary)
        {
            hstring saveError;
            try
            {
                auto& document = Services::WizardDocument::Current();
                auto saved = Services::BackendClient::Current().Call(L"SaveConfig", document.SaveRequest());
                document.LoadConfigState(saved);
            }
            catch (hresult_error const& error)
            {
                saveError = error.message();
            }
            if (!saveError.empty())
            {
                Microsoft::UI::Xaml::Controls::ContentDialog failure;
                failure.XamlRoot(Content().XamlRoot());
                failure.Title(box_value(L"无法保存配置"));
                failure.Content(box_value(saveError));
                failure.CloseButtonText(L"返回");
                co_await failure.ShowAsync();
                m_confirmingClose = false;
                co_return;
            }
        }

        m_confirmingClose = false;
        if (result == Microsoft::UI::Xaml::Controls::ContentDialogResult::None) co_return;
        m_closeConfirmed = true;
        Close();
    }

    void MainWindow::ConfigureTitleBar()
    {
        ExtendsContentIntoTitleBar(true);
        SetTitleBar(AppTitleBar());
        auto titleBar = AppWindow().TitleBar();
        titleBar.ButtonBackgroundColor(Windows::UI::Colors::Transparent());
        titleBar.ButtonInactiveBackgroundColor(Windows::UI::Colors::Transparent());
    }

    void MainWindow::ConfigureWindow()
    {
        Microsoft::UI::Xaml::Window window = *this;
        window.as<::IWindowNative>()->get_WindowHandle(&m_hwnd);
        check_bool(::SetWindowSubclass(m_hwnd, WindowSubclassProc, 1, reinterpret_cast<DWORD_PTR>(this)));

        auto appWindow = AppWindow();
        auto const dpi = ::GetDpiForWindow(m_hwnd);
        appWindow.SetIcon(L"Assets\\SurveyController.ico");

        auto displayArea = Microsoft::UI::Windowing::DisplayArea::GetFromWindowId(
            appWindow.Id(), Microsoft::UI::Windowing::DisplayAreaFallback::Nearest);
        auto width = ::MulDiv(1180, static_cast<int>(dpi), USER_DEFAULT_SCREEN_DPI);
        auto height = ::MulDiv(720, static_cast<int>(dpi), USER_DEFAULT_SCREEN_DPI);
        if (displayArea)
        {
            auto workArea = displayArea.WorkArea();
            auto const maxWidth = workArea.Width > 64 ? workArea.Width - 64 : workArea.Width;
            auto const maxHeight = workArea.Height > 64 ? workArea.Height - 64 : workArea.Height;
            width = width < maxWidth ? width : maxWidth;
            height = height < maxHeight ? height : maxHeight;
            appWindow.Resize({ width, height });
            auto size = appWindow.Size();
            appWindow.Move({
                workArea.X + (workArea.Width - size.Width) / 2,
                workArea.Y + (workArea.Height - size.Height) / 2
            });
        }
        else
        {
            appWindow.Resize({ width, height });
        }
        ContentFrame().CacheSize(4);
    }

    LRESULT CALLBACK MainWindow::WindowSubclassProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam,
        UINT_PTR subclassId, DWORD_PTR)
    {
        if (message == WM_GETMINMAXINFO)
        {
            auto info = reinterpret_cast<MINMAXINFO*>(lParam);
            auto const dpi = ::GetDpiForWindow(window);
            info->ptMinTrackSize.x = ::MulDiv(760, static_cast<int>(dpi), USER_DEFAULT_SCREEN_DPI);
            info->ptMinTrackSize.y = ::MulDiv(560, static_cast<int>(dpi), USER_DEFAULT_SCREEN_DPI);
            return 0;
        }
        if (message == WM_NCDESTROY)
        {
            ::RemoveWindowSubclass(window, WindowSubclassProc, subclassId);
        }
        return ::DefSubclassProc(window, message, wParam, lParam);
    }

    bool MainWindow::IsWindows11OrGreater()
    {
        OSVERSIONINFOEXW version{};
        version.dwOSVersionInfoSize = sizeof(version);
        version.dwBuildNumber = 22000;
        auto mask = VerSetConditionMask(0, VER_BUILDNUMBER, VER_GREATER_EQUAL);
        return VerifyVersionInfoW(&version, VER_BUILDNUMBER, mask) != FALSE;
    }

    void MainWindow::OnNavigationSelectionChanged(
        Microsoft::UI::Xaml::Controls::NavigationView const&,
        Microsoft::UI::Xaml::Controls::NavigationViewSelectionChangedEventArgs const& args)
    {
        auto item = args.SelectedItem().try_as<Microsoft::UI::Xaml::Controls::NavigationViewItem>();
        if (!item)
        {
            return;
        }
        auto tag = unbox_value_or<hstring>(item.Tag(), L"");
        ShowPage(tag);
    }

    void MainWindow::OnRootSizeChanged(IInspectable const& sender,
        Microsoft::UI::Xaml::SizeChangedEventArgs const&)
    {
        UpdateNavigationLayout(sender.as<Microsoft::UI::Xaml::FrameworkElement>().ActualWidth());
    }

    void MainWindow::UpdateNavigationLayout(double width)
    {
        auto const showLabels = m_showNavigationText && width >= 980;
        ShellNavigation().PaneDisplayMode(showLabels
            ? Microsoft::UI::Xaml::Controls::NavigationViewPaneDisplayMode::Left
            : Microsoft::UI::Xaml::Controls::NavigationViewPaneDisplayMode::LeftCompact);
        ShellNavigation().OpenPaneLength(220);
        ShellNavigation().IsPaneOpen(showLabels);
    }

    void MainWindow::ShowPage(hstring const& tag)
    {
        using namespace Microsoft::UI::Xaml::Media::Animation;

        int32_t const targetIndex = tag == L"task" ? 0 : tag == L"settings" ? 1 : tag == L"community" ? 2 : 3;
        if (m_hasNavigated && targetIndex == m_currentPageIndex) return;

        NavigationTransitionInfo transition{ nullptr };
        if (Services::AnimationsEnabled())
        {
            transition = EntranceNavigationTransitionInfo{};
        }
        else
        {
            transition = SuppressNavigationTransitionInfo{};
        }

        if (tag == L"task")
        {
            ContentFrame().Navigate(xaml_typename<SurveyController::App::TaskPage>(), nullptr, transition);
        }
        else if (tag == L"settings")
        {
            ContentFrame().Navigate(xaml_typename<SurveyController::App::SettingsPage>(), nullptr, transition);
        }
        else if (tag == L"community")
        {
            ContentFrame().Navigate(xaml_typename<SurveyController::App::CommunityPage>(), nullptr, transition);
        }
        else if (tag == L"more")
        {
            ContentFrame().Navigate(xaml_typename<SurveyController::App::MorePage>(), nullptr, transition);
        }
        m_currentPageIndex = targetIndex;
        m_hasNavigated = true;
    }
}
