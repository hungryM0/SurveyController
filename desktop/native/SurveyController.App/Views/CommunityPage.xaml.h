#pragma once

#include "CommunityPage.g.h"

namespace winrt::SurveyController::App::implementation
{
    struct CommunityPage : CommunityPageT<CommunityPage>
    {
        CommunityPage();
        winrt::fire_and_forget OnOpenQr(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenContact(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenRepository(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenLicense(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        winrt::fire_and_forget LoadCommunityStatus();
    };
}
namespace winrt::SurveyController::App::factory_implementation
{
    struct CommunityPage : CommunityPageT<CommunityPage, implementation::CommunityPage> {};
}
