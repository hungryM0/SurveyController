#include "pch.h"
#include "CommunityPage.xaml.h"

#if __has_include("CommunityPage.g.cpp")
#include "CommunityPage.g.cpp"
#endif

#include <shellapi.h>

namespace winrt::SurveyController::App::implementation
{
    CommunityPage::CommunityPage() { InitializeComponent(); }

    void CommunityPage::OnOpenIssues(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        ShellExecuteW(nullptr, L"open", L"https://github.com/SurveyController/SurveyController/issues/new", nullptr, nullptr, SW_SHOWNORMAL);
    }

    void CommunityPage::OnOpenLicense(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        ShellExecuteW(nullptr, L"open", L"https://github.com/SurveyController/SurveyController/blob/main/LICENSE", nullptr, nullptr, SW_SHOWNORMAL);
    }
}
