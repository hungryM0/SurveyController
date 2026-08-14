#pragma once

#include "MainWindow.g.h"
namespace winrt::SurveyController::App::implementation
{
    struct MainWindow : MainWindowT<MainWindow>
    {
        MainWindow();
        void OnNavigationSelectionChanged(
            Microsoft::UI::Xaml::Controls::NavigationView const& sender,
            Microsoft::UI::Xaml::Controls::NavigationViewSelectionChangedEventArgs const& args);
        void OnWindowClosing(
            Microsoft::UI::Windowing::AppWindow const& sender,
            Microsoft::UI::Windowing::AppWindowClosingEventArgs const& args);
    private:
        HWND m_hwnd{ nullptr };
        hstring m_settingsJson;
        hstring m_configJson;
        int32_t m_currentPageIndex{};
        bool m_hasNavigated{};
        bool m_askSaveOnClose{ true };
        bool m_confirmingClose{};
        bool m_closeConfirmed{};

        void ConnectBackend();
        void ConfigureBackdrop(bool enabled);
        void ConfigureTitleBar();
        void ConfigureWindow();
        void ApplyShellSettings(hstring const& json);
        void ShowPage(hstring const& tag);
        winrt::fire_and_forget ConfirmCloseAsync();
        static bool IsWindows11OrGreater();
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct MainWindow : MainWindowT<MainWindow, implementation::MainWindow>
    {
    };
}
