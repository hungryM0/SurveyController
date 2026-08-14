#pragma once

#include "SettingsPage.g.h"

namespace winrt::SurveyController::App::implementation
{
    struct SettingsPage : SettingsPageT<SettingsPage>
    {
        SettingsPage();
        void OnSettingToggled(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnSettingSelectionChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnReset(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnChooseDirectory(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        Windows::Data::Json::JsonObject m_settings{ nullptr };
        bool m_loadingSettings{ true };
        void LoadSettings(winrt::hstring const& json);
        winrt::hstring BuildSaveRequest();
        void SaveSettings();
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct SettingsPage : SettingsPageT<SettingsPage, implementation::SettingsPage> {};
}
