#include "pch.h"
#include "App.xaml.h"
#include "MainWindow.xaml.h"

namespace winrt::SurveyController::App::implementation
{
    App::App()
    {
        RequestedTheme(Microsoft::UI::Xaml::ApplicationTheme::Dark);

#if defined _DEBUG && !defined DISABLE_XAML_GENERATED_BREAK_ON_UNHANDLED_EXCEPTION
        UnhandledException([](IInspectable const&, Microsoft::UI::Xaml::UnhandledExceptionEventArgs const& args)
        {
            if (IsDebuggerPresent())
            {
                auto message = args.Message();
                __debugbreak();
            }
        });
#endif
    }

    void App::OnLaunched(Microsoft::UI::Xaml::LaunchActivatedEventArgs const&)
    {
        m_window = make<MainWindow>();
        m_window.Activate();
    }
}
