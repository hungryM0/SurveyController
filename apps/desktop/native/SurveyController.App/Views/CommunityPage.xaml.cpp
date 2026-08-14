#include "pch.h"
#include "CommunityPage.xaml.h"

#if __has_include("CommunityPage.g.cpp")
#include "CommunityPage.g.cpp"
#endif

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.h>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        fire_and_forget OpenUrl(wchar_t const* url)
        {
            co_await Windows::System::Launcher::LaunchUriAsync(Windows::Foundation::Uri(url));
        }
    }

    CommunityPage::CommunityPage()
    {
        InitializeComponent();
    }

    fire_and_forget CommunityPage::OnOpenIssues(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/SurveyController/SurveyController/issues/new");
        co_return;
    }

    fire_and_forget CommunityPage::OnOpenLicense(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/SurveyController/SurveyController/blob/main/LICENSE");
        co_return;
    }
}
