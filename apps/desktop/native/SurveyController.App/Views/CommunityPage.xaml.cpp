#include "pch.h"
#include "CommunityPage.xaml.h"

#if __has_include("CommunityPage.g.cpp")
#include "CommunityPage.g.cpp"
#endif

#include <shellapi.h>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        void OpenUrl(wchar_t const* url)
        {
            auto result = reinterpret_cast<INT_PTR>(
                ShellExecuteW(nullptr, L"open", url, nullptr, nullptr, SW_SHOWNORMAL));
            if (result <= 32) throw hresult_error(HRESULT_FROM_WIN32(ERROR_OPEN_FAILED), L"无法打开系统浏览器");
        }
    }

    CommunityPage::CommunityPage()
    {
        InitializeComponent();
    }

    void CommunityPage::OnOpenIssues(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/SurveyController/SurveyController/issues/new");
    }

    void CommunityPage::OnOpenLicense(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/SurveyController/SurveyController/blob/main/LICENSE");
    }
}
