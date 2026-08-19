#pragma once
#include "MorePage.g.h"

namespace winrt::SurveyController::App::implementation
{
    struct MorePage : MorePageT<MorePage>
    {
        MorePage();
        Windows::Foundation::Collections::IObservableVector<SurveyController::App::IPUsageRow> UsageItems() const;
        winrt::fire_and_forget OnOpenDownload(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnCheckUpdate(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenRepository(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenLicense(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenChangelog(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenTutorial(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenDonation(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnLoadIPUsage(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenTerms(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenContributor1(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenContributor2(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenContributor3(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenContributor4(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenContributor5(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnOpenContributor6(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        winrt::fire_and_forget LoadIPUsage();
        hstring m_downloadUrl{ L"https://dl.hungrym0.com/SurveyController_latest_setup.exe" };
        bool m_checkingUpdate{};
        bool m_loadingUsage{};
        Windows::Foundation::Collections::IObservableVector<SurveyController::App::IPUsageRow> m_usageItems{
            winrt::single_threaded_observable_vector<SurveyController::App::IPUsageRow>() };
    };
}
namespace winrt::SurveyController::App::factory_implementation
{
    struct MorePage : MorePageT<MorePage, implementation::MorePage> {};
}
