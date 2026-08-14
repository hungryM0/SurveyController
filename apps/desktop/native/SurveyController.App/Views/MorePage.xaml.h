#pragma once
#include "MorePage.g.h"

namespace winrt::SurveyController::App::implementation
{
    struct MorePage : MorePageT<MorePage>
    {
        MorePage();
        winrt::fire_and_forget OnOpenDownload(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnCheckUpdate(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenDocs(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenTerms(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    private:
        hstring m_downloadUrl{ L"https://dl.hungrym0.com/SurveyController_latest_setup.exe" };
    };
}
namespace winrt::SurveyController::App::factory_implementation
{
    struct MorePage : MorePageT<MorePage, implementation::MorePage> {};
}
