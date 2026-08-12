#pragma once
#include "MorePage.g.h"

namespace winrt::SurveyController::App::implementation
{
    struct MorePage : MorePageT<MorePage>
    {
        MorePage();
        void OnOpenDownload(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnCheckUpdate(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnOpenDocs(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnOpenTerms(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnPageSizeChanged(IInspectable const&, Microsoft::UI::Xaml::SizeChangedEventArgs const&);
    private:
        hstring m_downloadUrl{ L"https://dl.hungrym0.com/SurveyController_latest_setup.exe" };
        bool m_layoutReady{};
    };
}
namespace winrt::SurveyController::App::factory_implementation
{
    struct MorePage : MorePageT<MorePage, implementation::MorePage> {};
}
