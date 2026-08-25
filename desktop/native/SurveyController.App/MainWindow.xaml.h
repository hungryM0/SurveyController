#pragma once

#include "MainWindow.g.h"
namespace winrt::SurveyController::App::implementation
{
    struct MainWindow : MainWindowT<MainWindow>
    {
        MainWindow();
        void OnWindowActivated(
            IInspectable const& sender,
            Microsoft::UI::Xaml::WindowActivatedEventArgs const& args);
        void OnNavigationSelectionChanged(
            Microsoft::UI::Xaml::Controls::NavigationView const& sender,
            Microsoft::UI::Xaml::Controls::NavigationViewSelectionChangedEventArgs const& args);
        void OnWindowClosing(
            Microsoft::UI::Windowing::AppWindow const& sender,
            Microsoft::UI::Windowing::AppWindowClosingEventArgs const& args);
        void OnWindowClosed(
            IInspectable const& sender,
            Microsoft::UI::Xaml::WindowEventArgs const& args);
    private:
        HWND m_hwnd{ nullptr };
        hstring m_settingsJson;
        hstring m_configJson;
        int32_t m_currentPageIndex{};
        bool m_hasNavigated{};
        bool m_askSaveOnClose{ true };
        bool m_confirmingClose{};
        bool m_closeConfirmed{};
        bool m_initializing{};
        bool m_initialized{};
        bool m_closing{};

        hstring m_themeMode{ L"system" };
        Microsoft::UI::Xaml::FrameworkElement::ActualThemeChanged_revoker m_rootThemeRevoker;

        winrt::fire_and_forget InitializeAsync();
        winrt::fire_and_forget ConfirmCloseAsync();
        void ConfigureBackdrop();
        void ConfigureTitleBar();
        void ApplyTitleBarTheme(hstring const& themeMode);
        void ConfigureWindow();
        void ApplyShellSettings(hstring const& json);
        void ShowPage(hstring const& tag);
        static bool IsWindows11OrGreater();
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct MainWindow : MainWindowT<MainWindow, implementation::MainWindow>
    {
    };
}
