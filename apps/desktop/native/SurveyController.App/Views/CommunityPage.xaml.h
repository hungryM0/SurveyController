#pragma once
#include "CommunityPage.g.h"

namespace winrt::SurveyController::App::implementation
{
    struct CommunityPage : CommunityPageT<CommunityPage>
    {
        CommunityPage();
        void OnOpenIssues(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnOpenLicense(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnPageSizeChanged(IInspectable const&, Microsoft::UI::Xaml::SizeChangedEventArgs const&);
    private:
        bool m_layoutReady{};
    };
}
namespace winrt::SurveyController::App::factory_implementation
{
    struct CommunityPage : CommunityPageT<CommunityPage, implementation::CommunityPage> {};
}
